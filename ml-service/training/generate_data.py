"""
Synthetic bank-transaction generator.

Real bank statements cannot be shared, so the training data is simulated.
The simulation is built to look like Indian bank / UPI statements:

- 60 users with different incomes and spending habits, 24 months each (2024-01 .. 2025-12)
- 10 spending categories, ~90 merchants, messy bank-style descriptions
  ("UPI/412233/SWIGGY/swiggy@icici", "POS 4521XX ZOMATO GURGAON", ...)
- monthly seasonality (Diwali shopping in Oct/Nov, December travel) and slow trends
- ~1% injected anomalies (very large amounts, odd hours, unusual merchants),
  labelled only so that the unsupervised Isolation Forest can be *evaluated*

Outputs
    data/transactions.csv        training data for all three models
    ../server/seed/demo_transactions.json   one extra user, used to seed the web app

Run:  python -m training.generate_data
"""

from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
N_USERS = 60
START, END = "2024-01-01", "2025-12-31"

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SEED_DIR = ROOT.parent / "server" / "seed"

# category -> (merchants, mean txns per month, median amount in INR, lognormal sigma)
CATEGORIES = {
    "Food & Dining": (
        ["Swiggy", "Zomato", "Dominos Pizza", "McDonalds", "Starbucks", "Haldirams",
         "Chaayos", "KFC", "Burger King", "Third Wave Coffee"],
        14, 350, 0.55),
    "Groceries": (
        ["BigBasket", "Blinkit", "Zepto", "DMart", "Reliance Fresh", "Swiggy Instamart",
         "More Supermarket", "Nature's Basket", "JioMart"],
        8, 900, 0.6),
    "Transport": (
        ["Uber", "Ola", "Rapido", "Indian Oil", "HP Petrol Pump", "Bharat Petroleum",
         "Delhi Metro", "FASTag", "Namma Yatri"],
        12, 280, 0.7),
    "Shopping": (
        ["Amazon", "Flipkart", "Myntra", "Ajio", "Nykaa", "Decathlon", "Croma",
         "Reliance Digital", "Lifestyle", "Meesho"],
        4, 1800, 0.9),
    "Bills & Utilities": (
        ["Airtel", "Jio Recharge", "Vi Recharge", "Tata Power", "BESCOM", "MGVCL Electricity",
         "Mahanagar Gas", "ACT Fibernet", "Tata Play"],
        4, 900, 0.5),
    "Entertainment": (
        ["Netflix", "Spotify", "BookMyShow", "Amazon Prime", "Disney Hotstar", "PVR Cinemas",
         "Steam", "Sony LIV"],
        3, 450, 0.6),
    "Health & Fitness": (
        ["Apollo Pharmacy", "PharmEasy", "1mg", "Cult Fit", "Practo", "MedPlus",
         "Netmeds", "Gold's Gym"],
        2, 700, 0.8),
    "Travel": (
        ["IRCTC", "MakeMyTrip", "IndiGo", "Air India", "Goibibo", "OYO Rooms",
         "Cleartrip", "RedBus"],
        0.8, 4500, 0.8),
    "Education": (
        ["Coursera", "Udemy", "Unacademy", "BYJUS", "Physics Wallah", "Sapna Book House",
         "Crossword Books"],
        0.7, 1500, 0.8),
    "Housing": (
        ["NoBroker", "Urban Company", "Pepperfry", "Home Centre", "IKEA", "Housejoy"],
        0.6, 2500, 0.7),
}
CATEGORY_NAMES = list(CATEGORIES)

# Month-of-year multipliers per category (Diwali shopping, December travel, ...)
SEASONALITY = {
    "Shopping": {10: 1.8, 11: 1.6, 1: 1.1, 8: 1.2},
    "Travel": {5: 1.6, 6: 1.4, 12: 1.9, 10: 1.3},
    "Food & Dining": {12: 1.25, 10: 1.15},
    "Bills & Utilities": {4: 1.25, 5: 1.35, 6: 1.25},   # summer AC electricity
    "Education": {6: 1.8, 7: 1.6, 1: 1.3},
    "Health & Fitness": {1: 1.4, 7: 1.2},
}

# Small local shops: random owner/brand name + a category keyword ("SHREE GANESH KIRANA").
# Every user gets their own local shops, so the categorizer must learn the KEYWORDS,
# not memorise merchant names.
LOCAL_PREFIX = ["Shree Ganesh", "Jai Ambe", "Balaji", "Sai", "Patel", "Sharma", "Krishna",
                "New", "Royal", "Om", "Mahalaxmi", "Gurukrupa", "Shiv Shakti", "Laxmi",
                "Annapurna", "Raj", "Hari Om", "Bharat", "Star", "City", "Jalaram", "Umiya",
                "Khodiyar", "Navkar", "Siddhi Vinayak", "Ashirwad", "Prince", "Galaxy"]
LOCAL_SUFFIX = {
    "Food & Dining": ["Restaurant", "Cafe", "Dhaba", "Sweets", "Bhojanalay", "Fast Food",
                      "Kitchen", "Bakery", "Pav Bhaji Centre"],
    "Groceries": ["Kirana", "General Stores", "Provision Store", "Supermarket", "Dairy",
                  "Vegetables", "Grocery Mart"],
    "Transport": ["Fuels", "Petroleum", "Auto Service", "Petrol Pump", "Car Wash", "Tyres",
                  "Motors Service"],
    "Shopping": ["Fashion", "Garments", "Footwear", "Electronics", "Mobile Shop",
                 "Collection", "Textiles"],
    "Bills & Utilities": ["Gas Agency", "Broadband", "Telecom", "Water Works", "Cable Network"],
    "Entertainment": ["Cinema", "Gaming Zone", "Multiplex", "Bowling", "Fun World"],
    "Health & Fitness": ["Medical", "Pharmacy", "Clinic", "Hospital", "Diagnostics",
                         "Pathology Lab", "Fitness Club"],
    "Travel": ["Travels", "Tours", "Hotel", "Resort", "Holidays"],
    "Education": ["Classes", "Academy", "Book Depot", "Tuition", "Coaching", "Stationers"],
    "Housing": ["Furniture", "Hardware", "Plumbing", "Interiors", "Electricals"],
}
# Person-to-person UPI payments: the text says nothing about the category,
# so these are ambiguous on purpose and the categorizer cannot reach 100% accuracy.
PERSON_NAMES = ["Rahul Kumar", "Amit Shah", "Priya Patel", "Ramesh Bhai", "Suresh Yadav",
                "Neha Singh", "Vikas Mehta", "Kiran Desai", "Manoj Gupta", "Pooja Joshi",
                "Ravi Verma", "Sunil Rana", "Anita Rao", "Deepak Jain"]

CITIES = ["MUMBAI", "BANGALORE", "DELHI", "PUNE", "VADODARA", "HYDERABAD", "GURGAON", "CHENNAI"]
BANKS = ["okicici", "oksbi", "ybl", "paytm", "axl", "okhdfcbank"]

# Rare / suspicious merchants that only appear in injected anomalies
ANOMALY_MERCHANTS = [
    ("Shopping", "Unknown Electronics Store"),
    ("Shopping", "International Online Store"),
    ("Entertainment", "Online Gaming Wallet"),
    ("Travel", "Foreign Airline Booking"),
    ("Shopping", "Gift Card Exchange"),
]


def make_description(merchant, rng):
    """Turn a clean merchant name into a messy bank-statement narration."""
    m_upper = merchant.upper()
    m_compact = m_upper.replace(" ", "").replace("'", "")
    ref = rng.integers(100000, 999999)
    city = rng.choice(CITIES)
    style = rng.integers(0, 6)
    if style == 0:
        return f"UPI/{ref}{rng.integers(1000, 9999)}/{m_compact}/{m_compact.lower()[:10]}@{rng.choice(BANKS)}/Payment"
    if style == 1:
        return f"POS {rng.integers(4000, 4999)}XXXXXX{rng.integers(1000, 9999)} {m_upper} {city}"
    if style == 2:
        return f"{m_upper}*ORDER {ref}"
    if style == 3:
        return f"ACH D- {m_upper} {city} {ref}"
    if style == 4:
        return f"{merchant} {city.title()}"
    return f"IMPS-{ref}-{m_compact[:12]}-{city[:3]}"


def random_hour(category, rng):
    """Hour of day; food peaks at lunch/dinner, bills during office hours."""
    if category == "Food & Dining":
        return int(rng.choice([12, 13, 14, 19, 20, 21, 22, 23, 9, 10]))
    if category == "Bills & Utilities":
        return int(rng.integers(9, 19))
    return int(np.clip(rng.normal(15, 3.5), 7, 23))


def local_merchant(category, rng):
    return f"{rng.choice(LOCAL_PREFIX)} {rng.choice(LOCAL_SUFFIX[category])}"


def recurring_payments(income_scale, rng):
    """Fixed monthly payments: rent, phone, subscriptions, (merchant, category, amount, day)."""
    items = [(str(rng.choice(["Airtel", "Jio Recharge", "Vi Recharge"])), "Bills & Utilities",
              float(rng.choice([299, 399, 499, 599, 749])), int(rng.integers(1, 28)))]
    if rng.random() < 0.7:          # renters
        items.append(("Rent Payment", "Housing", round(12000 * income_scale * rng.uniform(0.8, 1.6), -2),
                      int(rng.integers(1, 6))))
    for merchant, price in [("Netflix", 649), ("Spotify", 119), ("Amazon Prime", 299),
                            ("Disney Hotstar", 299), ("Cult Fit", 1499)]:
        if rng.random() < 0.35:
            cat = "Health & Fitness" if merchant == "Cult Fit" else "Entertainment"
            items.append((merchant, cat, float(price), int(rng.integers(1, 28))))
    return items


def simulate_user(user_id, rng, start=START, end=END):
    income_scale = rng.lognormal(0, 0.35)                      # rich vs frugal user
    preference = {c: rng.lognormal(0, 0.35) for c in CATEGORY_NAMES}
    trend = rng.normal(0.004, 0.006)                           # monthly growth of spending
    favourite = {c: rng.choice(m, size=min(4, len(m)), replace=False)
                 for c, (m, *_rest) in CATEGORIES.items()}     # each user has favourite merchants
    locals_ = {c: [local_merchant(c, rng) for _ in range(int(rng.integers(1, 4)))]
               for c in CATEGORY_NAMES}                        # each user's neighbourhood shops
    recurring = recurring_payments(income_scale, rng)

    rows = []
    months = pd.period_range(start, end, freq="M")
    for i, month in enumerate(months):
        growth = (1 + trend) ** i
        days = month.days_in_month
        for merchant, cat, amount, day in recurring:
            ts = pd.Timestamp(year=month.year, month=month.month, day=min(day, days),
                              hour=int(rng.integers(8, 12)), minute=int(rng.integers(0, 60)))
            rows.append((user_id, ts, merchant, "brand", make_description(merchant, rng),
                         amount, cat, 0))
        for cat, (merchants, freq, median, sigma) in CATEGORIES.items():
            season = SEASONALITY.get(cat, {}).get(month.month, 1.0)
            n = rng.poisson(freq * preference[cat] * season)
            for _ in range(n):
                r = rng.random()
                if r < 0.05:                       # paid a person directly over UPI
                    merchant, merchant_type = str(rng.choice(PERSON_NAMES)), "person"
                elif r < 0.35:                     # local shop
                    merchant, merchant_type = str(rng.choice(locals_[cat])), "local"
                elif r < 0.80:                     # favourite brand
                    merchant, merchant_type = str(rng.choice(favourite[cat])), "brand"
                else:
                    merchant, merchant_type = str(rng.choice(merchants)), "brand"
                amount = rng.lognormal(np.log(median * income_scale * growth), sigma)
                ts = pd.Timestamp(year=month.year, month=month.month,
                                  day=int(rng.integers(1, days + 1)),
                                  hour=random_hour(cat, rng), minute=int(rng.integers(0, 60)))
                rows.append((user_id, ts, merchant, merchant_type, make_description(merchant, rng),
                             round(float(amount), 2), cat, 0))

    df = pd.DataFrame(rows, columns=["user_id", "timestamp", "merchant", "merchant_type",
                                     "description", "amount", "category", "is_anomaly"])
    return inject_anomalies(df, rng)


def inject_anomalies(df, rng, rate=0.01):
    """Make ~1% of a user's transactions look fraudulent (labels used only for evaluation)."""
    n = max(1, int(len(df) * rate))
    idx = rng.choice(df.index, size=n, replace=False)
    user_median = df["amount"].median()
    for i in idx:
        kind = rng.integers(0, 3)
        if kind == 0:     # huge amount at a normal merchant
            df.loc[i, "amount"] = round(float(df.loc[i, "amount"] * rng.uniform(8, 25)), 2)
        elif kind == 1:   # odd hour + large amount
            df.loc[i, "timestamp"] = df.loc[i, "timestamp"].replace(hour=int(rng.integers(1, 5)))
            df.loc[i, "amount"] = round(float(user_median * rng.uniform(10, 40)), 2)
        else:             # unseen suspicious merchant, large amount, late night
            cat, merchant = ANOMALY_MERCHANTS[rng.integers(0, len(ANOMALY_MERCHANTS))]
            df.loc[i, ["merchant", "merchant_type", "category"]] = [merchant, "suspicious", cat]
            df.loc[i, "description"] = make_description(merchant, rng)
            df.loc[i, "timestamp"] = df.loc[i, "timestamp"].replace(hour=int(rng.integers(0, 5)))
            df.loc[i, "amount"] = round(float(user_median * rng.uniform(15, 50)), 2)
        df.loc[i, "is_anomaly"] = 1
    return df


def main():
    rng = np.random.default_rng(SEED)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SEED_DIR.mkdir(parents=True, exist_ok=True)

    users = [simulate_user(f"U{u:03d}", rng) for u in range(N_USERS)]
    df = pd.concat(users).sort_values(["user_id", "timestamp"]).reset_index(drop=True)
    df.to_csv(DATA_DIR / "transactions.csv", index=False)

    # Demo user for the web app (12 months, never seen in training).
    # The seed script shifts these dates so the last month is the current month.
    demo = simulate_user("DEMO", np.random.default_rng(7), start="2025-01-01", end="2025-12-31")
    demo = demo.drop(columns=["user_id", "merchant_type", "category", "is_anomaly"])
    demo["timestamp"] = demo["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:00")
    demo.to_json(SEED_DIR / "demo_transactions.json", orient="records", indent=1)

    print(f"transactions.csv : {len(df):,} rows, {df['user_id'].nunique()} users, "
          f"{df['is_anomaly'].mean():.2%} anomalies")
    print(df["category"].value_counts().to_string())
    print(f"demo_transactions.json : {len(demo):,} rows")


if __name__ == "__main__":
    main()

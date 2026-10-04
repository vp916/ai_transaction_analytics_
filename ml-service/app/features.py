"""
Feature engineering shared by training and the API.

Keeping these functions in one module guarantees that the model sees exactly
the same features at serving time as it did during training.
"""

import re

import numpy as np
import pandas as pd

# ---------------------------------------------------------------- categorizer

_NOISE = re.compile(r"[^a-z ]+")


def clean_text(text: str) -> str:
    """Lower-case a bank narration and strip digits / symbols.

    "UPI/4122331234/SWIGGY/swiggy@ybl/Payment" -> "upi swiggy swiggy ybl payment"
    Reference numbers carry no information about the category, so they are removed.
    """
    text = _NOISE.sub(" ", str(text).lower())
    return " ".join(text.split())


# ---------------------------------------------------------------- anomaly detection

ANOMALY_FEATURES = [
    "log_amount",        # how big is the payment
    "amount_vs_user",    # log(amount / user's median amount)
    "amount_vs_cat",     # log(amount / user's median amount in this category)
    "hour_sin", "hour_cos",
    "is_night",          # 00:00 - 05:59
    "cat_share",         # how often this user spends in this category (rare = suspicious)
    "merchant_seen",     # how many times this user has paid this merchant before
]


def anomaly_features(df: pd.DataFrame) -> pd.DataFrame:
    """Per-transaction features, each one relative to the *same user's* own history.

    `df` needs: user_id, amount, category, merchant, timestamp.
    A ₹20,000 payment is normal for one user and very unusual for another,
    so amounts are compared with the user's own medians instead of global numbers.
    """
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    amount = df["amount"].clip(lower=1.0)

    user_med = df.groupby("user_id")["amount"].transform("median").clip(lower=1.0)
    cat_med = df.groupby(["user_id", "category"])["amount"].transform("median").clip(lower=1.0)
    user_n = df.groupby("user_id")["amount"].transform("size")
    cat_n = df.groupby(["user_id", "category"])["amount"].transform("size")
    merchant_n = df.groupby(["user_id", "merchant"])["amount"].transform("size")

    hour = df["timestamp"].dt.hour
    out = pd.DataFrame(index=df.index)
    out["log_amount"] = np.log1p(amount)
    out["amount_vs_user"] = np.log(amount / user_med)
    out["amount_vs_cat"] = np.log(amount / cat_med)
    out["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    out["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    out["is_night"] = (hour < 6).astype(int)
    out["cat_share"] = cat_n / user_n
    out["merchant_seen"] = np.log1p(merchant_n - 1)
    return out[ANOMALY_FEATURES]


# ---------------------------------------------------------------- spending forecast

FORECAST_FEATURES = [
    # every spend value is divided by the user's last-3-month mean ("scale"),
    # so one model works for users who spend 15k and users who spend 80k a month
    "lag_1", "lag_2", "lag_3",        # spend 1, 2, 3 months ago / scale
    "roll_std_3",                     # volatility of the last 3 months / scale
    "roll_mean_6",                    # longer-term average / scale
    "lag_12",                         # same month last year / scale (yearly seasonality)
    "log_scale",                      # overall spending level
    "month_sin", "month_cos",         # month of the target month
    "is_festive",                     # Oct / Nov / Dec
]


def monthly_totals(df: pd.DataFrame) -> pd.DataFrame:
    """Transactions -> one row per (user, month) with total spend; missing months = 0."""
    df = df.copy()
    df["month"] = pd.to_datetime(df["timestamp"]).dt.to_period("M")
    totals = df.groupby(["user_id", "month"])["amount"].sum()
    full = []
    for user, s in totals.groupby(level=0):
        s = s.droplevel(0)
        idx = pd.period_range(s.index.min(), s.index.max(), freq="M")
        s = s.reindex(idx, fill_value=0.0)
        full.append(pd.DataFrame({"user_id": user, "month": idx, "total": s.values}))
    return pd.concat(full, ignore_index=True)


def forecast_features(history: list[float], target_month: int) -> dict:
    """Features for predicting NEXT month's spend from past monthly totals (oldest first).

    Returns the feature dict plus "scale"; the model predicts next_month / scale.
    """
    h = np.asarray(history, dtype=float)
    scale = max(h[-3:].mean(), 1.0)
    return {
        "lag_1": h[-1] / scale,
        "lag_2": (h[-2] if len(h) >= 2 else h[-1]) / scale,
        "lag_3": (h[-3] if len(h) >= 3 else h[-1]) / scale,
        "roll_std_3": h[-3:].std() / scale,
        "roll_mean_6": h[-6:].mean() / scale,
        "lag_12": (h[-12] if len(h) >= 12 else scale) / scale,
        "log_scale": np.log(scale),
        "month_sin": np.sin(2 * np.pi * target_month / 12),
        "month_cos": np.cos(2 * np.pi * target_month / 12),
        "is_festive": int(target_month in (10, 11, 12)),
        "scale": scale,
    }


def forecast_dataset(totals: pd.DataFrame, min_history: int = 3) -> pd.DataFrame:
    """Sliding window over every user's monthly series -> supervised (features, target) rows."""
    rows = []
    for user, g in totals.groupby("user_id"):
        values = g["total"].tolist()
        months = g["month"].tolist()
        for t in range(min_history, len(values)):
            feats = forecast_features(values[:t], months[t].month)
            feats.update(user_id=user, month=months[t], target=values[t])
            rows.append(feats)
    return pd.DataFrame(rows)

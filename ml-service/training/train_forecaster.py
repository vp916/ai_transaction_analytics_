"""
Model 3: MONTHLY SPENDING FORECAST
Spending of the last months  ->  spending next month

Method: Random Forest and XGBoost regressors on "lag" features; the better one is saved.
Run:    python -m training.train_forecaster
"""

import json

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error
from xgboost import XGBRegressor

from app.features import FORECAST_FEATURES, forecast_dataset, monthly_totals

SEED = 42

# ---------------------------------------------------------------- 1. monthly totals per user
df = pd.read_csv("data/transactions.csv", parse_dates=["timestamp"])
df = df[df["is_anomaly"] == 0]          # fraud is not the user's real spending

totals = monthly_totals(df)             # one row per (user, month)
print(totals.head())

# ---------------------------------------------------------------- 2. turn it into a table
# For every user and month t:  features from months before t  ->  target = spend in month t
# Features: spend 1, 2, 3 months ago, 6-month average, same month last year, month of year ...
# All amounts are divided by the user's recent 3-month average ("scale"), so the model
# predicts a ratio like 1.10 ("10% more than usual") and works for rich and frugal users.
data = forecast_dataset(totals)
data["ratio"] = data["target"] / data["scale"]
print(data[FORECAST_FEATURES + ["target"]].head())

# ---------------------------------------------------------------- 3. split by TIME
# Train on the past, test on the future (Jul-Dec 2025).
# A random split would let the model peek at future months.
cutoff = pd.Period("2025-07", freq="M")
train = data[data["month"] < cutoff]
test = data[data["month"] >= cutoff]
print("train rows:", len(train), "| test rows:", len(test))


# ---------------------------------------------------------------- 4. baselines + models
def evaluate(predicted_amount):
    return {
        "mae": mean_absolute_error(test["target"], predicted_amount),           # average error in ₹
        "mape": mean_absolute_percentage_error(test["target"], predicted_amount),  # average error in %
    }


results = {}
# simple baselines that any model must beat
results["baseline_last_month"] = evaluate(test["lag_1"] * test["scale"])
results["baseline_3month_average"] = evaluate(test["scale"])

# monthly spending is noisy, so both models are kept small to avoid overfitting
models = {
    "random_forest": RandomForestRegressor(n_estimators=400, min_samples_leaf=50, max_features=0.5,
                                           random_state=SEED, n_jobs=-1),
    "xgboost": XGBRegressor(n_estimators=300, learning_rate=0.03, max_depth=2, min_child_weight=10,
                            subsample=0.8, random_state=SEED),
}
for name, model in models.items():
    model.fit(train[FORECAST_FEATURES], train["ratio"])
    predicted_ratio = model.predict(test[FORECAST_FEATURES])
    results[name] = evaluate(predicted_ratio * test["scale"])

print("\nresults on Jul-Dec 2025")
for name, r in results.items():
    print(f"  {name:25s} MAE = ₹{r['mae']:,.0f}   MAPE = {r['mape']:.1%}")

# ---------------------------------------------------------------- 5. keep the better model
best_name = min(models, key=lambda name: results[name]["mae"])
print("\nbest model:", best_name)

final_model = models[best_name]
final_model.fit(data[FORECAST_FEATURES], data["ratio"])          # retrain on all months
joblib.dump({"model": final_model, "name": best_name}, "models/forecaster.joblib")

with open("models/forecaster_metrics.json", "w") as f:
    json.dump({"results": results, "best_model": best_name}, f, indent=2, default=float)
print("saved models/forecaster.joblib")

"""
Model 2: ANOMALY (FRAUD) DETECTOR
One transaction  ->  "normal" or "unusual" + a score

Method: Isolation Forest (unsupervised: it never sees the fraud labels while training).
Run:    python -m training.train_anomaly
"""

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score

from app.features import anomaly_features

SEED = 42

# ---------------------------------------------------------------- 1. load data + features
df = pd.read_csv("data/transactions.csv", parse_dates=["timestamp"])

# Each feature compares a payment with the SAME user's normal behaviour
# (amount vs their usual amount, hour of day, how often they use this category / merchant).
X = anomaly_features(df)
y = df["is_anomaly"]          # only used to MEASURE the model, never to train it
print("transactions:", len(df), "| real anomaly rate:", round(y.mean(), 4))
print(X.head())


# ---------------------------------------------------------------- 2. split by USER
# 80% of users for training, 20% of users only for testing,
# so we check the model on customers it has never seen.
rng = np.random.default_rng(SEED)
users = df["user_id"].unique()
test_users = rng.choice(users, size=len(users) // 5, replace=False)
is_test = df["user_id"].isin(test_users)


# ---------------------------------------------------------------- 3. train
# Isolation Forest builds many random trees that keep splitting the data.
# Unusual points are easy to separate, so they end up alone after only a few splits.
# contamination=0.01 -> we expect about 1% of payments to be unusual.
model = IsolationForest(n_estimators=300, contamination=0.01, random_state=SEED, n_jobs=-1)
model.fit(X[~is_test])


# ---------------------------------------------------------------- 4. evaluate on unseen users
X_test, y_test = X[is_test], y[is_test]
flagged = model.predict(X_test) == -1          # -1 means "anomaly"
score = -model.score_samples(X_test)           # higher = more unusual

metrics = {
    "precision": precision_score(y_test, flagged),   # of flagged payments, how many were fraud
    "recall": recall_score(y_test, flagged),         # of fraud payments, how many we flagged
    "f1": f1_score(y_test, flagged),
    "roc_auc": roc_auc_score(y_test, score),         # how well the score ranks fraud above normal
    "flag_rate": flagged.mean(),
}
print("\nresults on unseen users")
for name, value in metrics.items():
    print(f"  {name:10s} {value:.3f}")


# ---------------------------------------------------------------- 5. final model on ALL users
final_model = IsolationForest(n_estimators=300, contamination=0.01, random_state=SEED, n_jobs=-1)
final_model.fit(X)
joblib.dump(final_model, "models/anomaly.joblib")

with open("models/anomaly_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2, default=float)
print("\nsaved models/anomaly.joblib")

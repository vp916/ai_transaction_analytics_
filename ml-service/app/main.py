"""
ML microservice (FastAPI).

The Express backend calls these endpoints over HTTP; the browser never talks to it directly.

    GET  /health        is the service up + which models are loaded
    GET  /metrics       evaluation metrics written by training/train.py
    POST /categorize    bank narration text  -> spending category
    POST /anomaly       a user's transactions -> anomaly score per transaction
    POST /forecast      past monthly totals   -> next month's predicted spend

Run:  uvicorn app.main:app --reload --port 8000     (docs at http://localhost:8000/docs)
"""

import json
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException

from app.features import FORECAST_FEATURES, anomaly_features, clean_text, forecast_features
from app.schemas import (AnomalyRequest, AnomalyResponse, AnomalyResult, CategorizeRequest,
                         CategorizeResponse, CategoryPrediction, ForecastRequest,
                         ForecastResponse)

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
models = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load every model ONCE at startup, not on every request.
    models["categorizer"] = joblib.load(MODELS_DIR / "categorizer.joblib")
    models["anomaly"] = joblib.load(MODELS_DIR / "anomaly.joblib")
    models["forecaster"] = joblib.load(MODELS_DIR / "forecaster.joblib")
    models["metrics"] = {
        name: json.loads((MODELS_DIR / f"{name}_metrics.json").read_text())
        for name in ["categorizer", "anomaly", "forecaster"]
    }
    yield
    models.clear()


app = FastAPI(title="Transaction ML Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "models": [k for k in models if k != "metrics"]}


@app.get("/metrics")
def metrics():
    return models["metrics"]


# ------------------------------------------------------------------ categorize
@app.post("/categorize", response_model=CategorizeResponse)
def categorize(req: CategorizeRequest):
    pipe = models["categorizer"]
    probs = pipe.predict_proba([clean_text(d) for d in req.descriptions])
    classes = pipe.classes_
    out = []
    for desc, p in zip(req.descriptions, probs):
        order = np.argsort(p)[::-1][:3]
        out.append(CategoryPrediction(
            description=desc,
            category=classes[order[0]],
            confidence=round(float(p[order[0]]), 4),
            top3=[(classes[i], round(float(p[i]), 4)) for i in order],
        ))
    return CategorizeResponse(predictions=out)


# ------------------------------------------------------------------ anomaly
def explain(row) -> list[str]:
    """Human-readable reasons, so the dashboard can say WHY something was flagged."""
    reasons = []
    if row["amount_vs_cat"] > np.log(5):
        reasons.append(f"{np.exp(row['amount_vs_cat']):.0f}x your usual amount for this category")
    elif row["amount_vs_user"] > np.log(8):
        reasons.append(f"{np.exp(row['amount_vs_user']):.0f}x your usual transaction amount")
    elif row["amount_vs_cat"] < np.log(1 / 5):
        reasons.append("much smaller than your usual amount for this category")
    if row["is_night"]:
        reasons.append("made between midnight and 6 AM")
    if row["merchant_seen"] == 0:
        reasons.append("first payment to this merchant")
    if row["cat_share"] < 0.02:
        reasons.append("category you rarely spend in")
    return reasons


@app.post("/anomaly", response_model=AnomalyResponse)
def anomaly(req: AnomalyRequest):
    forest = models["anomaly"]
    df = pd.DataFrame([t.model_dump() for t in req.transactions])
    df["user_id"] = "u"                      # all transactions belong to the same user
    X = anomaly_features(df)

    raw = -forest.score_samples(X)           # higher = easier to isolate = more unusual
    threshold = -forest.offset_              # cut-off learned from `contamination`
    is_anom = raw > threshold
    # squash to 0..1 for display; 0.5 corresponds to the decision threshold
    score01 = 1 / (1 + np.exp(-12 * (raw - threshold)))

    results = []
    for i, t in enumerate(req.transactions):
        results.append(AnomalyResult(
            id=t.id,
            anomaly_score=round(float(score01[i]), 4),
            is_anomaly=bool(is_anom[i]),
            reasons=explain(X.iloc[i]) if is_anom[i] else [],
        ))
    return AnomalyResponse(results=results)


# ------------------------------------------------------------------ forecast
@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    history = req.monthly_totals
    if sum(history) <= 0:
        raise HTTPException(400, "monthly_totals are all zero")
    if len(history) < 3:                       # too little history for the model
        return ForecastResponse(forecast=round(float(np.mean(history)), 2),
                                model="average", method="mean of available months")

    bundle = models["forecaster"]
    feats = forecast_features(history, req.target_month)
    X = pd.DataFrame([feats])[FORECAST_FEATURES]
    ratio = float(bundle["model"].predict(X)[0])
    return ForecastResponse(forecast=round(ratio * feats["scale"], 2),
                            model=bundle["name"],
                            method="predicted ratio to last-3-month average")

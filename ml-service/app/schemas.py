"""Request / response bodies for the ML API (validated automatically by FastAPI + Pydantic)."""

from datetime import datetime

from pydantic import BaseModel, Field


# ---------- categorize
class CategorizeRequest(BaseModel):
    descriptions: list[str] = Field(..., min_length=1, max_length=1000,
                                    examples=[["UPI/41223312/SWIGGY/swiggy@ybl/Payment"]])


class CategoryPrediction(BaseModel):
    description: str
    category: str
    confidence: float
    top3: list[tuple[str, float]]


class CategorizeResponse(BaseModel):
    predictions: list[CategoryPrediction]


# ---------- anomaly
class Transaction(BaseModel):
    id: str | None = None
    amount: float = Field(..., gt=0)
    category: str
    merchant: str
    timestamp: datetime


class AnomalyRequest(BaseModel):
    """All recent transactions of ONE user. Each one is scored against the others."""
    transactions: list[Transaction] = Field(..., min_length=1, max_length=5000)


class AnomalyResult(BaseModel):
    id: str | None
    anomaly_score: float      # 0..1, higher = more unusual
    is_anomaly: bool
    reasons: list[str]


class AnomalyResponse(BaseModel):
    results: list[AnomalyResult]


# ---------- forecast
class ForecastRequest(BaseModel):
    monthly_totals: list[float] = Field(..., min_length=1,
                                        description="past monthly spend, oldest first")
    target_month: int = Field(..., ge=1, le=12, description="calendar month being predicted")


class ForecastResponse(BaseModel):
    forecast: float
    model: str
    method: str

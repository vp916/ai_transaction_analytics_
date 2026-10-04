"""API tests. Run: pytest -q   (models must be trained first)"""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app


def client():
    return TestClient(app)


def test_health():
    with client() as c:
        r = c.get("/health")
        assert r.status_code == 200
        assert set(r.json()["models"]) == {"categorizer", "anomaly", "forecaster"}


def test_categorize_known_and_unseen_merchants():
    texts = ["UPI/412233/SWIGGY/swiggy@ybl/Payment",
             "POS 4521XXXXXX1234 UBER MUMBAI",
             "Navrang Medical Vadodara",            # local shop never seen in training
             "UPI/998877/JAYDEEPKIRANA/jaydeep@oksbi/Payment"]
    with client() as c:
        preds = c.post("/categorize", json={"descriptions": texts}).json()["predictions"]
    cats = [p["category"] for p in preds]
    assert cats[0] == "Food & Dining"
    assert cats[1] == "Transport"
    assert cats[2] == "Health & Fitness"
    assert cats[3] == "Groceries"
    assert all(0 <= p["confidence"] <= 1 and len(p["top3"]) == 3 for p in preds)


def test_anomaly_flags_obvious_fraud():
    base = datetime(2025, 5, 1, 13, 0)
    txns = [{"id": str(i), "amount": 300 + (i % 7) * 40, "category": "Food & Dining",
             "merchant": "Swiggy", "timestamp": (base + timedelta(days=i)).isoformat()}
            for i in range(60)]
    txns.append({"id": "fraud", "amount": 85000, "category": "Shopping",
                 "merchant": "Gift Card Exchange", "timestamp": "2025-06-30T03:12:00"})
    with client() as c:
        res = {r["id"]: r for r in c.post("/anomaly", json={"transactions": txns}).json()["results"]}
    assert res["fraud"]["is_anomaly"] is True
    assert res["fraud"]["anomaly_score"] > 0.5
    assert res["fraud"]["reasons"]
    assert sum(r["is_anomaly"] for r in res.values()) <= 5


def test_forecast():
    with client() as c:
        r = c.post("/forecast", json={"monthly_totals": [30000, 32000, 31000, 33000, 34000, 32500],
                                      "target_month": 10}).json()
        assert 20000 < r["forecast"] < 50000
        short = c.post("/forecast", json={"monthly_totals": [10000, 20000], "target_month": 3}).json()
        assert short["model"] == "average" and short["forecast"] == 15000


def test_validation_error():
    with client() as c:
        assert c.post("/categorize", json={"descriptions": []}).status_code == 422
        assert c.post("/forecast", json={"monthly_totals": [1], "target_month": 13}).status_code == 422

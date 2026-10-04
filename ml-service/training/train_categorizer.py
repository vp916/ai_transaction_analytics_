"""
Model 1: EXPENSE CATEGORIZER
Bank description text  ->  spending category

    "UPI/4122/SWIGGY/swiggy@ybl/Payment"  ->  "Food & Dining"

Method: TF-IDF features + Logistic Regression.
Run:    python -m training.train_categorizer
"""

import json

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline

from app.features import clean_text

SEED = 42

# ---------------------------------------------------------------- 1. load data
df = pd.read_csv("data/transactions.csv")
df = df[df["is_anomaly"] == 0]            # fraud rows use fake merchants, leave them out
texts = df["description"].apply(clean_text)
labels = df["category"]
print("transactions:", len(df))


# ---------------------------------------------------------------- 2. the model
def make_model():
    # TF-IDF turns text into numbers: each word / piece of a word gets a weight.
    # Two kinds of pieces are used together:
    #   - whole words      "swiggy", "medical", "kirana"
    #   - 2-5 letter parts "kira", "medic" -> still works for "SHREEGANESHKIRANA" (no spaces)
    text_features = FeatureUnion([
        ("words", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)),
        ("chars", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=2, sublinear_tf=True)),
    ])
    # Logistic Regression learns a weight per (piece, category) and outputs probabilities.
    # C=20 was the best of [1, 5, 20] in a 3-fold cross-validation.
    classifier = LogisticRegression(C=20, max_iter=2000, class_weight="balanced")
    return Pipeline([("tfidf", text_features), ("clf", classifier)])


# ---------------------------------------------------------------- 3. test 1: random split
# 80% train / 20% test, keeping the category mix the same in both
X_train, X_test, y_train, y_test = train_test_split(
    texts, labels, test_size=0.2, stratify=labels, random_state=SEED)

model = make_model()
model.fit(X_train, y_train)
pred = model.predict(X_test)

random_split = {
    "accuracy": accuracy_score(y_test, pred),
    "macro_f1": f1_score(y_test, pred, average="macro"),
}
print("\nTEST 1 - random split")
print(classification_report(y_test, pred, digits=3))


# ---------------------------------------------------------------- 4. test 2: unseen merchants
# In test 1 the same merchants appear in train and test, which is a bit easy.
# Here every merchant is EITHER in train OR in test (grouped split), so the model
# must handle merchants it has never seen.
splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
train_idx, test_idx = next(splitter.split(texts, labels, groups=df["merchant"]))

model2 = make_model()
model2.fit(texts.iloc[train_idx], labels.iloc[train_idx])
pred2 = model2.predict(texts.iloc[test_idx])

test_rows = df.iloc[test_idx]
correct = pred2 == labels.iloc[test_idx].values
local = (test_rows["merchant_type"] == "local").values      # e.g. "Sai Medical", "Patel Kirana"
brand = (test_rows["merchant_type"] == "brand").values      # e.g. "Zepto", "Nykaa"

unseen_split = {
    "accuracy": correct.mean(),
    "local_shop_accuracy": correct[local].mean(),   # name contains a category word -> learnable
    "brand_accuracy": correct[brand].mean(),        # a brand name alone says nothing -> hard
}
print("TEST 2 - merchants never seen in training")
for name, value in unseen_split.items():
    print(f"  {name:20s} {value:.3f}")


# ---------------------------------------------------------------- 5. final model on ALL data
final_model = make_model()
final_model.fit(texts, labels)
joblib.dump(final_model, "models/categorizer.joblib")

metrics = {"random_split": random_split, "unseen_merchant_split": unseen_split}
with open("models/categorizer_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2, default=float)
print("\nsaved models/categorizer.joblib")

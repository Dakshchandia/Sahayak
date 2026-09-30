"""
SAHAYAK — Experimental ML Training Script

PURPOSE:
    Trains an interpretable decision-tree baseline and a random-forest comparison model
    on the synthetic welfare indicator dataset.

IMPORTANT LIMITATIONS (must be understood before interpreting results):
    1. LABELS ARE SYNTHETIC: Labels come from the rule engine. Models learn the rules,
       not real-world welfare or mental health outcomes.
    2. NO CLINICAL VALIDITY: Accuracy metrics describe how well the model reproduces
       synthetic labels, not how well it predicts human welfare needs.
    3. SPLIT BY PERSON: Train/test split is by personnel ID to prevent data leakage
       (one person's observations should not span both sets).
    4. NOT FOR PRODUCTION: This pipeline requires independent clinical labels,
       domain expert review, calibration, and bias evaluation before any operational use.
    5. FEATURE GAPS: Missing wellness values (null) are imputed as -1.
       Production would need careful imputation strategy documented and reviewed.

USAGE:
    python generate_synthetic_data.py   # generates synthetic_personnel_data.csv
    pip install -r requirements.txt
    python train_model.py
"""

import pandas as pd
import numpy as np
import json
import os
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import (
    classification_report, confusion_matrix,
    precision_score, recall_score, f1_score, roc_auc_score
)
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import warnings
warnings.filterwarnings("ignore")

FEATURES = [
    "weekly_hours", "night_shifts", "consecutive_days",
    "deployment_days", "days_since_leave", "transfers_6m", "training_days_30",
    "sleep_hours", "fatigue", "perceived_workload", "has_wellness_consent",
]
TARGET = "label_elevated"
DATA_FILE = "synthetic_personnel_data.csv"
RESULTS_FILE = "evaluation_results.json"
MODELS_DIR = "models"


def load_and_prepare(path):
    df = pd.read_csv(path)

    # Fill missing wellness features with sentinel value
    # (missing = consent not given, so -1 indicates "not available")
    df["sleep_hours"] = df["sleep_hours"].fillna(-1)
    df["fatigue"] = df["fatigue"].fillna(-1)
    df["perceived_workload"] = df["perceived_workload"].fillna(-1)

    return df


def train_and_evaluate(df):
    X = df[FEATURES].values
    y = df[TARGET].values
    groups = df["person_id"].values

    # Split by person — prevents leakage
    gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
    train_idx, test_idx = next(gss.split(X, y, groups))

    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    print(f"\nTrain: {len(X_train)} observations ({y_train.sum()} elevated)")
    print(f"Test:  {len(X_test)} observations ({y_test.sum()} elevated)")
    print(f"Train persons: {len(set(groups[train_idx]))}, Test persons: {len(set(groups[test_idx]))}")

    results = {}

    # ── Model 1: Decision Tree (interpretable baseline) ────────────────────
    print("\n--- Decision Tree (interpretable baseline) ---")
    dt = DecisionTreeClassifier(max_depth=5, min_samples_leaf=10, random_state=42)
    dt.fit(X_train, y_train)
    dt_preds = dt.predict(X_test)
    dt_proba = dt.predict_proba(X_test)[:, 1]

    dt_report = classification_report(y_test, dt_preds, output_dict=True)
    print(classification_report(y_test, dt_preds, target_names=["not_elevated", "elevated"]))
    print("Confusion matrix:")
    print(confusion_matrix(y_test, dt_preds))

    # Print tree rules (top levels only)
    print("\nDecision tree rules (max depth 3 for readability):")
    dt_small = DecisionTreeClassifier(max_depth=3, min_samples_leaf=10, random_state=42)
    dt_small.fit(X_train, y_train)
    print(export_text(dt_small, feature_names=FEATURES, max_depth=3))

    results["decision_tree"] = {
        "precision_elevated": round(dt_report.get("1", {}).get("precision", 0), 3),
        "recall_elevated": round(dt_report.get("1", {}).get("recall", 0), 3),
        "f1_elevated": round(dt_report.get("1", {}).get("f1-score", 0), 3),
        "accuracy": round(dt_report.get("accuracy", 0), 3),
        "auc_roc": round(float(roc_auc_score(y_test, dt_proba)), 3),
        "confusion_matrix": confusion_matrix(y_test, dt_preds).tolist(),
    }

    # ── Model 2: Random Forest (comparison) ───────────────────────────────
    print("\n--- Random Forest (comparison model) ---")
    rf = RandomForestClassifier(n_estimators=100, max_depth=8, min_samples_leaf=5, random_state=42)
    rf.fit(X_train, y_train)
    rf_preds = rf.predict(X_test)
    rf_proba = rf.predict_proba(X_test)[:, 1]

    rf_report = classification_report(y_test, rf_preds, output_dict=True)
    print(classification_report(y_test, rf_preds, target_names=["not_elevated", "elevated"]))
    print("Confusion matrix:")
    print(confusion_matrix(y_test, rf_preds))

    # Feature importances
    print("\nFeature importances (Random Forest):")
    for feat, imp in sorted(zip(FEATURES, rf.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"  {feat:<30} {imp:.3f} {bar}")

    results["random_forest"] = {
        "precision_elevated": round(rf_report.get("1", {}).get("precision", 0), 3),
        "recall_elevated": round(rf_report.get("1", {}).get("recall", 0), 3),
        "f1_elevated": round(rf_report.get("1", {}).get("f1-score", 0), 3),
        "accuracy": round(rf_report.get("accuracy", 0), 3),
        "auc_roc": round(float(roc_auc_score(y_test, rf_proba)), 3),
        "confusion_matrix": confusion_matrix(y_test, rf_preds).tolist(),
        "feature_importances": {f: round(float(i), 4) for f, i in zip(FEATURES, rf.feature_importances_)},
    }

    # ── Key error cases ────────────────────────────────────────────────────
    print("\n--- Key error cases (RF) ---")
    false_negatives = X_test[(rf_preds == 0) & (y_test == 1)]
    false_positives = X_test[(rf_preds == 1) & (y_test == 0)]
    print(f"False negatives (elevated missed): {len(false_negatives)}")
    print(f"False positives (non-elevated flagged): {len(false_positives)}")
    print("These would represent cases the model fails to flag or over-flags in a welfare context.")

    results["error_analysis"] = {
        "false_negatives": len(false_negatives),
        "false_positives": len(false_positives),
        "note": "In a welfare context, false negatives (missed elevations) carry higher risk than false positives.",
    }

    results["metadata"] = {
        "label_source": "Rule engine (lib/domain.ts RULES_V1). Model learns rules, not real welfare outcomes.",
        "train_size": int(len(X_train)),
        "test_size": int(len(X_test)),
        "split_strategy": "Group shuffle split by person_id (no leakage)",
        "class_balance_train": f"{int(y_train.sum())}/{len(y_train)} elevated",
        "class_balance_test": f"{int(y_test.sum())}/{len(y_test)} elevated",
        "clinical_validity": "NOT validated. Results describe rule reproduction, not real-world effectiveness.",
        "generated_at": pd.Timestamp.now().isoformat(),
    }

    return results


def main():
    if not os.path.exists(DATA_FILE):
        print(f"ERROR: {DATA_FILE} not found. Run generate_synthetic_data.py first.")
        return

    print(f"Loading {DATA_FILE}...")
    df = load_and_prepare(DATA_FILE)
    print(f"Loaded {len(df)} rows, {df['person_id'].nunique()} unique personnel")
    print(f"Label balance: {df[TARGET].value_counts().to_dict()}")

    print("\n" + "="*60)
    print("REMINDER: These models learn synthetic rule labels.")
    print("High accuracy = good rule reproduction, NOT clinical validity.")
    print("="*60)

    results = train_and_evaluate(df)

    os.makedirs(MODELS_DIR, exist_ok=True)
    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults written to {RESULTS_FILE}")
    print("\n⚠  LIMITATIONS:")
    print("  - Labels are synthetic (rule-based). Model accuracy reflects rule learning.")
    print("  - High F1 does not indicate real-world welfare detection ability.")
    print("  - No clinical validation, bias evaluation, or real outcome data was used.")
    print("  - This pipeline is a TECHNICAL DEMONSTRATION only.")
    print("  - Contact a qualified researcher before any operational deployment.")


if __name__ == "__main__":
    main()

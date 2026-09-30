# SAHAYAK — Experimental ML Pipeline

> **Status: EXPERIMENTAL — disabled by default. Not used in production assessments.**

## What this is

An optional, isolated Python pipeline that demonstrates a machine-learning extension
to the rule-based welfare indicator engine. It is gated behind the `ENABLE_ML_FEATURES`
environment flag and produces no side-effects on the live application.

## What this is NOT

- Not a clinically validated model
- Not used for real welfare decisions
- Not a replacement for the rule engine
- Not evidence of real-world stress or burnout detection ability

## Honest limitations

| Limitation | Detail |
|---|---|
| Synthetic labels | Labels come from the rule engine. The model learns to reproduce rules, not detect welfare needs. |
| No clinical validation | Results are never tested against real welfare outcomes. |
| No outcome data | No ground-truth labels from qualified clinicians. |
| No bias evaluation | Subgroup performance (by rank, gender, unit type) not evaluated. |
| Missing data | Null wellness values imputed as -1 — a simplification that needs domain review. |

## Quick start

```bash
cd scripts/ml
python -m venv .venv
.venv/Scripts/activate   # Windows
source .venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
python generate_synthetic_data.py
python train_model.py
```

Outputs:
- `synthetic_personnel_data.csv` — 6,000 synthetic observations across 500 fictitious personnel
- `evaluation_results.json` — precision, recall, F1, AUC-ROC, confusion matrix, feature importances

## Interpreting results

High F1 (e.g., 0.95+) means the model learned to reproduce the rules very well.
It does NOT mean the model would correctly identify personnel in need of welfare support
in a real organisation.

If a model trained on rule-generated labels achieves near-perfect accuracy, that is expected —
it is learning the decision boundary of the rules themselves.

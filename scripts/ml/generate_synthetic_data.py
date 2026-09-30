"""
SAHAYAK — Synthetic Training Data Generator

PURPOSE:
    Generates reproducible longitudinal synthetic data for ML model training/evaluation.
    All data is entirely fabricated — no real personnel records are used.

IMPORTANT LIMITATIONS (read before interpreting results):
    - Labels are generated from the same rule engine used in the application
      (welfare_indicator_score >= elevated_threshold).
    - Any model trained on these labels primarily learns to reproduce the rule engine.
    - Its accuracy metrics do NOT indicate real-world stress or burnout detection ability.
    - This is a technical demonstration of the ML pipeline, not a validated clinical model.
    - A real deployment would require: representative data, independent clinical outcome labels,
      domain expert review, calibration, and subgroup evaluation.

USAGE:
    pip install -r requirements.txt
    python generate_synthetic_data.py
    # Outputs: synthetic_personnel_data.csv
"""

import random
import csv
import math
from datetime import datetime, timedelta

random.seed(42)

# Rule thresholds (mirrors lib/domain.ts RULES_V1)
THRESHOLDS = {
    "weekly_hours_high": 60, "weekly_hours_moderate": 48,
    "weekly_hours_high_pts": 20, "weekly_hours_moderate_pts": 10,
    "night_shifts_high": 8, "night_shifts_moderate": 5,
    "night_shifts_high_pts": 20, "night_shifts_moderate_pts": 10,
    "consecutive_days_high": 10, "consecutive_days_moderate": 6,
    "consecutive_days_high_pts": 15, "consecutive_days_moderate_pts": 8,
    "deployment_days_high": 45, "deployment_days_moderate": 20,
    "deployment_days_high_pts": 15, "deployment_days_moderate_pts": 8,
    "days_since_leave_high": 90, "days_since_leave_moderate": 60,
    "days_since_leave_high_pts": 15, "days_since_leave_moderate_pts": 7,
    "transfers_high": 2, "transfers_moderate": 1,
    "transfers_high_pts": 10, "transfers_moderate_pts": 5,
    "training_days_high": 20, "training_days_moderate": 10,
    "training_days_high_pts": 8, "training_days_moderate_pts": 4,
    "sleep_very_low": 4, "sleep_low": 5,
    "sleep_very_low_pts": 15, "sleep_low_pts": 8,
    "fatigue_high": 8, "fatigue_moderate": 6,
    "fatigue_high_pts": 15, "fatigue_moderate_pts": 8,
    "workload_high": 8, "workload_moderate": 6,
    "workload_high_pts": 10, "workload_moderate_pts": 5,
    "elevated_threshold": 55, "watch_threshold": 25,
}


def score_feature(value, high_thresh, moderate_thresh, high_pts, moderate_pts):
    if value > high_thresh:
        return high_pts
    elif value > moderate_thresh:
        return moderate_pts
    return 0


def calculate_score(row):
    """Mirrors the rule engine from lib/domain.ts"""
    s = 0
    s += score_feature(row["weekly_hours"], THRESHOLDS["weekly_hours_high"],
                       THRESHOLDS["weekly_hours_moderate"],
                       THRESHOLDS["weekly_hours_high_pts"], THRESHOLDS["weekly_hours_moderate_pts"])
    s += score_feature(row["night_shifts"], THRESHOLDS["night_shifts_high"],
                       THRESHOLDS["night_shifts_moderate"],
                       THRESHOLDS["night_shifts_high_pts"], THRESHOLDS["night_shifts_moderate_pts"])
    s += score_feature(row["consecutive_days"], THRESHOLDS["consecutive_days_high"],
                       THRESHOLDS["consecutive_days_moderate"],
                       THRESHOLDS["consecutive_days_high_pts"], THRESHOLDS["consecutive_days_moderate_pts"])
    s += score_feature(row["deployment_days"], THRESHOLDS["deployment_days_high"],
                       THRESHOLDS["deployment_days_moderate"],
                       THRESHOLDS["deployment_days_high_pts"], THRESHOLDS["deployment_days_moderate_pts"])
    s += score_feature(row["days_since_leave"], THRESHOLDS["days_since_leave_high"],
                       THRESHOLDS["days_since_leave_moderate"],
                       THRESHOLDS["days_since_leave_high_pts"], THRESHOLDS["days_since_leave_moderate_pts"])
    s += score_feature(row["transfers_6m"], THRESHOLDS["transfers_high"] - 1,
                       THRESHOLDS["transfers_moderate"] - 1,
                       THRESHOLDS["transfers_high_pts"], THRESHOLDS["transfers_moderate_pts"])
    s += score_feature(row["training_days_30"], THRESHOLDS["training_days_high"],
                       THRESHOLDS["training_days_moderate"],
                       THRESHOLDS["training_days_high_pts"], THRESHOLDS["training_days_moderate_pts"])

    # Wellness features (only if present = consent given)
    if row.get("sleep_hours") is not None:
        if row["sleep_hours"] < THRESHOLDS["sleep_very_low"]:
            s += THRESHOLDS["sleep_very_low_pts"]
        elif row["sleep_hours"] < THRESHOLDS["sleep_low"]:
            s += THRESHOLDS["sleep_low_pts"]

    if row.get("fatigue") is not None:
        s += score_feature(row["fatigue"], THRESHOLDS["fatigue_high"],
                           THRESHOLDS["fatigue_moderate"],
                           THRESHOLDS["fatigue_high_pts"], THRESHOLDS["fatigue_moderate_pts"])

    if row.get("perceived_workload") is not None:
        s += score_feature(row["perceived_workload"], THRESHOLDS["workload_high"],
                           THRESHOLDS["workload_moderate"],
                           THRESHOLDS["workload_high_pts"], THRESHOLDS["workload_moderate_pts"])

    return s


def generate_record(person_id, obs_index, base_date):
    """Generate a single observation with realistic variation."""
    # Introduce gradual drift — some personnel accumulate workload over time
    drift = obs_index * random.uniform(0, 0.5)

    weekly_hours = max(35, min(80, random.normalvariate(48 + drift, 10)))
    night_shifts = max(0, min(16, int(random.normalvariate(4 + drift * 0.3, 3))))
    consecutive_days = max(0, min(14, int(random.normalvariate(5 + drift * 0.2, 3))))
    deployment_days = max(0, min(90, int(random.normalvariate(25 + drift * 2, 20))))
    days_since_leave = max(0, min(180, int(random.normalvariate(60 + drift * 3, 30))))
    transfers_6m = random.choices([0, 1, 2, 3], weights=[60, 25, 10, 5])[0]
    training_days_30 = max(0, min(30, int(random.normalvariate(7 + drift * 0.5, 5))))

    # Wellness (60% chance of having consent; values correlated with workload)
    has_consent = random.random() < 0.6
    sleep_hours = None
    fatigue = None
    perceived_workload = None

    if has_consent:
        sleep_hours = max(2, min(12, random.normalvariate(6.5 - drift * 0.1, 1.5)))
        fatigue = max(1, min(10, int(random.normalvariate(5 + drift * 0.2, 2))))
        perceived_workload = max(1, min(10, int(random.normalvariate(5 + drift * 0.2, 2))))

    row = {
        "person_id": person_id,
        "observation_index": obs_index,
        "obs_date": (base_date + timedelta(days=obs_index * 30)).strftime("%Y-%m-%d"),
        "weekly_hours": round(weekly_hours, 1),
        "night_shifts": night_shifts,
        "consecutive_days": consecutive_days,
        "deployment_days": deployment_days,
        "days_since_leave": days_since_leave,
        "transfers_6m": transfers_6m,
        "training_days_30": training_days_30,
        "sleep_hours": round(sleep_hours, 1) if sleep_hours is not None else None,
        "fatigue": fatigue,
        "perceived_workload": perceived_workload,
        "has_wellness_consent": int(has_consent),
    }

    score = calculate_score(row)
    row["score"] = score
    row["priority"] = (
        "elevated" if score >= THRESHOLDS["elevated_threshold"]
        else "watch" if score >= THRESHOLDS["watch_threshold"]
        else "routine"
    )
    # Binary label: elevated = 1 (welfare review recommended by rules)
    row["label_elevated"] = int(score >= THRESHOLDS["elevated_threshold"])

    return row


def main():
    N_PERSONNEL = 500
    OBSERVATIONS_PER_PERSON = 12  # monthly, ~1 year
    BASE_DATE = datetime(2025, 1, 1)
    OUTPUT_FILE = "synthetic_personnel_data.csv"

    print(f"Generating {N_PERSONNEL} × {OBSERVATIONS_PER_PERSON} = "
          f"{N_PERSONNEL * OBSERVATIONS_PER_PERSON} synthetic observations...")

    rows = []
    for p in range(N_PERSONNEL):
        person_id = f"SYN-{p+1:04d}"
        # Each person has a "baseline stress level" that modulates their trajectory
        person_baseline = random.choice(["low", "moderate", "high"])
        for obs in range(OBSERVATIONS_PER_PERSON):
            row = generate_record(person_id, obs, BASE_DATE)
            row["person_baseline"] = person_baseline  # metadata only, not a feature
            rows.append(row)

    # Write CSV
    fieldnames = [
        "person_id", "observation_index", "obs_date",
        "weekly_hours", "night_shifts", "consecutive_days",
        "deployment_days", "days_since_leave", "transfers_6m", "training_days_30",
        "sleep_hours", "fatigue", "perceived_workload", "has_wellness_consent",
        "score", "priority", "label_elevated", "person_baseline",
    ]

    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    n_elevated = sum(1 for r in rows if r["label_elevated"] == 1)
    print(f"\nWrote {len(rows)} rows to {OUTPUT_FILE}")
    print(f"Label distribution: {n_elevated} elevated ({100*n_elevated/len(rows):.1f}%), "
          f"{len(rows)-n_elevated} not elevated ({100*(len(rows)-n_elevated)/len(rows):.1f}%)")
    print("\n⚠  IMPORTANT: Labels were generated by the rule engine.")
    print("   A model trained here learns to reproduce the rules, not to detect real-world stress.")
    print("   Accuracy metrics do NOT validate clinical effectiveness.")


if __name__ == "__main__":
    main()

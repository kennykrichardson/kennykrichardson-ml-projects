import json
import logging
import time
from pathlib import Path

import joblib
import pandas as pd
import yaml
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


CONFIG_PATH = Path("config.yaml")
METRICS_PATH = Path("metrics.json")
MODEL_PATH = Path("model.joblib")
LOG_PATH = Path("run.log")


def load_config():
    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)

def validate_dataset(df):
    required_columns = {
        "target",
        "release_date",
        "runtime",
        "budget",
        "original_language",
        "genres",
        "production_countries",
        "production_companies",
        "cast",
        "writers",
        "director",
    }

    missing_columns = required_columns - set(df.columns)

    if missing_columns:
        raise ValueError(
            f"Dataset is missing required columns: "
            f"{sorted(missing_columns)}"
        )

    if df.empty:
        raise ValueError("Dataset is empty.")

    if df["target"].isna().any():
        raise ValueError("Target contains missing values.")

    target_values = set(df["target"].unique())

    if not target_values.issubset({0, 1}):
        raise ValueError(
            f"Target must contain only 0 and 1. "
            f"Found: {sorted(target_values)}"
        )

    if df["target"].nunique() < 2:
        raise ValueError(
            "Target must contain both classes."
        )

    if len(df) < 1000:
        raise ValueError(
            f"Dataset is unexpectedly small: {len(df):,} rows."
        )

    logging.info(
        "Dataset validation passed: %d rows, %d columns.",
        len(df),
        len(df.columns),
    )

def setup_logging():
    logging.basicConfig(
        filename=LOG_PATH,
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        force=True,
    )


def count_values(value):
    if pd.isna(value):
        return 0

    text = str(value).strip()

    if not text:
        return 0

    return len(
        [
            item
            for item in text.replace("[", "")
            .replace("]", "")
            .replace('"', "")
            .split(",")
            if item.strip()
        ]
    )


def build_features(df):
    data = df.copy()

    data["release_year"] = pd.to_datetime(
        data["release_date"],
        errors="coerce",
    ).dt.year

    data["log_budget"] = (
        data["budget"]
        .clip(lower=0)
        .apply(lambda value: 0 if value == 0 else __import__("math").log1p(value))
    )

    data["genre_count"] = data["genres"].apply(count_values)
    data["country_count"] = data["production_countries"].apply(count_values)
    data["company_count"] = data["production_companies"].apply(count_values)
    data["cast_count"] = data["cast"].apply(count_values)
    data["writer_count"] = data["writers"].apply(count_values)

    data["has_director"] = data["director"].notna().astype(int)

    numeric_features = [
        "release_year",
        "runtime",
        "log_budget",
        "genre_count",
        "country_count",
        "company_count",
        "cast_count",
        "writer_count",
        "has_director",
    ]

    categorical_features = [
        "original_language",
        "genres",
    ]

    feature_columns = numeric_features + categorical_features

    X = data[feature_columns].copy()
    y = data["target"].astype("int8")

    return X, y, numeric_features, categorical_features


def build_pipeline(numeric_features, categorical_features, config):
    numeric_pipeline = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(strategy="median"),
            )
        ]
    )

    categorical_pipeline = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(strategy="most_frequent"),
            ),
            (
                "encoder",
                OneHotEncoder(
                    handle_unknown="ignore",
                    min_frequency=10,
                ),
            ),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "numeric",
                numeric_pipeline,
                numeric_features,
            ),
            (
                "categorical",
                categorical_pipeline,
                categorical_features,
            ),
        ]
    )

    model = RandomForestClassifier(
        n_estimators=300,
        random_state=config["model"]["random_state"],
        n_jobs=-1,
        class_weight="balanced",
        max_features="sqrt",
        min_samples_leaf=2,
    )

    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )


def evaluate_model(model, X_test, y_test):
    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]

    return {
        "accuracy": accuracy_score(y_test, predictions),
        "precision": precision_score(
            y_test,
            predictions,
            zero_division=0,
        ),
        "recall": recall_score(
            y_test,
            predictions,
            zero_division=0,
        ),
        "f1": f1_score(
            y_test,
            predictions,
            zero_division=0,
        ),
        "roc_auc": roc_auc_score(
            y_test,
            probabilities,
        ),
        "confusion_matrix": confusion_matrix(
            y_test,
            predictions,
        ).tolist(),
    }

def calculate_baseline(y_test):
    majority_class = y_test.mode()[0]
    baseline_predictions = [majority_class] * len(y_test)

    return {
        "strategy": "majority_class",
        "majority_class": int(majority_class),
        "accuracy": accuracy_score(
            y_test,
            baseline_predictions,
        ),
    }

def main():
    setup_logging()

    start_time = time.time()

    logging.info("Boxwit pipeline started.")

    config = load_config()

    experiment_config = config["experiment"]

    dataset_path = Path(config["data"]["source"])

    logging.info(
        "Loading dataset: %s",
        dataset_path,
    )

    df = pd.read_csv(dataset_path)

    logging.info(
        "Loaded %d rows.",
        len(df),
    )

    validate_dataset(df)

    X, y, numeric_features, categorical_features = build_features(df)

    logging.info(
        "Feature engineering completed."
    )

    logging.info(
        "Numeric features: %d",
        len(numeric_features),
    )

    logging.info(
        "Categorical features: %d",
        len(categorical_features),
    )

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=config["model"]["test_size"],
        random_state=config["model"]["random_state"],
        stratify=y,
    )

    logging.info(
        "Train/test split: %d/%d.",
        len(X_train),
        len(X_test),
    )

    pipeline = build_pipeline(
        numeric_features,
        categorical_features,
        config,
    )

    logging.info(
        "Training Random Forest with 300 trees."
    )

    pipeline.fit(X_train, y_train)

    logging.info(
        "Model training completed."
    )

    model_results = evaluate_model(
        pipeline,
        X_test,
        y_test,
    )

    baseline_results = calculate_baseline(
        y_test,
    )

    metrics = {
        "experiment": {
            "id": experiment_config["id"],
            "name": experiment_config["name"],
            "description": experiment_config["description"],
        },
        "baseline": baseline_results,
        "results": model_results,
    }

    joblib.dump(
        pipeline,
        MODEL_PATH,
    )

    logging.info(
        "Model saved to %s.",
        MODEL_PATH,
    )

    metrics["dataset"] = {
        "rows": len(df),
        "features_before_encoding": (
            len(numeric_features) + len(categorical_features)
        ),
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
        "positive_samples": int(y.sum()),
        "negative_samples": int((y == 0).sum()),
    }

    metrics["training"] = {
        "model": config["model"]["type"],
        "test_size": config["model"]["test_size"],
        "random_state": config["model"]["random_state"],
        "n_estimators": 300,
        "class_weight": "balanced",
        "min_samples_leaf": 2,
    }

    metrics["runtime_seconds"] = round(
        time.time() - start_time,
        3,
    )

    with METRICS_PATH.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            metrics,
            file,
            indent=2,
        )

    logging.info(
        "Metrics saved to %s.",
        METRICS_PATH,
    )

    logging.info(
        "Pipeline completed in %.3f seconds.",
        metrics["runtime_seconds"],
    )

    print("\n====================== Boxwit ======================")
    print("Pipeline completed successfully.\n")

    print(f"Dataset:   {len(df):,} rows")
    print(
        "Features:  "
        f"{len(numeric_features) + len(categorical_features)} "
        "before encoding"
    )
    print(
        f"Baseline: "
        f"accuracy={baseline_results['accuracy']:.4f}"
    )
    print(f"Accuracy:  {metrics['results']['accuracy']:.4f}")
    print(f"Precision: {metrics['results']['precision']:.4f}")
    print(f"Recall:    {metrics['results']['recall']:.4f}")
    print(f"F1:        {metrics['results']['f1']:.4f}")
    print(f"ROC-AUC:   {metrics['results']['roc_auc']:.4f}")
    print(f"Runtime:   {metrics['runtime_seconds']:.2f}s")
    print(f"Model:     {MODEL_PATH}")


if __name__ == "__main__":
    main()
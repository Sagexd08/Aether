import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split


AdapterMethod = Literal['lora', 'qlora', 'adapter', 'prompt', 'sklearn-baseline']


@dataclass
class TrainingRun:
    job_id: str
    task_type: str
    base_model: str
    adapter_method: AdapterMethod
    output_dir: str
    metrics: dict
    artifacts: dict


def train_sklearn_baseline(job_id: str, texts: list[str], labels: list[str], output_root: str) -> TrainingRun:
    output_dir = Path(output_root) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    x_train, x_valid, y_train, y_valid = train_test_split(texts, labels, test_size=0.2, random_state=42, stratify=labels if len(set(labels)) > 1 else None)
    vectorizer = TfidfVectorizer(max_features=20_000, ngram_range=(1, 2), min_df=1)
    x_train_vec = vectorizer.fit_transform(x_train)
    x_valid_vec = vectorizer.transform(x_valid)
    model = LogisticRegression(max_iter=500)
    model.fit(x_train_vec, y_train)
    predictions = model.predict(x_valid_vec)
    metrics = {'eval_accuracy': float(accuracy_score(y_valid, predictions)), 'train_size': len(x_train), 'valid_size': len(x_valid)}

    pipeline_path = output_dir / 'sklearn_text_pipeline.pkl'
    joblib.dump({'vectorizer': vectorizer, 'model': model}, pipeline_path)
    metrics_path = output_dir / 'metrics.json'
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    return TrainingRun(
        job_id=job_id,
        task_type='text-classification',
        base_model='sklearn/tfidf-logistic-regression',
        adapter_method='sklearn-baseline',
        output_dir=str(output_dir),
        metrics=metrics,
        artifacts={'pipeline_pkl': str(pipeline_path), 'metrics_json': str(metrics_path)},
    )


def export_adapter_metadata(job_id: str, base_model: str, adapter_method: AdapterMethod, output_root: str) -> TrainingRun:
    output_dir = Path(output_root) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    config = {
        'base_model': base_model,
        'adapter_method': adapter_method,
        'training_note': 'Use PEFT/Transformers Trainer to populate adapter_model.safetensors with learned adapter weights.',
    }
    config_path = output_dir / 'adapter_config.json'
    config_path.write_text(json.dumps(config, indent=2), encoding='utf-8')
    # Empty tensors are not useful model weights, so this file is intentionally not created by the scaffold.
    # A real PEFT run should call model.save_pretrained(output_dir, safe_serialization=True).
    metrics = {'status': 'adapter_scaffold_ready'}
    metrics_path = output_dir / 'metrics.json'
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    return TrainingRun(
        job_id=job_id,
        task_type='adapter-finetune',
        base_model=base_model,
        adapter_method=adapter_method,
        output_dir=str(output_dir),
        metrics=metrics,
        artifacts={'adapter_config': str(config_path), 'metrics_json': str(metrics_path), 'expected_weights': str(output_dir / 'adapter_model.safetensors')},
    )


def write_run_metadata(run: TrainingRun) -> str:
    metadata_path = Path(run.output_dir) / 'training_run.json'
    metadata_path.write_text(json.dumps(asdict(run), indent=2), encoding='utf-8')
    return str(metadata_path)

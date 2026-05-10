import json
import pickle
from pathlib import Path

from .config import get_settings


class TextPreprocessor:
    def __init__(self, lowercase: bool = True, strip: bool = True):
        self.lowercase = lowercase
        self.strip = strip

    def transform(self, values: list[str]) -> list[str]:
        output = []
        for value in values:
            item = value.strip() if self.strip else value
            output.append(item.lower() if self.lowercase else item)
        return output


def prepare_training_artifacts(job_id: str, metadata: dict) -> dict[str, str]:
    settings = get_settings()
    output_dir = Path(settings.training_output_path) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    preprocessor_path = output_dir / 'preprocessor.pkl'
    with preprocessor_path.open('wb') as handle:
        pickle.dump(TextPreprocessor(), handle)

    metrics_path = output_dir / 'metrics.json'
    metrics_path.write_text(json.dumps(metadata.get('metrics', {}), indent=2), encoding='utf-8')

    lineage_path = output_dir / 'lineage.json'
    lineage_path.write_text(json.dumps(metadata.get('lineage', {}), indent=2), encoding='utf-8')

    # Adapter placeholders are metadata-bearing files until a real PEFT run writes weights.
    adapter_path = output_dir / 'adapter_config.json'
    adapter_path.write_text(json.dumps(metadata.get('adapter', {}), indent=2), encoding='utf-8')

    return {
        'preprocessor_pkl': str(preprocessor_path),
        'metrics_json': str(metrics_path),
        'lineage_json': str(lineage_path),
        'adapter_config': str(adapter_path),
    }


def model_artifact_format(adapter_method: str) -> str:
    if adapter_method == 'sklearn-baseline':
        return 'pkl'
    return 'safetensors'

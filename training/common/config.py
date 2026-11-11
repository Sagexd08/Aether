from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class TrainConfig:
    model: str
    dataset_id: str
    dataset_version: str
    seed: int = 0
    image_size: int = 64
    batch_size: int = 32
    lr: float = 2e-4
    epochs: int = 10
    precision: str = "fp16"
    grad_checkpointing: bool = True
    extra: dict[str, Any] = field(default_factory=dict)

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "TrainConfig":
        return cls(**json.loads(path.read_text(encoding="utf-8")))

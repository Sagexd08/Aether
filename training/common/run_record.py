from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .config import TrainConfig

RECORD_NAME = "run.json"


def _write(run_dir: Path, record: dict[str, Any]) -> None:
    (run_dir / RECORD_NAME).write_text(json.dumps(record, indent=2), encoding="utf-8")


def read_run(run_dir: Path) -> dict[str, Any]:
    return json.loads((run_dir / RECORD_NAME).read_text(encoding="utf-8"))


def create_run(root: Path, cfg: TrainConfig, architecture: str) -> Path:
    run_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{cfg.model}-s{cfg.seed}"
    run_dir = root / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    _write(
        run_dir,
        {
            "run_id": run_id,
            "architecture": architecture,
            "init_seed": cfg.seed,
            "dataset": {"id": cfg.dataset_id, "version": cfg.dataset_version},
            "config": asdict(cfg),
            "checkpoints": [],
            "evals": {},
        },
    )
    return run_dir


def add_checkpoint(run_dir: Path, path: str, step: int) -> None:
    record = read_run(run_dir)
    record["checkpoints"] = [*record["checkpoints"], {"path": path, "step": step}]
    _write(run_dir, record)


def add_eval(run_dir: Path, name: str, metrics: dict[str, float]) -> None:
    record = read_run(run_dir)
    record["evals"] = {**record["evals"], name: metrics}
    _write(run_dir, record)

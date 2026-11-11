from __future__ import annotations

import tempfile
from pathlib import Path

from .config import TrainConfig
from .run_record import add_checkpoint, add_eval, create_run, read_run
from .seed import set_seed


def main() -> None:
    cfg = TrainConfig(model="tiny", dataset_id="cifar10", dataset_version="py-2009", seed=7)
    with tempfile.TemporaryDirectory() as tmp:
        cfg_path = Path(tmp) / "cfg.json"
        cfg.save(cfg_path)
        assert TrainConfig.load(cfg_path) == cfg

        set_seed(cfg.seed)
        run_dir = create_run(Path(tmp), cfg, architecture="tiny-unet")
        add_checkpoint(run_dir, "checkpoints/a.pth", step=100)
        add_eval(run_dir, "val", {"loss": 0.5})
        rec = read_run(run_dir)
        assert rec["init_seed"] == 7
        assert rec["checkpoints"][0]["step"] == 100
        assert rec["evals"]["val"]["loss"] == 0.5
        assert rec["config"]["dataset_id"] == "cifar10"
    print("selftest OK")


if __name__ == "__main__":
    main()

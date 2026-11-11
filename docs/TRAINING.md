# Training

1. Download and prepare data: `python scripts/download_kaggle.py`, then `python training/prepare_flickr.py`. Record each dataset's licence under `data/provenance/` first (see `docs/ml/DATASETS.md`).
2. Train: `python training/train_t2i.py --steps 100000 --batch 32 --accum 2`. Options: `--resume`, `--sample_every`, `--ckpt_every`, `--no_grad_ckpt`.
3. Each run writes samples, checkpoints and a run record under `runs/<timestamp>-t2i-s<seed>/`.
4. Place the chosen checkpoint in `models/` for `ml_service`. Checkpoints load with `torch.load(weights_only=True)`.

Reference run: 100k steps on one RTX 3050, 16.3M parameters, EMA weights.

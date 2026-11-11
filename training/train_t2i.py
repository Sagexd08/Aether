from __future__ import annotations

import argparse
from pathlib import Path

import torch
from PIL import Image

from .common.config import TrainConfig
from .common.run_record import add_checkpoint, create_run
from .common.seed import set_seed
from .models.flow import EMA, flow_loss, sample
from .models.t2i import T2I

CACHE = Path("data/cache/flickr8k_64.pt")
N_PREVIEW = 8


def load_data(device: str):
    d = torch.load(CACHE, weights_only=True)
    return d["images"].to(device), d["caps"].to(device), d["vocab"]


def get_batch(images, caps, bs: int):
    idx = torch.randint(0, images.shape[0], (bs,), device=images.device)
    x = images[idx].float() / 127.5 - 1.0
    flip = torch.rand(bs, device=x.device) < 0.5
    x = torch.where(flip[:, None, None, None], x.flip(-1), x)
    pick = torch.randint(0, caps.shape[1], (bs,), device=caps.device)
    return x, caps[idx, pick]


def save_grid(imgs: torch.Tensor, path: Path) -> None:
    a = ((imgs + 1) * 127.5).round().byte().cpu()
    row = torch.cat(list(a), dim=2)
    Image.fromarray(row.permute(1, 2, 0).numpy()).save(path)


def save_ckpt(run_dir: Path, step: int, model, ema, opt, scaler) -> None:
    path = run_dir / "ckpt.pt"
    torch.save(
        {"step": step, "model": model.state_dict(), "ema": ema.shadow.state_dict(),
         "opt": opt.state_dict(), "scaler": scaler.state_dict()}, path)
    add_checkpoint(run_dir, path.name, step)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=100_000)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--accum", type=int, default=2)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--out", default="runs")
    ap.add_argument("--resume", default=None)
    ap.add_argument("--sample_every", type=int, default=1000)
    ap.add_argument("--ckpt_every", type=int, default=2000)
    ap.add_argument("--no_grad_ckpt", action="store_true", help="faster, uses more VRAM")
    args = ap.parse_args()

    dev = "cuda"
    set_seed(0, deterministic=False)
    images, caps, vocab = load_data(dev)
    model = T2I(len(vocab), grad_ckpt=not args.no_grad_ckpt).to(dev)
    ema = EMA(model)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    scaler = torch.amp.GradScaler()
    step = 0

    if args.resume:
        run_dir = Path(args.resume)
        ck = torch.load(run_dir / "ckpt.pt", weights_only=True)
        model.load_state_dict(ck["model"])
        ema.shadow.load_state_dict(ck["ema"])
        opt.load_state_dict(ck["opt"])
        scaler.load_state_dict(ck["scaler"])
        step = ck["step"]
    else:
        cfg = TrainConfig(model="t2i", dataset_id="flickr8k_64", dataset_version="cache-v1",
                          batch_size=args.batch, lr=args.lr, epochs=0,
                          extra={"steps": args.steps, "accum": args.accum, "objective": "flow_matching"})
        run_dir = create_run(Path(args.out), cfg, "T2I: 4L d256 text enc + 4-level cross-attn UNet")
        cfg.save(run_dir / "config.json")
    print(f"params {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M  run {run_dir}  start step {step}")

    preview_tok = caps[:N_PREVIEW, 0]
    model.train()
    while step < args.steps:
        for _ in range(args.accum):
            x, tok = get_batch(images, caps, args.batch)
            with torch.autocast("cuda", dtype=torch.float16):
                loss = flow_loss(model, x, tok) / args.accum
            scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(opt)
        scaler.update()
        opt.zero_grad(set_to_none=True)
        ema.update(model)
        step += 1
        if step % 10 == 0:
            print(f"step {step} loss {loss.item() * args.accum:.4f}", flush=True)
        if step % args.sample_every == 0 or step == args.steps:
            with torch.autocast("cuda", dtype=torch.float16):
                save_grid(sample(ema.shadow, preview_tok), run_dir / f"sample_{step:06d}.png")
        if step % args.ckpt_every == 0 or step == args.steps:
            save_ckpt(run_dir, step, model, ema, opt, scaler)


if __name__ == "__main__":
    main()

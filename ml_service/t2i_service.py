import base64
import importlib.util
import io
import json
import re
import threading
from pathlib import Path

import torch
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "cache" / "flickr8k_64.pt"
VOCAB_JSON = ROOT / "data" / "cache" / "flickr8k_vocab.json"
MAX_LEN = 24
BOS, EOS, UNK = 2, 3, 1
MAX_STEPS, MAX_CFG = 100, 10.0


def _load_module(name: str):
    path = ROOT / "training" / "models" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"lexi_{name}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_vocab() -> list:
    if not VOCAB_JSON.exists():
        VOCAB_JSON.write_text(json.dumps(torch.load(CACHE, weights_only=True)["vocab"]), encoding="utf-8")
    return json.loads(VOCAB_JSON.read_text(encoding="utf-8"))


def latest_ckpt() -> Path:
    runs = sorted((ROOT / "runs").glob("*/ckpt.pt"), key=lambda p: p.stat().st_mtime)
    if not runs:
        raise FileNotFoundError("no runs/*/ckpt.pt yet (first checkpoint is written at step 2000)")
    return runs[-1]


class T2IService:
    def __init__(self, ckpt: Path = None, device: str = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._flow = _load_module("flow")
        t2i = _load_module("t2i")
        self.vocab = _load_vocab()
        self.idx = {w: i for i, w in enumerate(self.vocab)}
        self.ckpt = Path(ckpt) if ckpt else latest_ckpt()
        state = torch.load(self.ckpt, map_location=self.device, weights_only=True)
        self.model = t2i.T2I(len(self.vocab), grad_ckpt=False).to(self.device).eval()
        self.model.load_state_dict(state["ema"])
        self.step = state["step"]
        self._lock = threading.Lock()

    def encode(self, prompt: str) -> torch.Tensor:
        words = re.findall(r"[a-z]+", prompt.lower())[: MAX_LEN - 2]
        ids = [BOS] + [self.idx.get(w, UNK) for w in words] + [EOS]
        ids += [0] * (MAX_LEN - len(ids))
        return torch.tensor([ids], device=self.device)

    def generate(self, prompt: str, steps: int = 30, cfg: float = 3.0, seed: int = 0) -> bytes:
        steps = max(1, min(int(steps), MAX_STEPS))
        cfg = max(0.0, min(float(cfg), MAX_CFG))
        with self._lock, torch.autocast(self.device, enabled=self.device == "cuda"):
            img = self._flow.sample(self.model, self.encode(prompt), steps=steps, cfg=cfg, seed=int(seed))
        arr = ((img[0].float().cpu() + 1) * 127.5).round().byte().permute(1, 2, 0).numpy()
        buf = io.BytesIO()
        Image.fromarray(arr).save(buf, format="PNG")
        return buf.getvalue()

    def generate_b64(self, *args, **kw) -> str:
        return base64.b64encode(self.generate(*args, **kw)).decode()

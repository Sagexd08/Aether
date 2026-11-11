from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from pathlib import Path

import torch
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "image" / "flickr8k"
OUT = ROOT / "data" / "cache" / "flickr8k_64.pt"
SIZE = 64
MAX_LEN = 24
MIN_FREQ = 3
PAD, UNK, BOS, EOS = "<pad>", "<unk>", "<bos>", "<eos>"


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


def center_square_resize(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    caps: dict[str, list[list[str]]] = defaultdict(list)
    with open(SRC / "captions.txt", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            caps[row["image"]].append(tokenize(row["caption"]))

    names = sorted(n for n, c in caps.items() if len(c) >= 5 and (SRC / "Images" / n).is_file())
    counts = Counter(w for n in names for c in caps[n] for w in c)
    vocab = [PAD, UNK, BOS, EOS] + sorted(w for w, k in counts.items() if k >= MIN_FREQ)
    idx = {w: i for i, w in enumerate(vocab)}

    def encode(ws: list[str]) -> list[int]:
        ids = [idx[BOS]] + [idx.get(w, idx[UNK]) for w in ws[: MAX_LEN - 2]] + [idx[EOS]]
        return ids + [idx[PAD]] * (MAX_LEN - len(ids))

    images = torch.empty(len(names), 3, SIZE, SIZE, dtype=torch.uint8)
    tokens = torch.empty(len(names), 5, MAX_LEN, dtype=torch.long)
    for i, n in enumerate(names):
        with Image.open(SRC / "Images" / n) as im:
            arr = torch.frombuffer(bytearray(center_square_resize(im.convert("RGB")).tobytes()), dtype=torch.uint8)
        images[i] = arr.view(SIZE, SIZE, 3).permute(2, 0, 1)
        tokens[i] = torch.tensor([encode(c) for c in caps[n][:5]])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"images": images, "caps": tokens, "vocab": vocab, "names": names}, OUT)
    print(f"{len(names)} images, vocab {len(vocab)}, saved {OUT}")


if __name__ == "__main__":
    main()

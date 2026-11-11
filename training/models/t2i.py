from __future__ import annotations

import math

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.checkpoint import checkpoint


class TextEncoder(nn.Module):

    def __init__(self, vocab: int, d: int = 256, layers: int = 4, heads: int = 4, max_len: int = 24):
        super().__init__()
        self.emb = nn.Embedding(vocab, d, padding_idx=0)
        self.pos = nn.Parameter(torch.zeros(1, max_len, d))
        nn.init.normal_(self.pos, std=0.02)
        layer = nn.TransformerEncoderLayer(d, heads, 4 * d, dropout=0.0, batch_first=True, norm_first=True)
        self.enc = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d)

    def forward(self, tok: torch.Tensor):
        pad = tok == 0
        h = self.emb(tok) + self.pos[:, : tok.shape[1]]
        return self.norm(self.enc(h, src_key_padding_mask=pad)), pad


def timestep_embedding(t: torch.Tensor, dim: int) -> torch.Tensor:
    half = dim // 2
    freqs = torch.exp(-math.log(10000) * torch.arange(half, device=t.device) / half)
    a = (t[:, None] * 1000.0) * freqs[None]
    return torch.cat([a.sin(), a.cos()], dim=-1)


class ResBlock(nn.Module):
    def __init__(self, cin: int, cout: int, tdim: int):
        super().__init__()
        self.n1, self.c1 = nn.GroupNorm(8, cin), nn.Conv2d(cin, cout, 3, padding=1)
        self.t = nn.Linear(tdim, cout)
        self.n2, self.c2 = nn.GroupNorm(8, cout), nn.Conv2d(cout, cout, 3, padding=1)
        self.skip = nn.Conv2d(cin, cout, 1) if cin != cout else nn.Identity()

    def forward(self, x, temb):
        h = self.c1(F.silu(self.n1(x))) + self.t(F.silu(temb))[:, :, None, None]
        return self.skip(x) + self.c2(F.silu(self.n2(h)))


class AttnBlock(nn.Module):

    def __init__(self, c: int, d_text: int, heads: int = 4):
        super().__init__()
        self.n1, self.n2 = nn.GroupNorm(8, c), nn.GroupNorm(8, c)
        self.self_attn = nn.MultiheadAttention(c, heads, batch_first=True)
        self.cross = nn.MultiheadAttention(c, heads, kdim=d_text, vdim=d_text, batch_first=True)

    @staticmethod
    def _seq(x):
        return x.flatten(2).transpose(1, 2)

    def forward(self, x, text, pad):
        b, c, hh, ww = x.shape
        s = self._seq(x)
        n = self._seq(self.n1(x))
        s = s + self.self_attn(n, n, n, need_weights=False)[0]
        q = self._seq(self.n2(s.transpose(1, 2).reshape(b, c, hh, ww)))
        s = s + self.cross(q, text, text, key_padding_mask=pad, need_weights=False)[0]
        return s.transpose(1, 2).reshape(b, c, hh, ww)


class Block(nn.Module):
    def __init__(self, cin, cout, tdim, d_text, attn):
        super().__init__()
        self.res = ResBlock(cin, cout, tdim)
        self.attn = AttnBlock(cout, d_text) if attn else None

    def forward(self, x, temb, text, pad):
        x = self.res(x, temb)
        return self.attn(x, text, pad) if self.attn is not None else x


class UNet(nn.Module):

    def __init__(self, ch=(64, 128, 256, 256), d_text=256, grad_ckpt=True):
        super().__init__()
        self.grad_ckpt = grad_ckpt
        tdim = ch[0] * 4
        self.tdim0 = ch[0]
        self.temb = nn.Sequential(nn.Linear(ch[0], tdim), nn.SiLU(), nn.Linear(tdim, tdim))
        self.inp = nn.Conv2d(3, ch[0], 3, padding=1)
        attn = (False, False, True, True)
        self.down = nn.ModuleList()
        cin = ch[0]
        skips = [cin]
        for i, c in enumerate(ch):
            self.down.append(Block(cin, c, tdim, d_text, attn[i]))
            cin = c
            skips.append(c)
        self.pool = nn.ModuleList(nn.Conv2d(c, c, 3, stride=2, padding=1) for c in ch[:-1])
        self.mid = Block(cin, cin, tdim, d_text, True)
        self.up = nn.ModuleList()
        for i in reversed(range(len(ch))):
            self.up.append(Block(cin + skips.pop(), ch[i], tdim, d_text, attn[i]))
            cin = ch[i]
        self.out = nn.Sequential(nn.GroupNorm(8, cin), nn.SiLU(), nn.Conv2d(cin, 3, 3, padding=1))

    def _run(self, blk, x, temb, text, pad):
        if self.grad_ckpt and self.training and torch.is_grad_enabled():
            return checkpoint(blk, x, temb, text, pad, use_reentrant=False)
        return blk(x, temb, text, pad)

    def forward(self, x, t, text, pad):
        temb = self.temb(timestep_embedding(t, self.tdim0))
        h = self.inp(x)
        hs = [h]
        for i, blk in enumerate(self.down):
            h = self._run(blk, h, temb, text, pad)
            hs.append(h)
            if i < len(self.pool):
                h = self.pool[i](h)
        h = self._run(self.mid, h, temb, text, pad)
        for i, blk in enumerate(self.up):
            skip = hs.pop()
            h = self._run(blk, torch.cat([h, skip], dim=1), temb, text, pad)
            if i < len(self.up) - 1:
                h = F.interpolate(h, scale_factor=2, mode="nearest")
        return self.out(h)


class T2I(nn.Module):
    def __init__(self, vocab: int, grad_ckpt: bool = True):
        super().__init__()
        self.text = TextEncoder(vocab)
        self.unet = UNet(grad_ckpt=grad_ckpt)

    def forward(self, x, t, tok):
        text, pad = self.text(tok)
        return self.unet(x, t, text, pad)

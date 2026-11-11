from __future__ import annotations

import copy

import torch
import torch.nn.functional as F

BOS, EOS = 2, 3


def empty_caption(tok: torch.Tensor) -> torch.Tensor:
    out = torch.zeros_like(tok)
    out[:, 0], out[:, 1] = BOS, EOS
    return out


def flow_loss(model, x0: torch.Tensor, tok: torch.Tensor, p_drop: float = 0.1) -> torch.Tensor:
    b = x0.shape[0]
    drop = torch.rand(b, device=x0.device) < p_drop
    tok = torch.where(drop[:, None], empty_caption(tok), tok)
    t = torch.rand(b, device=x0.device)
    noise = torch.randn_like(x0)
    xt = (1 - t)[:, None, None, None] * x0 + t[:, None, None, None] * noise
    return F.mse_loss(model(xt, t, tok).float(), (noise - x0).float())


@torch.no_grad()
def sample(model, tok: torch.Tensor, steps: int = 30, cfg: float = 3.0, seed: int = 0) -> torch.Tensor:
    g = torch.Generator(device=tok.device).manual_seed(seed)
    x = torch.randn(tok.shape[0], 3, 64, 64, device=tok.device, generator=g)
    null = empty_caption(tok)
    ts = torch.linspace(1.0, 0.0, steps + 1, device=tok.device)
    for i in range(steps):
        t = ts[i].expand(x.shape[0])
        both = model(torch.cat([x, x]), torch.cat([t, t]), torch.cat([tok, null]))
        vc, vu = both.float().chunk(2)
        x = x + (ts[i + 1] - ts[i]) * (vu + cfg * (vc - vu))
    return x.clamp(-1, 1)


class EMA:
    def __init__(self, model, decay: float = 0.999):
        self.decay = decay
        self.shadow = copy.deepcopy(model).eval().requires_grad_(False)

    @torch.no_grad()
    def update(self, model) -> None:
        for s, p in zip(self.shadow.parameters(), model.parameters()):
            s.lerp_(p, 1 - self.decay)

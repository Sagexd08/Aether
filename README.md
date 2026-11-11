# Aether AI

A small text-to-image app with a hardened API, built around a model trained from scratch.

![Samples](docs/assets/samples.png)

*64x64, 16.3M parameters, trained from scratch on one RTX 3050 for 100k steps.*

## Quick start

Requires Node 20+, Python 3.10+, a Neon (Postgres) database and a trained checkpoint in `models/`.

```
npm install
cd client && npm install && cd ..
pip install -r ml_service/requirements.txt
cp .env.example .env
python ml_service/app.py
npm run dev
```

Fill `.env` first; every variable is described in `docs/ENVIRONMENT.md`. The API listens on :3000, the client on :5173, and `ml_service` on 127.0.0.1:5000.

## What is in the box

```
browser (React, Vite) -> API (Express, TypeScript) -> ml_service (Flask, PyTorch)
                              |
                         Neon Postgres
```

- `client/` React and Tailwind UI with GSAP animation.
- `server/` API: sessions, accounts, job queue, rate limits, prompt policy, retention.
- `ml_service/` serves the model behind an internal token.
- `training/` model code and training loop.

Request path and tables: `docs/ARCHITECTURE.md`.

## Train your own

`docs/TRAINING.md`. No pretrained weights are used anywhere in this project.

## Limits and non-goals

- Output is 64x64, faces are soft, captions are English only.
- The prompt policy is a regex first filter, not a safety guarantee.
- The current checkpoint was trained on Flickr8k, whose licence is research-only. Do not redistribute those weights. See `docs/MODEL_CARD.md` and `docs/KNOWN_LIMITS.md`.

## Security

Report problems privately, see `SECURITY.md`. Design and audit: `docs/SECURITY_AUDIT.md`.

## Licence

Apache-2.0, see `LICENSE`.

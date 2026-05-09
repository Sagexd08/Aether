# AETHER AI

AETHER AI is a cinematic multimodal generative AI platform scaffolded as a monorepo with a premium Next.js frontend and FastAPI backend.

## Workspace structure

- `frontend/app` — Next.js App Router frontend
- `backend/api` — FastAPI backend
- `ml/service` — model routing and inference service scaffold
- `packages/types` — shared TypeScript contracts
- `packages/config` — shared config package stub
- `infra/docker-compose.yml` — local infrastructure for Postgres, Redis, web, api, worker, ml

## Local development

### Install workspace dependencies

Use `pnpm install` from the repo root after enabling pnpm.

### Start all apps

```bash
pnpm dev
```

### Build all apps

```bash
pnpm build
```

### Docker infrastructure

```bash
docker compose -f infra/docker-compose.yml up --build
```

## Environment

Use the provided `.env.example` files:

- `frontend/app/.env.example`
- `backend/api/.env.example`

Do not hardcode provider secrets. Set `HF_TOKEN` only in environment configuration. In the current scaffold, Hugging Face is treated as the primary provider path.

## Current implementation state

This repository now includes:

- premium landing page scaffold in `frontend/app`
- cinematic auth pages
- authenticated workspace shell
- command bar scaffold
- gallery, agents, workflows, billing, datasets, settings, team, video, and audio route scaffolds
- FastAPI health, auth, generation, SSE, worker, and websocket scaffolds in `backend/api`
- ML routing service scaffold in `ml/service`
- provider routing placeholder with Hugging Face as the primary env-based provider path
- Redis/Celery/WebSocket scaffolding

## Security note

The Hugging Face token that was pasted in chat should be treated as compromised and rotated. Keep all provider tokens server-side only.

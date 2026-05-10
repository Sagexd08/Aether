# AETHER AI

AETHER AI is a premium cinematic multimodal AI platform scaffolded as a production-ready monorepo. It includes a Next.js studio frontend, a FastAPI control plane, secure dataset connectors, training orchestration, artifact export, model registry controls, and local deployment infrastructure.

## What Is Implemented

- Next.js 15 / React 19 workspace with landing, auth, studio shell, generation, gallery, datasets, training, model registry, billing, team, workflow, and settings routes.
- FastAPI backend with persisted auth, workspaces, projects, generations, assets, datasets, training jobs, model registry, notifications, audit logs, WebSockets, and SSE.
- Secure Hugging Face and Kaggle dataset inspection connectors that read credentials only from environment variables.
- Training orchestration that creates JSON lineage/metrics files and valid `.pkl` preprocessing artifacts for compatible classical ML components.
- ML service training scaffold for sklearn baseline exports and PEFT adapter metadata, with `.safetensors` reserved for real neural adapter weights produced by a PEFT/Transformers run.
- Docker Compose infrastructure for app, API, worker, ML service, Postgres, and Redis.

## Repository Layout

- `frontend/app` - Next.js App Router frontend
- `backend/api` - FastAPI backend and Celery worker
- `ml/service` - model routing and training service
- `packages/types` - shared TypeScript contracts
- `packages/config` - shared config package
- `infra/docker-compose.yml` - local production-like stack

## Environment

Never hardcode secrets. Copy the example files and fill values locally:

```bash
cp backend/api/.env.example backend/api/.env
cp frontend/app/.env.example frontend/app/.env
```

Required backend variables:

```bash
HUGGINGFACE_TOKEN=
KAGGLE_USERNAME=
KAGGLE_KEY=
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
OBJECT_STORAGE_URL=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=
MODEL_REGISTRY_PATH=
TRAINING_OUTPUT_PATH=
```

The frontend only receives public service URLs such as `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`. Provider tokens must remain server-side.

## Local Development

Install dependencies from the repo root:

```bash
pnpm install
```

Start the workspace:

```bash
pnpm dev
```

Start the full local stack:

```bash
docker compose -f infra/docker-compose.yml up --build
```

## Product Flow

1. Sign up or sign in.
2. Import a dataset from Hugging Face, Kaggle, or a local upload manifest.
3. Inspect schema, media types, quality report, and lineage metadata.
4. Launch a training job using LoRA, QLoRA, adapter tuning, prompt tuning, or an sklearn baseline.
5. Monitor progress, worker status, metrics, checkpoints, and artifact paths.
6. Register a checkpoint into the model registry.
7. Promote or roll back registry versions for deployment.

## Artifact Rules

- `.pkl` is used only for sklearn-style models, vectorizers, label encoders, or preprocessing pipelines.
- Neural model weights should use `.safetensors`, `.pt`, or `.onnx`.
- PEFT adapter runs should call `model.save_pretrained(output_dir, safe_serialization=True)` to produce `adapter_model.safetensors`.
- Every training run should write JSON metrics, evaluation summaries, and dataset lineage records.

## Security Notes

- Rotate any credential pasted into chat, logs, tickets, or commits.
- Do not print provider tokens in logs.
- Do not store raw secrets in the database.
- Keep training jobs isolated from user input paths.
- Validate uploads before ingestion.
- Use audit logs for actions, not secret payloads.

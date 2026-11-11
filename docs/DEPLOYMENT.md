# Deployment

- Environment variables: `docs/ENVIRONMENT.md`. Production requires `NODE_ENV=production` and a strong `ADMIN_API_TOKEN`.
- Put one reverse proxy in front of the API, serve `client/dist` from it, and set `TRUST_PROXY=1`. Leave it at 0 when there is no proxy.
- `ml_service` binds to 127.0.0.1 by default. Never publish its port.
- Build: `npm run build`. Run: `npm start` and `python ml_service/app.py` (waitress).
- Health: `/api/health/live` and `/api/health/ready`. The API drains running jobs on shutdown.
- Rotate `JWT_SECRET`, `JWT_REFRESH_SECRET` and `IP_HASH_SALT` if they leak. Rotating the salt logs everyone out.

## Containers

`compose.yaml` runs Postgres, the API, ml_service and the nginx-served client. Postgres and ml_service sit on an internal network with no published ports; only the client (port 8080) is exposed, and nginx proxies `/api` and `/uploads` to the API so the session cookie stays same-origin.

```
POSTGRES_PASSWORD=... JWT_SECRET=... JWT_REFRESH_SECRET=... IP_HASH_SALT=... ADMIN_API_TOKEN=... ML_INTERNAL_TOKEN=... docker compose up --build
```

Compose refuses to start if any of those variables is missing (use 32+ random characters; `ADMIN_API_TOKEN` and `ML_INTERNAL_TOKEN` need 24+). The API applies migrations on boot.

ml_service reads checkpoints from `./runs/*/ckpt.pt` (mounted read-only) and the vocabulary cache from `./data/cache`. Both are gitignored: train a model first (`docs/TRAINING.md`) or the model reports unhealthy and `/api/health/ready` returns 503. Inference runs on CPU in the container.

If `docker compose build` stops on a buildx "additional privileges requested" prompt, build the images directly and start without building:

```
docker build -f Dockerfile -t aether-ai-server .
docker build -f client/Dockerfile -t aether-ai-client .
docker build -f Dockerfile.ml -t aether-ai-ml_service .
docker compose up -d --no-build
```

`NODE_ENV=production` sets the `Secure` cookie flag. Browsers accept it on `http://localhost`; any other host needs HTTPS in front, and `PUBLIC_ORIGIN` set to that origin.

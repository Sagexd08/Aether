# Deployment

- Environment variables: `docs/ENVIRONMENT.md`. Production requires `NODE_ENV=production` and a strong `ADMIN_API_TOKEN`.
- Put one reverse proxy in front of the API, serve `client/dist` from it, and set `TRUST_PROXY=1`. Leave it at 0 when there is no proxy.
- `ml_service` binds to 127.0.0.1 by default. Never publish its port.
- Build: `npm run build`. Run: `npm start` and `python ml_service/app.py` (waitress).
- Health: `/api/health/live` and `/api/health/ready`. The API drains running jobs on shutdown.
- Rotate `JWT_SECRET`, `JWT_REFRESH_SECRET` and `IP_HASH_SALT` if they leak. Rotating the salt logs everyone out.

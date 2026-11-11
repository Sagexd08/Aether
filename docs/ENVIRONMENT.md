# Environment variables

Copy `.env.example` to `.env` and fill it in. The API validates every value at boot and refuses to start on a missing or weak one. Never commit real values.

| Variable | Required | Meaning |
|---|---|---|
| NODE_ENV | no | development (default), test or production. Production makes cookies secure and requires ADMIN_API_TOKEN. |
| PORT | no | API port, default 3000. |
| CORS_ORIGIN | no | Browser origin allowed to call the API, default http://localhost:5173. |
| DATABASE_URL | yes | Neon Postgres connection string from the Neon dashboard. |
| JWT_SECRET | yes | Signs access tokens. At least 32 random characters. |
| JWT_REFRESH_SECRET | yes | Signs refresh tokens. At least 32 random characters, different from JWT_SECRET. |
| ADMIN_API_TOKEN | production | Header token for /api/admin routes. At least 24 characters in production. |
| IP_HASH_SALT | yes | Salt for hashing IP addresses and session tokens. At least 16 characters. Changing it logs everyone out and resets IP-keyed counters. |
| TRUST_PROXY | no | Number of reverse proxies in front of the API. 0 (default) means none: the client IP is the socket address and X-Forwarded-For is ignored. Use 1 behind exactly one proxy. Never true. |
| ML_SERVICE_URL | no | Where the API reaches ml_service, default http://localhost:5000. |
| ML_INTERNAL_TOKEN | yes | Shared secret sent as X-Internal-Token to ml_service. At least 24 characters. ml_service refuses to start without it. |
| ML_HOST | no | ml_service bind address, default 127.0.0.1. Never publish its port. |
| UPLOAD_RETENTION_DAYS | no | Generated images and their history rows are deleted after this many days, default 30. |
| KAGGLE_API_TOKEN | no | Used only by dataset download scripts, never for generation. |

# Contributing

## Setup

1. `npm install` in the repo root and in `client/`.
2. Copy `.env.example` to `.env` and fill in the values (see `docs/ENVIRONMENT.md`).
3. `pip install -r ml_service/requirements.txt`, then `python ml_service/app.py`.
4. `npm run dev` starts the API and the client.

## Before opening a pull request

Run these and include the result:

```
npm run typecheck
npm test
npm run smoke
```

`npm test` runs the unit tests. Set `TEST_DATABASE_URL` to a throwaway Postgres to run the integration tests too (CI does this with a service container). `cd ml_service && python -m pytest tests` covers the model service.

For client changes also run `cd client && npx tsc --noEmit && npm run build`.

## Rules

- No comments in code. Put explanations in `docs/`.
- No pretrained weights. Models in this project are trained from scratch on data with a documented licence.
- Commits follow `type: description` (feat, fix, refactor, docs, test, chore, perf, ci).
- Database changes are a new numbered file in `server/migrations/` (`NNN_name.sql`), applied in order at startup and recorded in `schema_migrations`. Never edit a migration that has shipped.
- Report security problems privately, see `SECURITY.md`.

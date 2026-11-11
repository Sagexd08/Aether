# Contributing

## Setup

1. `npm install` in the repo root and in `client/`.
2. Copy `.env.example` to `.env` and fill in the values (see `docs/ENVIRONMENT.md`).
3. `pip install -r ml_service/requirements.txt`, then `python ml_service/app.py`.
4. `npm run dev` starts the API and the client.

## Before opening a pull request

Run all three and include the result:

```
npx tsc -p server/tsconfig.json --noEmit
npm run test:policy
npm run smoke
```

For client changes also run `cd client && npx tsc --noEmit && npm run build`.

## Rules

- No comments in code. Put explanations in `docs/`.
- No pretrained weights. Models in this project are trained from scratch on data with a documented licence.
- Commits follow `type: description` (feat, fix, refactor, docs, test, chore, perf, ci).
- Database changes go through `server/src/database/schema.ts`; keep them idempotent.
- Report security problems privately, see `SECURITY.md`.

# Changelog

Format follows Keep a Changelog. Versions follow Semantic Versioning.

## [Unreleased]

### Added
- Unit and integration test suites (vitest, supertest) and a pytest suite for ml_service.
- SQL migrations with a `schema_migrations` ledger, plus plan and job status constraints.
- Dockerfiles, `compose.yaml` (internal network for ml_service and Postgres) and a GitHub Actions CI workflow.
- PNG `tEXt` provenance chunk (generator, training step, UTC time, request id) on every generated image.

### Fixed
- Cancelling a running job no longer reports failure when the cancel succeeded.
- Zero-width characters inside a word no longer split it and bypass the prompt policy.

## [0.1.0]

### Added
- Text-to-image generation from a 16.3M parameter model trained from scratch.
- Job queue with per-session and per-IP limits, daily quotas and a prompt policy.
- Cookie-only sessions, hashed refresh tokens and account data deletion.

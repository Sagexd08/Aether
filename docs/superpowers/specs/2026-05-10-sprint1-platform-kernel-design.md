# AETHER AI — Sprint 1: Platform Kernel Design

**Date:** 2026-05-10  
**Sprint:** 1 of 4  
**Goal:** End-to-end auth + workspace shell — the operating system every subsequent sprint builds on.

---

## 1. Overview

Sprint 1 delivers the platform kernel: a fully working, production-grade auth flow wired to a real database, a protected workspace shell that loads live data, a typed API client, a WebSocket lifecycle with typed events, and a Redis presence foundation. No generation, training, or dataset features are built. Everything produced here becomes the contract that Sprints 2–4 plug into.

**What this sprint is not:** a demo, a prototype, or a placeholder. Every module must be production-quality and match the cinematic UI standard already established in the codebase.

---

## 2. Current State Assessment

The following already exists and is kept or extended (not rewritten):

| Layer | Exists | State |
|---|---|---|
| FastAPI app + CORS + rate limiter | ✅ | Keep as-is |
| SQLAlchemy models: User, Workspace, Project, AuditLog, Notification | ✅ | Keep, add `refresh_tokens` table |
| `POST /api/auth/signup` + `POST /api/auth/signin` | ✅ | Keep, extend with refresh token issuance |
| `GET /api/workspaces` + workspace/project CRUD | ✅ | Keep, add `GET /api/auth/me` |
| JWT creation + bcrypt password hashing | ✅ | Keep |
| Pydantic schemas | ✅ | Extend (add refresh schemas, workspace detail) |
| `Settings` via pydantic-settings + `.env` | ✅ | Keep |
| Next.js 15 app, Tailwind 4, Framer Motion, Zustand, TanStack Query | ✅ | Keep |
| Global design system (glass-panel, glow-ring, fade-rise, Syne/DM fonts) | ✅ | Keep, extend with skeleton utilities |
| `AuthCard` + `AuthShell` components | ✅ | Replace with react-hook-form + zod versions |
| `WorkspaceShell` nav rail + inspector panel | ✅ | Wire to real data |
| `AppProviders` (QueryClientProvider) | ✅ | Extend: add AuthProvider |
| `useAppShellStore` (Zustand) | ✅ | Extend: add auth slice |
| `@aether/types` shared package | ✅ | Extend with WS event types, workspace/project types |
| Docker-compose (postgres, redis, api, worker, web, ml) | ✅ | Fix: use `.env` not `.env.example` for api/worker |
| WebSocket echo endpoint `/ws` | ✅ | Replace: auth-gated, typed events, Redis pub/sub |

The following is **new** in Sprint 1:

- `POST /api/auth/refresh` + `POST /api/auth/signout` (clear cookie)
- `GET /api/auth/me`
- `RefreshToken` DB table
- Typed API client (`/lib/api/client.ts`, `/lib/api/auth.ts`, `/lib/api/workspaces.ts`)
- Auth Zustand store (`/lib/store/auth.ts`) with token hydration
- Next.js middleware (`middleware.ts`) for route protection
- Silent refresh interceptor in the API client
- Skeleton loader components (`SkeletonCard`, `SkeletonText`, `SkeletonAvatar`)
- `useWebSocket` hook with reconnect, typed events, auth token handshake
- Redis presence tracking per workspace (set-based, TTL 30s)
- WorkspaceShell wired to live user/workspace/notification data
- Workspace page with project cards, project creation modal
- `.env.example` files finalized for all services

---

## 3. Backend Architecture

### 3.1 New database table: `refresh_tokens`

```
refresh_tokens
  id          UUID PK
  user_id     FK → users.id  (indexed)
  token_hash  VARCHAR(255)   (hashed, not stored plain)
  expires_at  TIMESTAMP
  revoked     BOOLEAN DEFAULT false
  created_at  TIMESTAMP
```

Refresh tokens are stored as bcrypt hashes. The raw token is returned to the client exactly once (in the `Set-Cookie` header as `aether_refresh`, `httpOnly=true`, `sameSite=lax`, `secure` in production). Token rotation: each `/api/auth/refresh` call issues a new token and revokes the used one. Revoked tokens are rejected. Expired rows are cleaned up by a background task (not in Sprint 1 scope — just let them accumulate; they are harmless past `expires_at`).

### 3.2 New endpoints

#### `GET /api/auth/me`
- Requires `Authorization: Bearer <access_token>`
- Returns `UserResponse` (id, email, name, credits_remaining, role)
- Used on every frontend app boot to hydrate auth state
- Also returns the user's default workspace id (add `workspace_id` field to `UserResponse`)

#### `POST /api/auth/refresh`
- Reads `aether_refresh` httpOnly cookie
- Looks up the hash in `refresh_tokens`, validates not revoked, not expired
- Issues new access token + rotates refresh token (new cookie + new DB row, old row marked revoked)
- Returns `{ access_token: string }`
- Audit: `auth.token_refresh`

#### `POST /api/auth/signout`  *(already exists — extend)*
- Marks the current refresh token as revoked in DB
- Deletes the `aether_refresh` cookie
- Audit: `auth.signout`

#### Existing endpoints updated
- `POST /api/auth/signup` → also creates and stores a refresh token, sets cookie
- `POST /api/auth/signin` → same

### 3.3 WebSocket upgrade: `/ws/{workspace_id}`

The current echo endpoint is replaced with an authenticated, workspace-scoped channel:

```
WS /ws/{workspace_id}?token=<access_token>
```

**Handshake flow:**
1. Client connects with `?token=` query param (Bearer header not supported in browser WS API)
2. Server decodes token, loads user, verifies user owns or belongs to workspace
3. If valid: send `{ type: "connected", workspaceId, userId }` and register presence in Redis
4. If invalid: send `{ type: "error", code: "unauthorized" }` and close

**Presence in Redis:**
- On connect: `SADD ws:presence:{workspace_id} {user_id}`, `EXPIRE ws:presence:{workspace_id} 30`
- On every message from client: refresh TTL (`EXPIRE ws:presence:{workspace_id} 30`)
- On disconnect: `SREM ws:presence:{workspace_id} {user_id}`
- Presence broadcast: when a user connects/disconnects, publish to Redis channel `ws:workspace:{workspace_id}`, all connected WS handlers for that workspace forward to their clients

**Server → client typed event envelope:**
```json
{ "type": "event_type", "payload": { ... }, "ts": 1234567890 }
```

### 3.4 Redis usage in Sprint 1

| Key pattern | Type | Purpose |
|---|---|---|
| `ws:presence:{workspace_id}` | SET | Connected user IDs, TTL 30s |
| `ws:workspace:{workspace_id}` | PubSub channel | Broadcast events to all WS handlers |
| `rate:{client_ip}` | (already in memory, no change) | — |

Redis is not used for session storage (JWT is stateless). It is only used for presence and pub/sub in Sprint 1.

### 3.5 Backend file changes summary

| File | Action |
|---|---|
| `src/models.py` | Add `RefreshToken` model |
| `src/schemas.py` | Add `RefreshResponse`, extend `UserResponse` with `workspace_id` |
| `src/security.py` | Add `create_refresh_token`, `verify_refresh_token`, `rotate_refresh_token` |
| `src/routers/auth.py` | Add `/me`, `/refresh`; extend `/signup`, `/signin`, `/signout` |
| `src/realtime.py` | Replace echo with auth-gated workspace WS + Redis presence + pong handler |
| `src/main.py` | Add `X-Request-ID` response middleware (echo request header or generate if absent) |
| `src/routers/workspaces.py` | No change needed (already has list + CRUD) |
| `src/config.py` | No change needed |
| `src/db.py` | No change needed |
| `backend/api/.env.example` | Finalize all keys |

---

## 4. Frontend Architecture

### 4.1 Typed API client

Three files under `src/lib/api/`:

**`client.ts`** — base request function  
- Reads `NEXT_PUBLIC_API_URL` from env  
- Attaches `Authorization: Bearer <token>` from auth store  
- Generates a `X-Request-ID` header on every request (UUID v4, e.g. `crypto.randomUUID()`). Logged client-side at debug level. Backend echoes it in the response as `X-Request-ID` so errors can be correlated across frontend logs and backend audit logs without needing a tracing backend in Sprint 1.  
- On 401 response: calls `silentRefresh()`, retries the original request once  
- On second 401: clears auth state, redirects to `/signin`  
- Concurrent 401 handling: maintains a module-level `refreshPromise: Promise | null` singleton — if a refresh is already in flight when a second 401 arrives, the second caller awaits the same promise rather than triggering a second refresh request. Promise is cleared (set to null) when the refresh settles.  
- Throws typed `ApiError` (with `status: number`, `message: string`) — never throws raw `Error`  
- Exports: `apiRequest<T>(path, init): Promise<T>`

**`auth.ts`** — auth API calls  
- `signUp(payload)` → `AuthResponse`  
- `signIn(payload)` → `AuthResponse`  
- `signOut()` → `void`  
- `getMe()` → `UserResponse`  
- `silentRefresh()` → `{ access_token: string }` (called internally by client.ts)

**`workspaces.ts`** — workspace + project API calls  
- `listWorkspaces()` → `Workspace[]`  
- `getWorkspace(id)` → `WorkspaceDetail`  
- `listProjects(workspaceId)` → `Project[]`  
- `createProject(workspaceId, payload)` → `Project`

All types are imported from `@aether/types`. The `api.ts` file at the root of `lib/` (currently the only file) is replaced by this structured directory. The old `api.ts` import in `training-console.tsx` etc. remains temporarily compatible via a re-export barrel.

### 4.2 Auth Zustand store (`src/lib/store/auth.ts`)

```ts
interface AuthState {
  user: User | null
  token: string | null
  workspace: Workspace | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  hydrate(): Promise<void>      // reads localStorage → calls /api/auth/me
  setAuth(token, user): void
  setWorkspace(workspace): void
  signOut(): Promise<void>
}
```

**Hydration sequence (called once in `AppProviders` on mount):**
1. Read `aether_token` from localStorage
2. If absent → set status `unauthenticated`, done
3. If present → call `getMe()` using that token
4. If success → `setAuth(token, user)`, then `listWorkspaces()` → `setWorkspace(workspaces[0])`
5. If 401 → attempt `silentRefresh()` (uses httpOnly cookie), retry `getMe()`
6. If still fails → clear localStorage, set `unauthenticated`

Status starts as `'loading'` until hydration completes. The root layout renders a full-screen skeleton during `'loading'` to prevent layout flash.

**Token storage model — Sprint 1 implementation + migration note:**  
Sprint 1 stores the access token in localStorage (`aether_token`) for simplicity, matching the existing codebase pattern. This is acceptable because: (a) HTTPS is enforced in production, (b) the access token TTL is 30 minutes, (c) the refresh token is httpOnly-only and never accessible to JS. Planned migration in Sprint 2/3: move access token to an in-memory store (module-level variable, not Zustand — survives re-renders but not page reloads). On reload, the boot sequence calls `silentRefresh()` immediately (no localStorage read) to restore the in-memory token from the httpOnly cookie. This eliminates XSS blast radius for the access token and simplifies SSR integration. The API client and auth store are designed with this migration in mind — token reads go through a single `getToken()` helper that will be trivially redirected to memory in Sprint 2/3.

### 4.3 Next.js middleware (`src/middleware.ts`)

**Protected routes** (require authentication):
```
/workspace, /generate, /gallery, /video, /audio, /agents,
/workflows, /datasets, /training, /models, /billing, /settings, /team
```

**Auth-only routes** (redirect authenticated users away):
```
/signin, /signup, /forgot-password
```

Logic:
- Read `aether_token` from `request.cookies` (Note: the token is stored in localStorage on the client, not a cookie — middleware reads the `aether_refresh` httpOnly cookie as a proxy for "has active session"). If `aether_refresh` cookie present → treat as authenticated for redirect purposes only. Full validation happens client-side via hydration.
- Unauthenticated → protected route: redirect to `/signin?next={pathname}`
- Authenticated → auth route: redirect to `/workspace`
- All other routes: pass through

This is a fast, cookie-based heuristic check. The true auth validation happens in `hydrate()` client-side. This prevents the flash of protected content for unauthenticated users without requiring server-side JWT validation on every edge request.

### 4.4 Auth form upgrade

`AuthCard` is upgraded to use `react-hook-form` + `zod`:

**Validation schema (signup):**
- `name`: min 2 chars, max 80 chars
- `email`: valid email format
- `password`: min 8 chars, at least 1 number or symbol

**Validation schema (signin):**
- `email`: valid email format  
- `password`: required, min 1 char (no strength check on signin — backend validates)

**UX improvements over current state:**
- Inline field-level errors with smooth appear animation (Framer Motion `AnimatePresence`)
- Password strength indicator bar (color-coded: red/amber/green) shown on signup only
- "Enter" key submits form
- Loading state disables all inputs (not just the button)
- Error from API shown below the button with a subtle shake animation
- Google/GitHub OAuth buttons show "Coming soon" tooltip instead of being non-functional silently

### 4.5 Toast / notification system (`src/components/ui/toast.tsx`)

A centralized, imperative toast system used throughout the app. Built on Radix `Toast` primitives.

```ts
// Public API — call from anywhere, no React context required
toast.success(message: string, options?: { duration?: number })
toast.error(message: string, options?: { duration?: number })
toast.info(message: string, options?: { duration?: number })
toast.warning(message: string, options?: { duration?: number })
```

**Implementation:** a Zustand store (`useToastStore`) holds a queue of `{ id, kind, message, duration }` items. `ToastRegion` (mounted once in root layout, outside `AppProviders`) reads the store and renders a fixed-position stack in the bottom-right corner. Each toast auto-dismisses after `duration` ms (default 4000). Framer Motion handles enter/exit animations (slide up + fade).

**Sprint 1 usage:**
- `toast.success('Project created')` — after optimistic project creation confirms
- `toast.error('Session expired — please sign in again')` — on final auth failure
- `toast.info('Reconnecting…')` — on WS reconnect attempt
- `toast.success('Connected')` — on WS reconnect success

**Sprint 2+ usage:** generation queued, generation completed, generation failed — all feed this same system from WS events.

### 4.5b Skeleton loader components (`src/components/ui/skeleton.tsx`)

Three primitives built on a shared shimmer animation:

```
SkeletonBlock  — a rectangular shimmer block, takes width/height
SkeletonText   — 1–3 lines of text shimmer, configurable line count
SkeletonCard   — full glass-panel card skeleton with title + body lines
SkeletonAvatar — circular shimmer for user avatar
```

CSS: `@keyframes shimmer` sweeps a diagonal gradient left-to-right over a `bg-white/5` base. Matches the existing glass aesthetic precisely.

### 4.6 WorkspaceShell wired to live data

Current state: hardcoded strings ("1,280 credits"), no real user data, inspector panel is static.

After Sprint 1:
- User name and avatar in nav header (from `useAuthStore().user`)
- Credit balance from `user.credits_remaining` (live, refreshed when workspace loads)
- Active workspace name from `useAuthStore().workspace.name`
- Notification bell badge shows unread count (from `GET /api/notifications` — minimal endpoint added to `ops.py`)
- Inspector panel shows: active WebSocket connection status, current workspace id, last WS event type received
- Nav active state reflects current pathname (replace hardcoded `index === 0` highlight)
- Sign-out button in nav footer (calls `signOut()` from auth store)

### 4.7 Workspace page (`/workspace`)

Current state: renders `WorkspaceShell` with placeholder children.

After Sprint 1, `/workspace` renders a real dashboard:
- **Header stat cards** (3): Total Projects, Active Generations (always 0 in Sprint 1 — placeholder), Credits Remaining
- **Projects grid**: fetches `listProjects(workspace.id)` via TanStack Query, renders `ProjectCard` components
  - ProjectCard: glass-panel, project name, mode badge, created date, "Open" CTA (routes to `/workspace?project={id}`)
  - Loading state: 3 × `SkeletonCard`
  - Empty state: illustrated empty state with "Create your first project" CTA
- **Create Project modal** (Radix `Dialog`):
  - Fields: Name (required), Description (optional), Mode selector (multimodal / text / image / video)
  - Optimistic insert: card appears immediately in grid before API responds, with `SkeletonCard` shimmer, replaced on success
  - Error: modal stays open with inline error message

### 4.8 WebSocket hook (`src/lib/hooks/use-websocket.ts`)

```ts
function useWorkspaceWebSocket(workspaceId: string): {
  status: 'connecting' | 'connected' | 'disconnected'
  lastEvent: WSMessage | null
  send(msg: WSClientMessage): void
}
```

**Reconnect strategy:**
- Initial connect: immediate
- On disconnect: exponential backoff — 1s, 2s, 4s, 8s, max 30s
- Stops reconnecting after 5 consecutive failures (sets status `'disconnected'` permanently until user action)
- Resets backoff counter on successful connection
- Re-authenticates with fresh token from auth store on each reconnect attempt

**Token in URL:** the hook reads `token` from `useAuthStore()` and appends it as a query param. If token rotates (silent refresh), next reconnect uses the new token automatically.

**WS base URL:** the hook reads `process.env.NEXT_PUBLIC_WS_URL` (e.g. `ws://localhost:8000`) for the connection base URL, appending `/ws/{workspace_id}?token={token}`.

**Heartbeat:** the hook sends `{ type: 'ping', ts: Date.now() }` every 15 seconds after connection. The server responds with `{ type: 'pong', ts }`. If no pong is received within 10 seconds of a ping, the connection is treated as stale and closed, triggering the reconnect backoff sequence. This handles mobile sleep, network transitions, and tab throttling. The Redis presence TTL (30s) is intentionally longer than the ping interval (15s) — a single missed ping does not drop presence; a genuine disconnect (two missed pings before server-side TTL expiry) does.

**Integration:** `WorkspaceShell` mounts this hook when `workspace.id` is available. The inspector panel's "Live system" card displays the connection status and last event type.

### 4.9 Typed WebSocket event types (`@aether/types`)

```ts
// Server → Client
type WSMessage =
  | { type: 'connected'; workspaceId: string; userId: string; ts: number }
  | { type: 'error'; code: string; message: string; ts: number }
  | { type: 'workspace.presence'; userIds: string[]; ts: number }
  | { type: 'generation.queued'; generationId: string; ts: number }
  | { type: 'generation.progress'; generationId: string; progress: number; ts: number }
  | { type: 'generation.completed'; generationId: string; outputUrl?: string; ts: number }
  | { type: 'generation.failed'; generationId: string; error: string; ts: number }
  | { type: 'training.progress'; jobId: string; progress: number; workerStatus: string; ts: number }
  | { type: 'training.completed'; jobId: string; artifactPaths: Record<string, string>; ts: number }
  | { type: 'notification'; id: string; title: string; body: string; kind: string; ts: number }
  | { type: 'pong'; ts: number }

// Client → Server (Sprint 1: only ping)
type WSClientMessage =
  | { type: 'ping'; ts: number }
```

The generation and training event types are defined now but not produced until Sprints 2 and 4. Defining them in Sprint 1 means Sprint 2 just needs to publish — the consumer infrastructure is already in place.

### 4.10 TanStack Query invalidation conventions

Standardized patterns established in Sprint 1 so all future sprints follow the same conventions:

| Query key | Invalidated by | Stale time |
|---|---|---|
| `['me']` | `signOut()`, `silentRefresh()` succeeds | 60s |
| `['workspaces']` | (nothing in Sprint 1) | 60s |
| `['projects', workspaceId]` | `createProject()` success | 30s |
| `['notifications', workspaceId]` | WS `notification` event received | 0s (always fresh) |

**Convention:** all mutation `onSuccess` handlers call `queryClient.invalidateQueries({ queryKey: [...] })` using these exact key shapes. No ad-hoc string keys anywhere. Query key constants are exported from `src/lib/api/query-keys.ts` so they are never duplicated:

```ts
export const QK = {
  me: () => ['me'] as const,
  workspaces: () => ['workspaces'] as const,
  projects: (workspaceId: string) => ['projects', workspaceId] as const,
  notifications: (workspaceId: string) => ['notifications', workspaceId] as const,
  // Sprint 2+ keys added here:
  generations: (workspaceId: string) => ['generations', workspaceId] as const,
  datasets: (workspaceId: string) => ['datasets', workspaceId] as const,
  trainingJobs: (workspaceId: string) => ['training-jobs', workspaceId] as const,
  models: (workspaceId: string) => ['models', workspaceId] as const,
}
```

Sprint 2–4 keys are stubbed here now so there is never a "what key do I use?" ambiguity later.

---

## 5. Shared Types Package (`@aether/types`)

Add to `packages/types/src/index.ts`:

```ts
export interface Workspace {
  id: string
  name: string
  plan: 'studio' | 'pro' | 'enterprise'
  createdAt: string
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  description: string | null
  mode: 'multimodal' | 'text' | 'image' | 'video'
  createdAt: string
}

export interface WorkspaceDetail extends Workspace {
  projects: Project[]
}

// Re-export all WS event types above
export type { WSMessage, WSClientMessage }
```

Existing types (`User`, `Generation`, `NotificationItem`, `AuthResponse`) are kept. `AuthResponse` is updated: `accessToken` → maps to backend's `access_token` snake_case (the API client layer does the camelCase conversion).

---

## 6. Audit & Event Logging

Minimal additions to existing `audit()` function. No new infrastructure. Events logged in Sprint 1:

| Event | Target type | Trigger |
|---|---|---|
| `auth.signup` | `user` | Already exists |
| `auth.signin` | `user` | Already exists |
| `auth.signout` | `user` | Add to signout endpoint |
| `auth.token_refresh` | `user` | New refresh endpoint |
| `ws.connect` | `workspace` | New WS handler |
| `ws.disconnect` | `workspace` | New WS handler |
| `project.create` | `project` | Already exists |
| `workspace.list` | `workspace` | New — add to list endpoint |

All audit rows written via the existing `audit()` helper. No changes to `AuditLog` model.

---

## 7. Environment Variables

### `backend/api/.env.example` (finalized)
```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/aether
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=change-me-to-a-32-char-random-string
JWT_ALGORITHM=HS256
ACCESS_TOKEN_TTL_MINUTES=30
REFRESH_TOKEN_TTL_DAYS=14
ENVIRONMENT=development
RATE_LIMIT_PER_MINUTE=120
HUGGINGFACE_TOKEN=
KAGGLE_USERNAME=
KAGGLE_KEY=
OBJECT_STORAGE_URL=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=
MODEL_REGISTRY_PATH=./artifacts/models
TRAINING_OUTPUT_PATH=./artifacts/training
```

### `frontend/app/.env.example` (finalized)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

---

## 8. Docker-compose fix

The current `docker-compose.yml` points `api` and `worker` at `.env.example` (a placeholder). Fix: point to `.env` and add a note in the README that `.env` must be created from `.env.example` before running. The `web` service similarly points to `.env.example` — fix to `.env`.

Add `healthcheck` to `db` service so `api` waits for Postgres to be ready:
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres"]
  interval: 5s
  retries: 5
```
Add `depends_on: db: condition: service_healthy` to `api`.

---

## 9. Data Flow: App Boot Sequence

```
Browser loads /workspace
  → Next.js middleware checks aether_refresh cookie
  → cookie absent → redirect to /signin
  → cookie present → allow render

Browser loads any protected route with valid cookie
  → page renders with status='loading' → full-screen skeleton
  → AppProviders mounts → hydrate() fires
  → reads aether_token from localStorage
  → calls GET /api/auth/me (with token)
  → success → setAuth(token, user)
  → calls GET /api/workspaces
  → setWorkspace(workspaces[0])
  → status='authenticated' → skeleton replaced with real layout
  → WorkspaceShell mounts → useWorkspaceWebSocket connects
  → WS sends {type:'connected'} → inspector panel shows green dot
```

---

## 10. Error Handling

| Scenario | Frontend behaviour | Backend behaviour |
|---|---|---|
| Network timeout on API call | `ApiError` with `status: 0`, retry button in component | — |
| 401 on protected endpoint | silent refresh → retry once → if still 401: signOut + redirect `/signin` | Standard 401 JSON response |
| 401 on `/api/auth/refresh` | signOut + redirect `/signin` with `?expired=1` | 401 with `{"detail": "Refresh token expired or revoked"}` |
| 422 validation error | Field-level errors shown in form, generic toast for non-form calls | Pydantic default 422 response |
| WS auth failure | Status `'disconnected'`, inspector shows "Auth failed — please reload" | Close code 4001 |
| WS unexpected disconnect | Exponential backoff reconnect (max 5 attempts) | — |
| Project creation optimistic failure | Optimistic card removed, error toast, modal re-opens with data preserved | Standard 4xx |

---

## 11. File Tree (Sprint 1 additions/changes)

```
backend/api/src/
  models.py                  ← add RefreshToken
  schemas.py                 ← add RefreshResponse, extend UserResponse
  security.py                ← add refresh token helpers
  routers/
    auth.py                  ← add /me, /refresh; extend /signup, /signin, /signout
  realtime.py                ← replace echo with auth-gated WS + Redis presence

frontend/app/src/
  middleware.ts              ← NEW: route guard
  lib/
    api/
      client.ts              ← NEW: typed base client with silent refresh + X-Request-ID
      auth.ts                ← NEW: auth API functions
      workspaces.ts          ← NEW: workspace/project API functions
      query-keys.ts          ← NEW: canonical TanStack Query key constants
    store/
      auth.ts                ← NEW: auth + workspace state
      app-shell.ts           ← extend: remove hardcoded data
    hooks/
      use-websocket.ts       ← NEW: reconnecting WS hook
  components/
    ui/
      skeleton.tsx           ← NEW: SkeletonBlock, SkeletonText, SkeletonCard, SkeletonAvatar
      toast.tsx              ← NEW: ToastRegion + imperative toast API
    auth/
      auth-card.tsx          ← replace with react-hook-form + zod version
    workspace/
      app-shell.tsx          ← wire to real data
      workspace-dashboard.tsx ← NEW: project grid + stat cards
      project-card.tsx       ← NEW: project card component
      create-project-modal.tsx ← NEW: Radix Dialog + form

packages/types/src/
  index.ts                   ← extend: Workspace, Project, WSMessage, WSClientMessage

infra/
  docker-compose.yml         ← fix env_file refs, add db healthcheck
```

---

## 12. Out of Scope for Sprint 1

The following are explicitly deferred:

- OAuth (Google/GitHub) — buttons show "Coming soon" tooltip
- Email verification flow
- Password reset flow (page exists, form is non-functional — leave as-is)
- Team invitations and multi-user workspaces
- Billing integration
- Any generation, dataset, or training functionality
- Object storage integration (bucket creation, upload)
- The ML service
- Celery worker tasks

---

## 13. Definition of Done

Sprint 1 is complete when:

1. `docker compose up` from `infra/` starts all services with no errors
2. A user can sign up at `/signup`, land on `/workspace`, and see their workspace name and credit balance loaded from the API
3. A user can sign out, be redirected to `/signin`, and re-authenticate
4. Direct navigation to `/workspace` without a session redirects to `/signin`
5. Direct navigation to `/signin` with an active session redirects to `/workspace`
6. Silent refresh: an expired access token is automatically exchanged for a new one without user action
7. The WebSocket connection indicator in the inspector panel shows green after workspace load
8. A user can create a project via the modal, see it appear optimistically, and have it persist on page refresh
9. All TypeScript typechecks pass (`pnpm typecheck`)
10. No hardcoded strings remain in the WorkspaceShell for user name, credit balance, or workspace name

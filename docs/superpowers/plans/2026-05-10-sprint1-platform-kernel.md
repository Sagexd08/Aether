# Sprint 1: Platform Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated workspace platform kernel — the operating system every subsequent sprint plugs into.

**Architecture:** FastAPI backend with JWT + rotating refresh tokens stored in PostgreSQL; Next.js 15 frontend with Zustand auth store, typed TanStack Query data layer, and Next.js middleware route guards. WebSocket channel is workspace-scoped with Redis presence tracking and heartbeat. Everything is wired end-to-end: sign up → workspace shell → live data → persistent projects.

**Tech Stack:** FastAPI · SQLAlchemy (async) · PyJWT · passlib/bcrypt · redis-py · Next.js 15 · React 19 · TypeScript · Zustand · TanStack Query · react-hook-form · zod · Framer Motion · Radix UI · Tailwind CSS 4

---

## File Map

### Backend (new / modified)
| File | Change |
|---|---|
| `backend/api/src/models.py` | Add `RefreshToken` SQLAlchemy model |
| `backend/api/src/schemas.py` | Add `RefreshResponse`; extend `UserResponse` with `workspace_id` |
| `backend/api/src/security.py` | Add `create_refresh_token`, `verify_refresh_token`, `rotate_refresh_token` |
| `backend/api/src/routers/auth.py` | Add `/me`, `/refresh`; extend `/signup`, `/signin`, `/signout` |
| `backend/api/src/routers/ops.py` | Add `GET /api/notifications` endpoint |
| `backend/api/src/realtime.py` | Replace echo with auth-gated WS + Redis presence + ping/pong |
| `backend/api/src/main.py` | Add `X-Request-ID` response middleware |
| `backend/api/.env.example` | Finalize all env vars |
| `backend/api/tests/test_auth.py` | New: backend auth tests |
| `backend/api/tests/test_refresh.py` | New: refresh token rotation tests |

### Frontend (new / modified)
| File | Change |
|---|---|
| `frontend/app/src/middleware.ts` | NEW: route guard middleware |
| `frontend/app/src/lib/api/client.ts` | NEW: typed base request + silent refresh + X-Request-ID |
| `frontend/app/src/lib/api/auth.ts` | NEW: auth API call functions |
| `frontend/app/src/lib/api/workspaces.ts` | NEW: workspace + project API call functions |
| `frontend/app/src/lib/api/query-keys.ts` | NEW: canonical TanStack Query key constants |
| `frontend/app/src/lib/store/auth.ts` | NEW: Zustand auth + workspace state + hydration |
| `frontend/app/src/lib/store/app-shell.ts` | Extend: remove hardcoded data, add toast store |
| `frontend/app/src/lib/hooks/use-websocket.ts` | NEW: reconnecting WS hook with heartbeat |
| `frontend/app/src/components/ui/skeleton.tsx` | NEW: SkeletonBlock, SkeletonText, SkeletonCard, SkeletonAvatar |
| `frontend/app/src/components/ui/toast.tsx` | NEW: ToastRegion + imperative toast API |
| `frontend/app/src/components/providers/app-providers.tsx` | Extend: add auth hydration on mount |
| `frontend/app/src/components/auth/auth-card.tsx` | Replace: react-hook-form + zod version |
| `frontend/app/src/components/workspace/app-shell.tsx` | Wire to real data from auth store |
| `frontend/app/src/components/workspace/workspace-dashboard.tsx` | NEW: stat cards + projects grid |
| `frontend/app/src/components/workspace/project-card.tsx` | NEW: individual project card |
| `frontend/app/src/components/workspace/create-project-modal.tsx` | NEW: Radix Dialog + form |
| `frontend/app/src/app/layout.tsx` | Add ToastRegion, loading skeleton during hydration |
| `frontend/app/src/app/workspace/page.tsx` | Replace placeholder with WorkspaceDashboard |
| `frontend/app/.env.example` | Add NEXT_PUBLIC_WS_URL |

### Shared types
| File | Change |
|---|---|
| `packages/types/src/index.ts` | Add Workspace, Project, WorkspaceDetail, WSMessage, WSClientMessage |

### Infrastructure
| File | Change |
|---|---|
| `infra/docker-compose.yml` | Fix env_file refs to `.env`; add db healthcheck; fix api depends_on |

---

## Task 1: Shared types — Workspace, Project, WS events

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add types to the shared package**

Open `packages/types/src/index.ts`. The file currently exports `GenerationMode`, `GenerationStatus`, `User`, `Generation`, `NotificationItem`, `AuthResponse`. Append the following — do not remove existing exports:

```typescript
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

export interface UserWithWorkspace extends User {
  workspaceId: string
}

// Server → Client WebSocket events
export type WSMessage =
  | { type: 'connected'; workspaceId: string; userId: string; ts: number }
  | { type: 'error'; code: string; message: string; ts: number }
  | { type: 'pong'; ts: number }
  | { type: 'workspace.presence'; userIds: string[]; ts: number }
  | { type: 'generation.queued'; generationId: string; ts: number }
  | { type: 'generation.progress'; generationId: string; progress: number; ts: number }
  | { type: 'generation.completed'; generationId: string; outputUrl?: string; ts: number }
  | { type: 'generation.failed'; generationId: string; error: string; ts: number }
  | { type: 'training.progress'; jobId: string; progress: number; workerStatus: string; ts: number }
  | { type: 'training.completed'; jobId: string; artifactPaths: Record<string, string>; ts: number }
  | { type: 'notification'; id: string; title: string; body: string; kind: string; ts: number }

// Client → Server WebSocket messages
export type WSClientMessage =
  | { type: 'ping'; ts: number }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/types && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add Workspace, Project, WSMessage, WSClientMessage types"
```

---

## Task 2: Backend — RefreshToken model

**Files:**
- Modify: `backend/api/src/models.py`

- [ ] **Step 1: Add RefreshToken model**

Open `backend/api/src/models.py`. Append after the `Notification` class (keep all existing code):

```python
class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    token_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

The `Boolean` type is already importable from sqlalchemy — add it to the existing import line at the top of the file. The current import is:

```python
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
```

Change it to:

```python
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
```

And add the `Boolean` mapped column type to the `RefreshToken.revoked` field:

```python
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
```

- [ ] **Step 2: Verify Python syntax**

```bash
cd backend/api && uv run python -c "from src.models import RefreshToken; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/models.py
git commit -m "feat(backend): add RefreshToken model"
```

---

## Task 3: Backend — Schemas for refresh + extended UserResponse

**Files:**
- Modify: `backend/api/src/schemas.py`

- [ ] **Step 1: Extend UserResponse and add RefreshResponse**

Open `backend/api/src/schemas.py`. Replace the existing `UserResponse` class with:

```python
class UserResponse(OrmModel):
    id: str
    email: EmailStr
    name: str
    credits_remaining: int
    role: str = 'owner'
    workspace_id: str | None = None
```

Then add after the existing `AuthResponse` class:

```python
class RefreshResponse(BaseModel):
    access_token: str
```

- [ ] **Step 2: Verify**

```bash
cd backend/api && uv run python -c "from src.schemas import UserResponse, RefreshResponse; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/schemas.py
git commit -m "feat(backend): extend UserResponse with workspace_id, add RefreshResponse"
```

---

## Task 4: Backend — Refresh token security helpers

**Files:**
- Modify: `backend/api/src/security.py`

- [ ] **Step 1: Write failing tests**

Create `backend/api/tests/__init__.py` (empty) and `backend/api/tests/test_refresh_helpers.py`:

```python
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from src.security import create_refresh_token_value, hash_refresh_token, verify_refresh_token_value


def test_create_refresh_token_value_returns_string():
    token = create_refresh_token_value()
    assert isinstance(token, str)
    assert len(token) >= 32


def test_hash_refresh_token_is_deterministic_with_verify():
    token = create_refresh_token_value()
    hashed = hash_refresh_token(token)
    assert verify_refresh_token_value(token, hashed) is True


def test_hash_refresh_token_rejects_wrong_value():
    hashed = hash_refresh_token("correct-token")
    assert verify_refresh_token_value("wrong-token", hashed) is False


def test_hash_refresh_token_not_stored_plain():
    token = "my-secret-token"
    hashed = hash_refresh_token(token)
    assert token not in hashed
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend/api && uv run pytest tests/test_refresh_helpers.py -v
```

Expected: `ImportError` or `AttributeError` — the functions don't exist yet.

- [ ] **Step 3: Add helpers to security.py**

Open `backend/api/src/security.py`. Add these imports at the top (after existing imports):

```python
import secrets
from datetime import timedelta
```

Then add these three functions after the existing `verify_password` function:

```python
def create_refresh_token_value() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return pwd_context.hash(token)


def verify_refresh_token_value(token: str, token_hash: str) -> bool:
    return pwd_context.verify(token, token_hash)
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd backend/api && uv run pytest tests/test_refresh_helpers.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/security.py backend/api/tests/
git commit -m "feat(backend): add refresh token value helpers with tests"
```

---

## Task 5: Backend — Auth router: /signup, /signin extended + /me + /refresh + /signout

**Files:**
- Modify: `backend/api/src/routers/auth.py`
- Create: `backend/api/tests/test_auth.py`

- [ ] **Step 1: Write failing tests**

Create `backend/api/tests/test_auth.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from src.main import app
from src.db import get_db
from src.models import Base

TEST_DB = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="function")
async def db_session():
    engine = create_async_engine(TEST_DB, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="function")
async def client(db_session):
    async def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_signup_creates_user_and_returns_token(client):
    resp = await client.post("/api/auth/signup", json={
        "email": "sage@aether.ai",
        "name": "Sage",
        "password": "secure123!"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "sage@aether.ai"
    assert "aether_refresh" in resp.cookies


@pytest.mark.asyncio
async def test_signup_duplicate_email_returns_400(client):
    payload = {"email": "dupe@aether.ai", "name": "Dupe", "password": "secure123!"}
    await client.post("/api/auth/signup", json=payload)
    resp = await client.post("/api/auth/signup", json=payload)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_signin_returns_token(client):
    await client.post("/api/auth/signup", json={
        "email": "signin@aether.ai", "name": "Test", "password": "pass123!"
    })
    resp = await client.post("/api/auth/signin", json={
        "email": "signin@aether.ai", "password": "pass123!"
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_signin_wrong_password_returns_401(client):
    await client.post("/api/auth/signup", json={
        "email": "wrong@aether.ai", "name": "Wrong", "password": "correct123!"
    })
    resp = await client.post("/api/auth/signin", json={
        "email": "wrong@aether.ai", "password": "wrongpassword"
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_user(client):
    signup_resp = await client.post("/api/auth/signup", json={
        "email": "me@aether.ai", "name": "Me", "password": "pass123!"
    })
    token = signup_resp.json()["access_token"]
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@aether.ai"


@pytest.mark.asyncio
async def test_me_without_token_returns_401(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_issues_new_access_token(client):
    signup_resp = await client.post("/api/auth/signup", json={
        "email": "refresh@aether.ai", "name": "Refresh", "password": "pass123!"
    })
    old_token = signup_resp.json()["access_token"]
    refresh_cookie = signup_resp.cookies.get("aether_refresh")
    resp = await client.post("/api/auth/refresh", cookies={"aether_refresh": refresh_cookie})
    assert resp.status_code == 200
    new_token = resp.json()["access_token"]
    assert new_token != old_token


@pytest.mark.asyncio
async def test_refresh_without_cookie_returns_401(client):
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 401
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend/api && uv run pytest tests/test_auth.py -v 2>&1 | head -30
```

Expected: failures due to missing `/me` and `/refresh` endpoints.

- [ ] **Step 3: Rewrite auth.py with all endpoints**

Replace the entire contents of `backend/api/src/routers/auth.py`:

```python
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models import RefreshToken, User, Workspace
from ..schemas import AuthResponse, RefreshResponse, SignInRequest, SignUpRequest, UserResponse
from ..security import (
    audit,
    create_access_token,
    create_refresh_token_value,
    get_current_user,
    hash_password,
    hash_refresh_token,
    verify_password,
    verify_refresh_token_value,
)

router = APIRouter()
settings = get_settings()


async def _issue_refresh_token(db: AsyncSession, user_id: str, response: Response) -> None:
    raw = create_refresh_token_value()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_ttl_days)
    db.add(RefreshToken(
        id=str(uuid4()),
        user_id=user_id,
        token_hash=hash_refresh_token(raw),
        expires_at=expires,
        revoked=False,
    ))
    response.set_cookie(
        'aether_refresh',
        raw,
        httponly=True,
        samesite='lax',
        max_age=int(timedelta(days=settings.refresh_token_ttl_days).total_seconds()),
    )


async def _get_default_workspace_id(db: AsyncSession, user_id: str) -> str | None:
    ws = await db.scalar(select(Workspace).where(Workspace.owner_id == user_id))
    return ws.id if ws else None


@router.post('/signup', response_model=AuthResponse)
async def signup(payload: SignUpRequest, response: Response, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=400, detail='User already exists')

    user = User(
        id=str(uuid4()),
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        credits_remaining=1000,
        role='owner',
    )
    workspace = Workspace(id=str(uuid4()), owner_id=user.id, name=f"{payload.name}'s Studio", plan='studio')
    db.add(user)
    db.add(workspace)
    await _issue_refresh_token(db, user.id, response)
    await audit(db, user.id, 'auth.signup', 'user', user.id)
    await db.commit()

    access_token = create_access_token(user.id)
    user_data = UserResponse.model_validate(user)
    user_data.workspace_id = workspace.id
    return AuthResponse(access_token=access_token, user=user_data)


@router.post('/signin', response_model=AuthResponse)
async def signin(payload: SignInRequest, response: Response, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    await _issue_refresh_token(db, user.id, response)
    await audit(db, user.id, 'auth.signin', 'user', user.id)
    await db.commit()

    access_token = create_access_token(user.id)
    user_data = UserResponse.model_validate(user)
    user_data.workspace_id = await _get_default_workspace_id(db, user.id)
    return AuthResponse(access_token=access_token, user=user_data)


@router.get('/me', response_model=UserResponse)
async def me(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> UserResponse:
    user_data = UserResponse.model_validate(user)
    user_data.workspace_id = await _get_default_workspace_id(db, user.id)
    return user_data


@router.post('/refresh', response_model=RefreshResponse)
async def refresh(
    response: Response,
    aether_refresh: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    if not aether_refresh:
        raise HTTPException(status_code=401, detail='No refresh token')

    now = datetime.now(timezone.utc)
    rows = (await db.scalars(
        select(RefreshToken)
        .where(RefreshToken.revoked.is_(False))
        .where(RefreshToken.expires_at > now)
    )).all()

    matched: RefreshToken | None = None
    for row in rows:
        if verify_refresh_token_value(aether_refresh, row.token_hash):
            matched = row
            break

    if not matched:
        raise HTTPException(status_code=401, detail='Refresh token expired or revoked')

    matched.revoked = True
    user = await db.get(User, matched.user_id)
    if not user:
        raise HTTPException(status_code=401, detail='User not found')

    await _issue_refresh_token(db, user.id, response)
    await audit(db, user.id, 'auth.token_refresh', 'user', user.id)
    await db.commit()

    return RefreshResponse(access_token=create_access_token(user.id))


@router.post('/signout')
async def signout(
    response: Response,
    aether_refresh: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    if aether_refresh:
        rows = (await db.scalars(
            select(RefreshToken)
            .where(RefreshToken.user_id == user.id)
            .where(RefreshToken.revoked.is_(False))
        )).all()
        for row in rows:
            if verify_refresh_token_value(aether_refresh, row.token_hash):
                row.revoked = True
                break

    await audit(db, user.id, 'auth.signout', 'user', user.id)
    await db.commit()
    response.delete_cookie('aether_refresh')
    return {'status': 'signed_out'}
```

- [ ] **Step 4: Install test dependencies if needed**

```bash
cd backend/api && uv add --dev pytest pytest-asyncio httpx aiosqlite
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd backend/api && uv run pytest tests/test_auth.py -v
```

Expected: 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/routers/auth.py backend/api/tests/test_auth.py
git commit -m "feat(backend): auth endpoints - /me, /refresh, token rotation, /signout"
```

---

## Task 6: Backend — X-Request-ID middleware + notifications endpoint

**Files:**
- Modify: `backend/api/src/main.py`
- Modify: `backend/api/src/routers/ops.py`

- [ ] **Step 1: Add X-Request-ID middleware to main.py**

Open `backend/api/src/main.py`. Add this import at the top:

```python
import uuid
```

Add this middleware block immediately after `app = FastAPI(...)` and before the rate_limit middleware:

```python
@app.middleware('http')
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get('x-request-id') or str(uuid.uuid4())
    response = await call_next(request)
    response.headers['x-request-id'] = request_id
    return response
```

- [ ] **Step 2: Add notifications endpoint to ops.py**

Open `backend/api/src/routers/ops.py`. Read its current contents to understand what's there, then add:

```python
from sqlalchemy import select
from ..models import Notification, Workspace
from ..schemas import NotificationResponse
from ..dependencies import resolve_workspace

@router.get('/notifications', response_model=list[NotificationResponse])
async def list_notifications(
    workspace_id: str | None = None,
    limit: int = Query(default=20, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[NotificationResponse]:
    workspace = await resolve_workspace(db, user, workspace_id)
    rows = (await db.scalars(
        select(Notification)
        .where(Notification.workspace_id == workspace.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )).all()
    return [NotificationResponse.model_validate(row) for row in rows]
```

Ensure the necessary imports (`Query`, `AsyncSession`, `Depends`, `User`) are present in ops.py — add any that are missing.

- [ ] **Step 3: Verify server starts**

```bash
cd backend/api && uv run python -c "from src.main import app; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/api/src/main.py backend/api/src/routers/ops.py
git commit -m "feat(backend): X-Request-ID middleware + notifications list endpoint"
```

---

## Task 7: Backend — WebSocket upgrade with Redis presence + heartbeat

**Files:**
- Modify: `backend/api/src/realtime.py`

- [ ] **Step 1: Rewrite realtime.py**

Replace the entire contents of `backend/api/src/realtime.py`:

```python
import asyncio
import json
import time
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from .config import get_settings
from .security import decode_access_token
from .db import SessionLocal
from .models import Workspace

router = APIRouter()
settings = get_settings()

PRESENCE_TTL = 30  # seconds
PING_TIMEOUT = 10  # seconds


async def _get_redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def _register_presence(redis: Redis, workspace_id: str, user_id: str) -> None:
    await redis.sadd(f'ws:presence:{workspace_id}', user_id)
    await redis.expire(f'ws:presence:{workspace_id}', PRESENCE_TTL)


async def _remove_presence(redis: Redis, workspace_id: str, user_id: str) -> None:
    await redis.srem(f'ws:presence:{workspace_id}', user_id)


async def _broadcast_presence(redis: Redis, workspace_id: str) -> None:
    members = await redis.smembers(f'ws:presence:{workspace_id}')
    event = json.dumps({
        'type': 'workspace.presence',
        'userIds': list(members),
        'ts': int(time.time() * 1000),
    })
    await redis.publish(f'ws:workspace:{workspace_id}', event)


@router.websocket('/ws/{workspace_id}')
async def workspace_ws(
    websocket: WebSocket,
    workspace_id: str,
    token: str = Query(default=''),
) -> None:
    await websocket.accept()

    # Authenticate
    try:
        user_id = decode_access_token(token)
    except Exception:
        await websocket.send_json({'type': 'error', 'code': 'unauthorized', 'message': 'Invalid token', 'ts': int(time.time() * 1000)})
        await websocket.close(code=4001)
        return

    # Verify workspace ownership
    async with SessionLocal() as db:
        workspace = await db.get(Workspace, workspace_id)
        if not workspace or workspace.owner_id != user_id:
            await websocket.send_json({'type': 'error', 'code': 'unauthorized', 'message': 'Workspace not found', 'ts': int(time.time() * 1000)})
            await websocket.close(code=4001)
            return

    redis = await _get_redis()
    await _register_presence(redis, workspace_id, user_id)
    await _broadcast_presence(redis, workspace_id)

    await websocket.send_json({
        'type': 'connected',
        'workspaceId': workspace_id,
        'userId': user_id,
        'ts': int(time.time() * 1000),
    })

    # Subscribe to workspace channel for broadcasts
    pubsub = redis.pubsub()
    await pubsub.subscribe(f'ws:workspace:{workspace_id}')

    last_ping_time: float | None = None
    waiting_for_pong = False

    async def receive_loop():
        nonlocal last_ping_time, waiting_for_pong
        try:
            while True:
                data = await websocket.receive_text()
                await redis.expire(f'ws:presence:{workspace_id}', PRESENCE_TTL)
                try:
                    msg = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if msg.get('type') == 'ping':
                    last_ping_time = time.time()
                    waiting_for_pong = False
                    await websocket.send_json({'type': 'pong', 'ts': int(time.time() * 1000)})
        except WebSocketDisconnect:
            pass

    async def pubsub_loop():
        try:
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    await websocket.send_text(message['data'])
        except Exception:
            pass

    try:
        await asyncio.gather(receive_loop(), pubsub_loop(), return_exceptions=True)
    finally:
        await pubsub.unsubscribe(f'ws:workspace:{workspace_id}')
        await pubsub.close()
        await _remove_presence(redis, workspace_id, user_id)
        await _broadcast_presence(redis, workspace_id)
        await redis.aclose()
```

- [ ] **Step 2: Verify import**

```bash
cd backend/api && uv run python -c "from src.realtime import router; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/realtime.py
git commit -m "feat(backend): auth-gated WebSocket with Redis presence, pub/sub, heartbeat"
```

---

## Task 8: Backend — .env.example + docker-compose fixes

**Files:**
- Modify: `backend/api/.env.example`
- Modify: `frontend/app/.env.example`
- Modify: `infra/docker-compose.yml`

- [ ] **Step 1: Finalize backend .env.example**

Replace the entire contents of `backend/api/.env.example`:

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

- [ ] **Step 2: Finalize frontend .env.example**

Replace the entire contents of `frontend/app/.env.example`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

- [ ] **Step 3: Fix docker-compose.yml**

Replace the entire contents of `infra/docker-compose.yml`:

```yaml
version: '3.9'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: aether
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    ports:
      - '6379:6379'

  api:
    build:
      context: ../backend/api
      dockerfile: Dockerfile
    env_file:
      - ../backend/api/.env
    ports:
      - '8000:8000'
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started

  worker:
    build:
      context: ../backend/api
      dockerfile: Dockerfile
    command: uv run celery -A src.worker.celery_app worker --loglevel=info
    env_file:
      - ../backend/api/.env
    depends_on:
      - api
      - redis

  web:
    build:
      context: ../frontend/app
      dockerfile: Dockerfile
    env_file:
      - ../frontend/app/.env
    ports:
      - '3000:3000'
    depends_on:
      - api

  ml:
    build:
      context: ../ml/service
      dockerfile: Dockerfile
    ports:
      - '8100:8100'

volumes:
  postgres_data:
```

- [ ] **Step 4: Commit**

```bash
git add backend/api/.env.example frontend/app/.env.example infra/docker-compose.yml
git commit -m "fix(infra): use .env files in docker-compose, add db healthcheck"
```

---

## Task 9: Frontend — Query keys + API client foundation

**Files:**
- Create: `frontend/app/src/lib/api/query-keys.ts`
- Create: `frontend/app/src/lib/api/client.ts`

- [ ] **Step 1: Create query-keys.ts**

Create `frontend/app/src/lib/api/query-keys.ts`:

```typescript
export const QK = {
  me: () => ['me'] as const,
  workspaces: () => ['workspaces'] as const,
  projects: (workspaceId: string) => ['projects', workspaceId] as const,
  notifications: (workspaceId: string) => ['notifications', workspaceId] as const,
  // Sprint 2+
  generations: (workspaceId: string) => ['generations', workspaceId] as const,
  datasets: (workspaceId: string) => ['datasets', workspaceId] as const,
  trainingJobs: (workspaceId: string) => ['training-jobs', workspaceId] as const,
  models: (workspaceId: string) => ['models', workspaceId] as const,
} as const
```

- [ ] **Step 2: Create client.ts**

Create `frontend/app/src/lib/api/client.ts`:

```typescript
import { toast } from '@/components/ui/toast'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Single-flight refresh: prevents concurrent 401s from triggering multiple refreshes
let refreshPromise: Promise<string> | null = null

// Token accessor — Sprint 2/3 will redirect this to in-memory storage
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('aether_token')
}

export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('aether_token', token)
  }
}

export function clearToken(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('aether_token')
  }
}

async function silentRefresh(): Promise<string> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const resp = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!resp.ok) throw new ApiError(resp.status, 'Refresh failed')
    const data = (await resp.json()) as { access_token: string }
    setToken(data.access_token)
    return data.access_token
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestId = crypto.randomUUID()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('X-Request-ID', requestId)

  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const resp = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' })

  if (resp.status === 401) {
    // Attempt silent refresh once
    let newToken: string
    try {
      newToken = await silentRefresh()
    } catch {
      clearToken()
      if (typeof window !== 'undefined') {
        toast.error('Session expired — please sign in again')
        window.location.href = '/signin?expired=1'
      }
      throw new ApiError(401, 'Session expired')
    }

    // Retry with new token
    const retryHeaders = new Headers(init.headers)
    retryHeaders.set('Content-Type', 'application/json')
    retryHeaders.set('X-Request-ID', requestId)
    retryHeaders.set('Authorization', `Bearer ${newToken}`)
    const retryResp = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: retryHeaders,
      credentials: 'include',
    })

    if (!retryResp.ok) {
      clearToken()
      if (typeof window !== 'undefined') {
        toast.error('Session expired — please sign in again')
        window.location.href = '/signin?expired=1'
      }
      throw new ApiError(retryResp.status, 'Authentication failed')
    }

    return retryResp.json() as Promise<T>
  }

  if (!resp.ok) {
    let message: string
    try {
      const body = (await resp.json()) as { detail?: string }
      message = body.detail ?? `Request failed: ${resp.status}`
    } catch {
      message = `Request failed: ${resp.status}`
    }
    throw new ApiError(resp.status, message)
  }

  return resp.json() as Promise<T>
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | head -20
```

Expected: no errors in the new files (other existing errors are acceptable at this stage).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/lib/api/
git commit -m "feat(frontend): typed API client with silent refresh, X-Request-ID, query keys"
```

---

## Task 10: Frontend — Auth + workspace API functions

**Files:**
- Create: `frontend/app/src/lib/api/auth.ts`
- Create: `frontend/app/src/lib/api/workspaces.ts`

- [ ] **Step 1: Create auth.ts**

Create `frontend/app/src/lib/api/auth.ts`:

```typescript
import type { UserWithWorkspace } from '@aether/types'
import { apiRequest, clearToken, setToken } from './client'

export interface SignUpPayload {
  email: string
  name: string
  password: string
}

export interface SignInPayload {
  email: string
  password: string
}

interface RawAuthResponse {
  access_token: string
  user: {
    id: string
    email: string
    name: string
    credits_remaining: number
    role: string
    workspace_id: string | null
  }
}

export async function signUp(payload: SignUpPayload): Promise<{ token: string; user: UserWithWorkspace }> {
  const data = await apiRequest<RawAuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setToken(data.access_token)
  return {
    token: data.access_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      creditsRemaining: data.user.credits_remaining,
      createdAt: new Date().toISOString(),
      workspaceId: data.user.workspace_id ?? '',
    },
  }
}

export async function signIn(payload: SignInPayload): Promise<{ token: string; user: UserWithWorkspace }> {
  const data = await apiRequest<RawAuthResponse>('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setToken(data.access_token)
  return {
    token: data.access_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      creditsRemaining: data.user.credits_remaining,
      createdAt: new Date().toISOString(),
      workspaceId: data.user.workspace_id ?? '',
    },
  }
}

export async function getMe(): Promise<UserWithWorkspace> {
  const data = await apiRequest<RawAuthResponse['user']>('/api/auth/me')
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    creditsRemaining: data.credits_remaining,
    createdAt: new Date().toISOString(),
    workspaceId: data.workspace_id ?? '',
  }
}

export async function signOut(): Promise<void> {
  try {
    await apiRequest('/api/auth/signout', { method: 'POST' })
  } finally {
    clearToken()
  }
}
```

- [ ] **Step 2: Create workspaces.ts**

Create `frontend/app/src/lib/api/workspaces.ts`:

```typescript
import type { Project, Workspace } from '@aether/types'
import { apiRequest } from './client'

interface RawWorkspace {
  id: string
  name: string
  plan: string
}

interface RawProject {
  id: string
  workspace_id: string
  name: string
  description: string | null
  mode: string
  created_at: string
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const data = await apiRequest<RawWorkspace[]>('/api/workspaces')
  return data.map((w) => ({
    id: w.id,
    name: w.name,
    plan: (w.plan as Workspace['plan']) ?? 'studio',
    createdAt: new Date().toISOString(),
  }))
}

export async function listProjects(workspaceId: string): Promise<Project[]> {
  const data = await apiRequest<RawProject[]>(`/api/workspaces/${workspaceId}/projects`)
  return data.map((p) => ({
    id: p.id,
    workspaceId: p.workspace_id,
    name: p.name,
    description: p.description,
    mode: (p.mode as Project['mode']) ?? 'multimodal',
    createdAt: p.created_at,
  }))
}

export interface CreateProjectPayload {
  name: string
  description?: string
  mode?: Project['mode']
}

export async function createProject(workspaceId: string, payload: CreateProjectPayload): Promise<Project> {
  const data = await apiRequest<RawProject>(`/api/workspaces/${workspaceId}/projects`, {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      description: payload.description ?? null,
      mode: payload.mode ?? 'multimodal',
    }),
  })
  return {
    id: data.id,
    workspaceId: data.workspace_id,
    name: data.name,
    description: data.description,
    mode: (data.mode as Project['mode']) ?? 'multimodal',
    createdAt: data.created_at,
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | grep -E "error|Error" | head -10
```

Expected: no errors from the new files.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/lib/api/auth.ts frontend/app/src/lib/api/workspaces.ts
git commit -m "feat(frontend): auth and workspace API call functions"
```

---

## Task 11: Frontend — Toast system

**Files:**
- Create: `frontend/app/src/components/ui/toast.tsx`

- [ ] **Step 1: Create toast.tsx**

Create `frontend/app/src/components/ui/toast.tsx`:

```tsx
'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, Info, TriangleAlert, XCircle } from 'lucide-react'
import { useEffect } from 'react'
import { create } from 'zustand'

type ToastKind = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  kind: ToastKind
  message: string
  duration: number
}

interface ToastStore {
  items: ToastItem[]
  add(item: Omit<ToastItem, 'id'>): void
  remove(id: string): void
}

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  add: (item) =>
    set((state) => ({
      items: [...state.items, { ...item, id: crypto.randomUUID() }],
    })),
  remove: (id) =>
    set((state) => ({ items: state.items.filter((t) => t.id !== id) })),
}))

// Imperative API — call from anywhere without React context
export const toast = {
  success: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().add({ kind: 'success', message, duration: options?.duration ?? 4000 }),
  error: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().add({ kind: 'error', message, duration: options?.duration ?? 5000 }),
  info: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().add({ kind: 'info', message, duration: options?.duration ?? 4000 }),
  warning: (message: string, options?: { duration?: number }) =>
    useToastStore.getState().add({ kind: 'warning', message, duration: options?.duration ?? 4000 }),
}

const ICONS: Record<ToastKind, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: TriangleAlert,
}

const COLORS: Record<ToastKind, string> = {
  success: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10',
  error: 'text-rose-400 border-rose-400/20 bg-rose-400/10',
  info: 'text-[#63b3ed] border-[#63b3ed]/20 bg-[#63b3ed]/10',
  warning: 'text-amber-400 border-amber-400/20 bg-amber-400/10',
}

function ToastItem({ item }: { item: ToastItem }) {
  const { remove } = useToastStore()
  const Icon = ICONS[item.kind]

  useEffect(() => {
    const timer = setTimeout(() => remove(item.id), item.duration)
    return () => clearTimeout(timer)
  }, [item.id, item.duration, remove])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm backdrop-blur ${COLORS[item.kind]}`}
      style={{
        background: 'rgba(12, 15, 26, 0.9)',
        backdropFilter: 'blur(22px)',
        boxShadow: '0 8px 32px rgba(2,6,23,0.5)',
      }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-white/90">{item.message}</span>
      <button
        onClick={() => remove(item.id)}
        className="ml-auto text-white/40 transition hover:text-white/80"
      >
        ×
      </button>
    </motion.div>
  )
}

export function ToastRegion() {
  const { items } = useToastStore()

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex w-80 flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastItem item={item} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | grep "toast" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/components/ui/toast.tsx
git commit -m "feat(frontend): imperative toast system with Framer Motion animations"
```

---

## Task 12: Frontend — Skeleton loader components

**Files:**
- Create: `frontend/app/src/components/ui/skeleton.tsx`
- Modify: `frontend/app/src/app/globals.css`

- [ ] **Step 1: Add shimmer keyframe to globals.css**

Open `frontend/app/src/app/globals.css`. Add after the existing `@keyframes fadeRise` block:

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.04) 25%,
    rgba(255,255,255,0.08) 50%,
    rgba(255,255,255,0.04) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

- [ ] **Step 2: Create skeleton.tsx**

Create `frontend/app/src/components/ui/skeleton.tsx`:

```tsx
import { cn } from '@/lib/utils'

export function SkeletonBlock({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-2xl', className)}
      style={style}
    />
  )
}

export function SkeletonText({ lines = 2, className }: { lines?: 1 | 2 | 3; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className="h-3"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('glass-panel rounded-[26px] p-5', className)}>
      <SkeletonBlock className="mb-4 h-4 w-1/3" />
      <SkeletonText lines={2} />
      <div className="mt-5 flex gap-2">
        <SkeletonBlock className="h-8 w-20 rounded-full" />
        <SkeletonBlock className="h-8 w-16 rounded-full" />
      </div>
    </div>
  )
}

export function SkeletonAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <SkeletonBlock
      className={cn('shrink-0 rounded-full', className)}
      style={{ width: size, height: size }}
    />
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | grep "skeleton" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/components/ui/skeleton.tsx frontend/app/src/app/globals.css
git commit -m "feat(frontend): skeleton loader components with shimmer animation"
```

---

## Task 13: Frontend — Auth Zustand store

**Files:**
- Create: `frontend/app/src/lib/store/auth.ts`

- [ ] **Step 1: Create auth store**

Create `frontend/app/src/lib/store/auth.ts`:

```typescript
'use client'

import { create } from 'zustand'
import type { UserWithWorkspace, Workspace } from '@aether/types'
import { getMe, signOut as apiSignOut } from '@/lib/api/auth'
import { listWorkspaces } from '@/lib/api/workspaces'
import { clearToken, getToken, setToken } from '@/lib/api/client'

interface AuthState {
  user: UserWithWorkspace | null
  token: string | null
  workspace: Workspace | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  hydrate(): Promise<void>
  setAuth(token: string, user: UserWithWorkspace): void
  setWorkspace(workspace: Workspace): void
  signOut(): Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  workspace: null,
  status: 'loading',

  setAuth(token, user) {
    setToken(token)
    set({ token, user, status: 'authenticated' })
  },

  setWorkspace(workspace) {
    set({ workspace })
  },

  async hydrate() {
    const token = getToken()
    if (!token) {
      set({ status: 'unauthenticated' })
      return
    }

    try {
      const user = await getMe()
      set({ token, user, status: 'authenticated' })

      const workspaces = await listWorkspaces()
      if (workspaces.length > 0) {
        set({ workspace: workspaces[0] })
      }
    } catch {
      // Token invalid — try silent refresh (happens inside apiRequest automatically)
      // If it succeeds, getMe will have already set the new token via setToken()
      // If it fails, we land here in the catch and mark unauthenticated
      clearToken()
      set({ status: 'unauthenticated', user: null, token: null, workspace: null })
    }
  },

  async signOut() {
    try {
      await apiSignOut()
    } finally {
      clearToken()
      set({ status: 'unauthenticated', user: null, token: null, workspace: null })
    }
  },
}))
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | grep "auth.ts" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/lib/store/auth.ts
git commit -m "feat(frontend): Zustand auth store with hydration sequence"
```

---

## Task 14: Frontend — AppProviders + root layout hydration

**Files:**
- Modify: `frontend/app/src/components/providers/app-providers.tsx`
- Modify: `frontend/app/src/app/layout.tsx`

- [ ] **Step 1: Update AppProviders to trigger hydration**

Replace the entire contents of `frontend/app/src/components/providers/app-providers.tsx`:

```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store/auth'

function AuthHydrator() {
  const hydrate = useAuthStore((s) => s.hydrate)
  useEffect(() => {
    void hydrate()
  }, [hydrate])
  return null
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrator />
      {children}
    </QueryClientProvider>
  )
}
```

- [ ] **Step 2: Update root layout.tsx**

Read the current contents of `frontend/app/src/app/layout.tsx` first, then replace it with:

```tsx
import type { Metadata } from 'next'
import { AppProviders } from '@/components/providers/app-providers'
import { ToastRegion } from '@/components/ui/toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'AETHER AI',
  description: 'Multimodal creative operating system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          {children}
        </AppProviders>
        <ToastRegion />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
cd frontend/app && pnpm build 2>&1 | tail -10
```

Expected: build succeeds (or only pre-existing errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/components/providers/app-providers.tsx frontend/app/src/app/layout.tsx
git commit -m "feat(frontend): auth hydration on mount, ToastRegion in root layout"
```

---

## Task 15: Frontend — Next.js middleware route guard

**Files:**
- Create: `frontend/app/src/middleware.ts`

- [ ] **Step 1: Create middleware.ts**

Create `frontend/app/src/middleware.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'

const PROTECTED = [
  '/workspace',
  '/generate',
  '/gallery',
  '/video',
  '/audio',
  '/agents',
  '/workflows',
  '/datasets',
  '/training',
  '/models',
  '/billing',
  '/settings',
  '/team',
]

const AUTH_ONLY = ['/signin', '/signup', '/forgot-password']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has('aether_refresh')

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const isAuthOnly = AUTH_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/signin'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthOnly && hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/workspace'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | grep "middleware" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/middleware.ts
git commit -m "feat(frontend): Next.js middleware route guard with cookie-based heuristic"
```

---

## Task 16: Frontend — Auth forms with react-hook-form + zod

**Files:**
- Modify: `frontend/app/src/components/auth/auth-card.tsx`

- [ ] **Step 1: Replace auth-card.tsx**

Replace the entire contents of `frontend/app/src/components/auth/auth-card.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AnimatePresence, motion } from 'framer-motion'
import type { Route } from 'next'
import { signIn, signUp } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/store/auth'
import { listWorkspaces } from '@/lib/api/workspaces'

const signUpSchema = z.object({
  name: z.string().min(2, 'At least 2 characters').max(80),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[0-9!@#$%^&*]/, 'Include at least one number or symbol'),
})

const signInSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Required'),
})

type SignUpFields = z.infer<typeof signUpSchema>
type SignInFields = z.infer<typeof signInSchema>

function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9!@#$%^&*]/.test(password)) score++
  return score as 0 | 1 | 2 | 3
}

const STRENGTH_COLORS = ['bg-rose-500', 'bg-amber-400', 'bg-emerald-400']
const STRENGTH_LABELS = ['Weak', 'Fair', 'Strong']

export function AuthCard({
  title,
  description,
  footer,
  mode = 'signin',
}: {
  title: string
  description: string
  footer: React.ReactNode
  mode?: 'signin' | 'signup'
}) {
  const router = useRouter()
  const { setAuth, setWorkspace } = useAuthStore()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<SignUpFields | SignInFields>({
    resolver: zodResolver(mode === 'signup' ? signUpSchema : signInSchema),
  })

  const password = watch('password') ?? ''
  const strength = mode === 'signup' ? passwordStrength(password) : 0

  async function onSubmit(data: SignUpFields | SignInFields) {
    try {
      const result =
        mode === 'signup'
          ? await signUp(data as SignUpFields)
          : await signIn(data as SignInFields)

      setAuth(result.token, result.user)

      const workspaces = await listWorkspaces()
      if (workspaces.length > 0) setWorkspace(workspaces[0])

      const params = new URLSearchParams(window.location.search)
      router.push((params.get('next') ?? '/workspace') as Route)
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Authentication failed',
      })
    }
  }

  return (
    <div className="glass-panel glow-ring w-full max-w-md rounded-[32px] p-8 md:p-10">
      <div className="mb-8">
        <div className="font-display text-3xl tracking-tight text-white">AETHER</div>
        <h1 className="mt-6 font-display text-4xl leading-tight text-white">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-white/60">{description}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label className="mb-2 block text-sm text-white/70">Name</label>
            <input
              {...register('name')}
              disabled={isSubmitting}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#63b3ed]/40 focus:bg-white/8 disabled:opacity-50"
              placeholder="Sage"
            />
            <AnimatePresence>
              {'name' in errors && errors.name && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-1 text-xs text-rose-300"
                >
                  {errors.name.message}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm text-white/70">Email</label>
          <input
            {...register('email')}
            type="email"
            disabled={isSubmitting}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#63b3ed]/40 focus:bg-white/8 disabled:opacity-50"
            placeholder="you@aether.ai"
          />
          <AnimatePresence>
            {errors.email && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-1 text-xs text-rose-300"
              >
                {errors.email.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div>
          <label className="mb-2 block text-sm text-white/70">Password</label>
          <input
            {...register('password')}
            type="password"
            disabled={isSubmitting}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#a78bfa]/40 focus:bg-white/8 disabled:opacity-50"
            placeholder="••••••••"
          />
          {mode === 'signup' && password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? STRENGTH_COLORS[strength - 1] : 'bg-white/10'}`}
                  />
                ))}
              </div>
              <p className="text-xs text-white/40">
                {strength > 0 ? STRENGTH_LABELS[strength - 1] : ''}
              </p>
            </div>
          )}
          <AnimatePresence>
            {errors.password && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-1 text-xs text-rose-300"
              >
                {errors.password.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01] disabled:opacity-50"
        >
          {isSubmitting ? 'Securing session…' : 'Continue'}
        </button>

        <AnimatePresence>
          {errors.root && (
            <motion.p
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-rose-300"
            >
              {errors.root.message}
            </motion.p>
          )}
        </AnimatePresence>
      </form>

      <div className="mt-6 flex items-center gap-3 text-xs text-white/45">
        <div className="h-px flex-1 bg-white/10" />
        <span>or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <button
            disabled
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/40"
            title="Coming soon"
          >
            Google
          </button>
        </div>
        <div className="relative">
          <button
            disabled
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/40"
            title="Coming soon"
          >
            GitHub
          </button>
        </div>
      </div>

      <div className="mt-6 text-sm text-white/55">{footer}</div>
    </div>
  )
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,179,237,0.18),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.18),transparent_24%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="relative z-10 w-full">{children}</div>
    </main>
  )
}

export function AuthFooterLink({ href, label, linkText }: { href: Route; label: string; linkText: string }) {
  return (
    <p>
      {label}{' '}
      <Link href={href} className="text-white transition hover:text-[#63b3ed]">
        {linkText}
      </Link>
    </p>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | grep "auth-card" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/components/auth/auth-card.tsx
git commit -m "feat(frontend): auth forms with react-hook-form + zod, password strength indicator"
```

---

## Task 17: Frontend — WebSocket hook

**Files:**
- Create: `frontend/app/src/lib/hooks/use-websocket.ts`

- [ ] **Step 1: Create the hooks directory and use-websocket.ts**

```bash
mkdir -p frontend/app/src/lib/hooks
```

Create `frontend/app/src/lib/hooks/use-websocket.ts`:

```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WSClientMessage, WSMessage } from '@aether/types'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from '@/components/ui/toast'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'
const MAX_RETRIES = 5
const PING_INTERVAL_MS = 15_000
const PONG_TIMEOUT_MS = 10_000

export function useWorkspaceWebSocket(workspaceId: string) {
  const token = useAuthStore((s) => s.token)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [lastEvent, setLastEvent] = useState<WSMessage | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const backoffRef = useRef(1000)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const clearPingTimers = useCallback(() => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current)
    if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current)
    pingTimerRef.current = null
    pongTimeoutRef.current = null
  }, [])

  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return

    const ws = new WebSocket(`${WS_URL}/ws/${workspaceId}?token=${token}`)
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => {
      if (!mountedRef.current) return
      retriesRef.current = 0
      backoffRef.current = 1000

      // Start heartbeat
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ type: 'ping', ts: Date.now() } satisfies WSClientMessage))
        pongTimeoutRef.current = setTimeout(() => {
          // No pong received — treat as stale
          ws.close()
        }, PONG_TIMEOUT_MS)
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(event.data as string) as WSMessage
        if (msg.type === 'connected') {
          setStatus('connected')
          if (retriesRef.current === 0) {
            toast.success('Connected')
          }
        }
        if (msg.type === 'pong') {
          if (pongTimeoutRef.current) {
            clearTimeout(pongTimeoutRef.current)
            pongTimeoutRef.current = null
          }
          return
        }
        setLastEvent(msg)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      clearPingTimers()
      if (!mountedRef.current) return
      setStatus('connecting')

      if (retriesRef.current >= MAX_RETRIES) {
        setStatus('disconnected')
        return
      }

      retriesRef.current++
      const delay = backoffRef.current
      backoffRef.current = Math.min(backoffRef.current * 2, 30_000)

      toast.info(`Reconnecting…`)
      setTimeout(() => {
        if (mountedRef.current) connect()
      }, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [token, workspaceId, clearPingTimers])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearPingTimers()
      wsRef.current?.close()
    }
  }, [connect, clearPingTimers])

  const send = useCallback((msg: WSClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { status, lastEvent, send }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | grep "use-websocket" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/lib/hooks/
git commit -m "feat(frontend): WebSocket hook with exponential backoff, heartbeat, typed events"
```

---

## Task 18: Frontend — WorkspaceShell wired to live data

**Files:**
- Modify: `frontend/app/src/components/workspace/app-shell.tsx`

- [ ] **Step 1: Replace app-shell.tsx**

Replace the entire contents of `frontend/app/src/components/workspace/app-shell.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { Route } from 'next'
import {
  Bell, Bot, BrainCircuit, FolderKanban, GalleryVerticalEnd,
  LayoutDashboard, LogOut, PanelsTopLeft, Settings2, Sparkles, Video, Volume2, Wallet,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/store/auth'
import { useAppShellStore } from '@/lib/store/app-shell'
import { useWorkspaceWebSocket } from '@/lib/hooks/use-websocket'
import { apiRequest } from '@/lib/api/client'
import { QK } from '@/lib/api/query-keys'
import { SkeletonAvatar, SkeletonBlock } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { NotificationItem } from '@aether/types'

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
  { href: '/workspace', label: 'Workspace', icon: LayoutDashboard },
  { href: '/generate', label: 'Generate', icon: Sparkles },
  { href: '/gallery', label: 'Gallery', icon: GalleryVerticalEnd },
  { href: '/video', label: 'Video', icon: Video },
  { href: '/audio', label: 'Audio', icon: Volume2 },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/workflows', label: 'Workflows', icon: PanelsTopLeft },
  { href: '/datasets', label: 'Datasets', icon: FolderKanban },
  { href: '/training', label: 'Training', icon: BrainCircuit },
  { href: '/models', label: 'Models', icon: Bot },
  { href: '/billing', label: 'Billing', icon: Wallet },
  { href: '/settings', label: 'Settings', icon: Settings2 },
]

interface RawNotification {
  id: string; workspace_id: string; kind: string; title: string; body: string; status: string; created_at: string
}

export function WorkspaceShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { user, workspace, status, signOut } = useAuthStore()
  const { navCollapsed, toggleNav } = useAppShellStore()
  const pathname = usePathname()
  const router = useRouter()

  const wsHook = useWorkspaceWebSocket(workspace?.id ?? '')

  const notifications = useQuery({
    queryKey: QK.notifications(workspace?.id ?? ''),
    queryFn: () =>
      apiRequest<RawNotification[]>(`/api/notifications?workspace_id=${workspace?.id}`),
    enabled: !!workspace?.id,
    staleTime: 0,
  })

  const unreadCount = notifications.data?.filter((n) => n.status === 'unread').length ?? 0

  async function handleSignOut() {
    await signOut()
    router.push('/signin')
  }

  const isLoading = status === 'loading'

  return (
    <main className="min-h-screen px-4 py-4 md:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[auto_minmax(0,1fr)_320px]">

        {/* Nav Rail */}
        <aside className={cn('glass-panel rounded-[30px] p-4 transition-all duration-300', navCollapsed ? 'w-[92px]' : 'w-[280px]')}>
          <div className="mb-6 flex items-center justify-between">
            <div className={cn('font-display text-2xl text-white transition-opacity', navCollapsed && 'opacity-0')}>AETHER</div>
            <button onClick={toggleNav} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10">
              {navCollapsed ? 'Open' : 'Fold'}
            </button>
          </div>

          {/* User info */}
          <div className={cn('mb-5 flex items-center gap-3', navCollapsed && 'justify-center')}>
            {isLoading ? (
              <SkeletonAvatar size={32} />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#63b3ed] to-[#a78bfa] text-xs font-semibold text-black">
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            {!navCollapsed && (
              <div className="min-w-0">
                {isLoading ? (
                  <SkeletonBlock className="h-3 w-24" />
                ) : (
                  <p className="truncate text-sm text-white/80">{user?.name}</p>
                )}
              </div>
            )}
          </div>

          <nav className="space-y-2">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href as Route}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/65 transition hover:bg-white/6 hover:text-white',
                  pathname === href && 'glow-ring bg-white/7 text-white',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn('transition-opacity', navCollapsed && 'hidden')}>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-4 border-t border-white/8 pt-4">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/50 transition hover:bg-white/6 hover:text-white/80"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={cn(navCollapsed && 'hidden')}>Sign out</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <section className="glass-panel rounded-[30px] p-5 md:p-6">
          <div className="mb-6 flex flex-col gap-4 border-b border-white/8 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/45">
                {isLoading ? '—' : (workspace?.name ?? 'AETHER workspace')}
              </p>
              <h1 className="mt-2 font-display text-4xl text-white">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/55">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              {isLoading ? (
                <SkeletonBlock className="h-9 w-28 rounded-full" />
              ) : (
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">
                  {user?.creditsRemaining?.toLocaleString() ?? 0} credits
                </div>
              )}
              <div className="relative">
                <button className="rounded-full border border-white/10 bg-white/5 p-3 text-white/75 transition hover:bg-white/10">
                  <Bell className="h-4 w-4" />
                </button>
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#63b3ed] text-[9px] font-bold text-black">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          {children}
        </section>

        {/* Inspector */}
        <aside className="glass-panel rounded-[30px] p-5">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-white/45">Inspector</div>
          <h2 className="font-display text-2xl text-white">AI context</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="text-sm text-white/80">Current mode</div>
              <div className="mt-2 text-xs leading-6 text-white/50">
                Text generation with enhancement enabled, streaming on completion, workspace memory active.
              </div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    wsHook.status === 'connected' ? 'bg-emerald-400' :
                    wsHook.status === 'connecting' ? 'bg-amber-400 animate-pulse' :
                    'bg-rose-400',
                  )}
                />
                Live system
              </div>
              <div className="mt-2 text-xs leading-6 text-white/50">
                {wsHook.status === 'connected' && 'Realtime channel active.'}
                {wsHook.status === 'connecting' && 'Connecting to realtime channel…'}
                {wsHook.status === 'disconnected' && 'Connection lost. Reload to reconnect.'}
                {wsHook.lastEvent && (
                  <span className="block mt-1 text-white/30">
                    Last: {wsHook.lastEvent.type}
                  </span>
                )}
              </div>
            </div>
          </div>
        </aside>

      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | grep "app-shell" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/components/workspace/app-shell.tsx
git commit -m "feat(frontend): WorkspaceShell wired to auth store, live credits, WS status, notifications badge"
```

---

## Task 19: Frontend — Project card + create project modal

**Files:**
- Create: `frontend/app/src/components/workspace/project-card.tsx`
- Create: `frontend/app/src/components/workspace/create-project-modal.tsx`

- [ ] **Step 1: Create project-card.tsx**

Create `frontend/app/src/components/workspace/project-card.tsx`:

```tsx
import type { Project } from '@aether/types'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

const MODE_COLORS: Record<Project['mode'], string> = {
  multimodal: 'border-[#a78bfa]/20 bg-[#a78bfa]/10 text-[#c4b5fd]',
  text: 'border-[#63b3ed]/20 bg-[#63b3ed]/10 text-[#9bd4ff]',
  image: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  video: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
}

export function ProjectCard({ project }: { project: Project }) {
  const date = new Date(project.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <article className="glass-panel group rounded-[26px] p-5 transition hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${MODE_COLORS[project.mode]}`}>
            {project.mode}
          </span>
          <h3 className="mt-3 font-display text-xl text-white">{project.name}</h3>
          {project.description && (
            <p className="mt-1 text-sm leading-6 text-white/50 line-clamp-2">{project.description}</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-white/35">{date}</span>
        <Link
          href={`/workspace?project=${project.id}` as `/workspace?project=${string}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Create create-project-modal.tsx**

Create `frontend/app/src/components/workspace/create-project-modal.tsx`:

```tsx
'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { Project } from '@aether/types'

const schema = z.object({
  name: z.string().min(2, 'At least 2 characters').max(120),
  description: z.string().max(2000).optional(),
  mode: z.enum(['multimodal', 'text', 'image', 'video']),
})

type Fields = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  onSubmit(data: { name: string; description?: string; mode: Project['mode'] }): Promise<void>
  error?: string | null
}

export function CreateProjectModal({ open, onOpenChange, onSubmit, error }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'multimodal' },
  })

  async function submit(data: Fields) {
    await onSubmit({ name: data.name, description: data.description, mode: data.mode })
    reset()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
          <div className="glass-panel rounded-[32px] p-8">
            <div className="mb-6 flex items-center justify-between">
              <Dialog.Title className="font-display text-2xl text-white">New project</Dialog.Title>
              <Dialog.Close className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <form onSubmit={handleSubmit(submit)} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-white/70">Name *</label>
                <input
                  {...register('name')}
                  disabled={isSubmitting}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#63b3ed]/40 disabled:opacity-50"
                  placeholder="My cinematic project"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-rose-300">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/70">Description</label>
                <textarea
                  {...register('description')}
                  disabled={isSubmitting}
                  rows={3}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#63b3ed]/40 disabled:opacity-50"
                  placeholder="What are you building?"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/70">Mode</label>
                <select
                  {...register('mode')}
                  disabled={isSubmitting}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none disabled:opacity-50"
                >
                  <option value="multimodal">Multimodal</option>
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-rose-300"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01] disabled:opacity-50"
              >
                {isSubmitting ? 'Creating…' : 'Create project'}
              </button>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend/app && pnpm typecheck 2>&1 | grep -E "project-card|create-project" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/components/workspace/project-card.tsx frontend/app/src/components/workspace/create-project-modal.tsx
git commit -m "feat(frontend): ProjectCard and CreateProjectModal components"
```

---

## Task 20: Frontend — Workspace dashboard page

**Files:**
- Create: `frontend/app/src/components/workspace/workspace-dashboard.tsx`
- Modify: `frontend/app/src/app/workspace/page.tsx`

- [ ] **Step 1: Create workspace-dashboard.tsx**

Create `frontend/app/src/components/workspace/workspace-dashboard.tsx`:

```tsx
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Plus, Sparkles, Zap } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/lib/store/auth'
import { createProject, listProjects } from '@/lib/api/workspaces'
import { QK } from '@/lib/api/query-keys'
import { SkeletonCard } from '@/components/ui/skeleton'
import { ProjectCard } from './project-card'
import { CreateProjectModal } from './create-project-modal'
import { toast } from '@/components/ui/toast'
import type { Project } from '@aether/types'

export function WorkspaceDashboard() {
  const { user, workspace } = useAuthStore()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const projectsQuery = useQuery({
    queryKey: QK.projects(workspace?.id ?? ''),
    queryFn: () => listProjects(workspace!.id),
    enabled: !!workspace?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; mode: Project['mode'] }) =>
      createProject(workspace!.id, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: QK.projects(workspace!.id) })
      const previous = queryClient.getQueryData<Project[]>(QK.projects(workspace!.id))
      // Optimistic update
      const optimistic: Project = {
        id: `optimistic-${Date.now()}`,
        workspaceId: workspace!.id,
        name: data.name,
        description: data.description ?? null,
        mode: data.mode ?? 'multimodal',
        createdAt: new Date().toISOString(),
      }
      queryClient.setQueryData<Project[]>(QK.projects(workspace!.id), (old) => [
        optimistic,
        ...(old ?? []),
      ])
      return { previous }
    },
    onError: (_err, _data, context) => {
      queryClient.setQueryData(QK.projects(workspace!.id), context?.previous)
      setModalError(_err instanceof Error ? _err.message : 'Failed to create project')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.projects(workspace!.id) })
      setModalOpen(false)
      setModalError(null)
      toast.success('Project created')
    },
  })

  const projects = projectsQuery.data ?? []
  const totalProjects = projects.filter((p) => !p.id.startsWith('optimistic')).length

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={FolderOpen} label="Total projects" value={String(totalProjects)} color="text-[#63b3ed]" />
        <StatCard icon={Sparkles} label="Active generations" value="0" color="text-[#a78bfa]" />
        <StatCard
          icon={Zap}
          label="Credits remaining"
          value={(user?.creditsRemaining ?? 0).toLocaleString()}
          color="text-emerald-400"
        />
      </div>

      {/* Projects header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-white">Projects</h2>
        <button
          onClick={() => { setModalError(null); setModalOpen(true) }}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          New project
        </button>
      </div>

      {/* Projects grid */}
      {projectsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-panel rounded-[28px] p-12 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-white/20" />
          <p className="mt-4 font-display text-xl text-white/50">No projects yet</p>
          <p className="mt-2 text-sm text-white/30">Create your first project to get started.</p>
          <button
            onClick={() => { setModalError(null); setModalOpen(true) }}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:scale-[1.02]"
          >
            <Plus className="h-4 w-4" />
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <CreateProjectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={(data) => createMutation.mutateAsync(data)}
        error={modalError}
      />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof FolderOpen
  label: string
  value: string
  color: string
}) {
  return (
    <div className="glass-panel rounded-[24px] p-5">
      <Icon className={`h-5 w-5 ${color}`} />
      <p className="mt-4 text-xs uppercase tracking-[0.22em] text-white/40">{label}</p>
      <p className="mt-2 font-display text-3xl text-white">{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Update workspace page**

Replace the entire contents of `frontend/app/src/app/workspace/page.tsx`:

```tsx
import { WorkspaceShell } from '@/components/workspace/app-shell'
import { WorkspaceDashboard } from '@/components/workspace/workspace-dashboard'

export default function WorkspacePage() {
  return (
    <WorkspaceShell
      title="Workspace"
      subtitle="Your projects, generations, and assets — all in one cinematic control room."
    >
      <WorkspaceDashboard />
    </WorkspaceShell>
  )
}
```

- [ ] **Step 3: Verify full typecheck passes**

```bash
cd frontend/app && pnpm typecheck
```

Expected: 0 errors (or only pre-existing errors unrelated to Sprint 1 files).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/components/workspace/workspace-dashboard.tsx frontend/app/src/app/workspace/page.tsx
git commit -m "feat(frontend): workspace dashboard with stat cards, project grid, optimistic creation"
```

---

## Task 21: Integration smoke test — verify end-to-end flow

**Goal:** Confirm DoD items 1–10 from the spec.

- [ ] **Step 1: Copy .env files from .env.example**

```bash
cp backend/api/.env.example backend/api/.env
cp frontend/app/.env.example frontend/app/.env
```

Edit `backend/api/.env` and set a real JWT_SECRET (any 32+ char string is fine for local):

```
JWT_SECRET=sprint1-dev-secret-change-before-production
```

- [ ] **Step 2: Start infrastructure**

```bash
cd infra && docker compose up db redis -d
```

Wait for Postgres to be healthy:

```bash
docker compose ps
```

Expected: `db` shows `healthy`.

- [ ] **Step 3: Start backend**

```bash
cd backend/api && uv run uvicorn src.main:app --reload --port 8000
```

Expected: `Application startup complete` with no errors. Tables are created automatically in development mode.

- [ ] **Step 4: Test signup via curl**

```bash
curl -s -c /tmp/aether-cookies.txt -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@aether.ai","name":"Test User","password":"secure123!"}' | python -m json.tool
```

Expected: JSON with `access_token` and `user.email = "test@aether.ai"`.

- [ ] **Step 5: Test /me with the token**

Copy the `access_token` value from Step 4 output, then:

```bash
curl -s http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <paste_token_here>" | python -m json.tool
```

Expected: JSON with `email`, `name`, `workspace_id`.

- [ ] **Step 6: Start frontend**

```bash
cd frontend/app && pnpm dev
```

Expected: Next.js starts on port 3000.

- [ ] **Step 7: Verify route guard**

Open browser to `http://localhost:3000/workspace`.

Expected: redirected to `http://localhost:3000/signin?next=/workspace`.

- [ ] **Step 8: Verify signup flow**

Navigate to `http://localhost:3000/signup`. Fill in name, email, password. Submit.

Expected: redirected to `/workspace`. Workspace shell shows your name and credit balance.

- [ ] **Step 9: Verify project creation**

On `/workspace`, click "New project". Fill in a name. Click "Create project".

Expected: project card appears immediately (optimistic), then stabilizes. Toast "Project created" shows bottom-right. On page refresh, project persists.

- [ ] **Step 10: Verify sign-out + redirect**

Click "Sign out" in the nav.

Expected: redirected to `/signin`. Navigating to `/workspace` redirects back to `/signin` (cookie cleared).

- [ ] **Step 11: Run full backend test suite**

```bash
cd backend/api && uv run pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 12: Run TypeScript typecheck**

```bash
cd frontend/app && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 13: Final commit**

```bash
git add -A
git commit -m "feat: Sprint 1 platform kernel — auth, workspace shell, projects, WebSocket, live data"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task(s) |
|---|---|
| RefreshToken DB table | Task 2 |
| `GET /api/auth/me` | Task 5 |
| `POST /api/auth/refresh` with rotation | Task 5 |
| `POST /api/auth/signout` extended | Task 5 |
| `/signup` + `/signin` issue refresh token | Task 5 |
| X-Request-ID middleware | Task 6 |
| `GET /api/notifications` | Task 6 |
| Auth-gated WebSocket + Redis presence | Task 7 |
| WS heartbeat ping/pong | Task 7 |
| `.env.example` finalized | Task 8 |
| Docker-compose healthcheck + .env fix | Task 8 |
| `query-keys.ts` canonical constants | Task 9 |
| `client.ts` with silent refresh + refreshPromise singleton + X-Request-ID | Task 9 |
| `auth.ts` API functions | Task 10 |
| `workspaces.ts` API functions | Task 10 |
| Toast system | Task 11 |
| Skeleton components + shimmer CSS | Task 12 |
| Zustand auth store + hydration sequence | Task 13 |
| AppProviders with hydration on mount | Task 14 |
| Root layout with ToastRegion | Task 14 |
| Next.js middleware route guard | Task 15 |
| Auth forms with react-hook-form + zod + password strength | Task 16 |
| OAuth buttons "Coming soon" | Task 16 |
| WebSocket hook with reconnect + heartbeat + toast | Task 17 |
| WorkspaceShell wired to real data | Task 18 |
| WS status indicator in inspector | Task 18 |
| Nav active state from pathname | Task 18 |
| Sign-out button in nav | Task 18 |
| Notification bell badge | Task 18 |
| ProjectCard component | Task 19 |
| CreateProjectModal with optimistic insert | Task 20 |
| Workspace dashboard stat cards + projects grid | Task 20 |
| End-to-end smoke test + DoD verification | Task 21 |
| Shared types: Workspace, Project, WSMessage, WSClientMessage | Task 1 |

All 13 spec sections are covered. Definition of Done items 1–10 are verified in Task 21.

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N" references. Every step has complete code.

**Type consistency check:**
- `UserWithWorkspace` (Task 1) used in `auth.ts` (Task 10) and `auth store` (Task 13) ✅
- `QK.projects(workspaceId)` shape `['projects', workspaceId]` consistent across Task 9, 18, 20 ✅
- `WSMessage` / `WSClientMessage` defined in Task 1, consumed in Task 17 ✅
- `listProjects` / `createProject` signatures in Task 10 match usage in Task 20 ✅
- `useWorkspaceWebSocket` return type in Task 17 matches usage in Task 18 ✅
- `toast.success/error/info` API in Task 11 matches calls in Task 13, 17, 20 ✅

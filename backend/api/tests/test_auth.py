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


@pytest.mark.asyncio
async def test_signout_clears_cookie(client):
    signup_resp = await client.post("/api/auth/signup", json={
        "email": "signout@aether.ai", "name": "Out", "password": "pass123!"
    })
    token = signup_resp.json()["access_token"]
    resp = await client.post(
        "/api/auth/signout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "signed_out"
    assert resp.cookies.get("aether_refresh") == "" or "aether_refresh" not in resp.cookies


@pytest.mark.asyncio
async def test_refresh_after_signout_returns_401(client):
    signup_resp = await client.post("/api/auth/signup", json={
        "email": "signout2@aether.ai", "name": "Out2", "password": "pass123!"
    })
    token = signup_resp.json()["access_token"]
    refresh_cookie = signup_resp.cookies.get("aether_refresh")
    # Sign out — revokes the refresh token
    await client.post(
        "/api/auth/signout",
        headers={"Authorization": f"Bearer {token}"},
    )
    # Attempting refresh with the revoked token should fail
    resp = await client.post("/api/auth/refresh", cookies={"aether_refresh": refresh_cookie})
    assert resp.status_code == 401

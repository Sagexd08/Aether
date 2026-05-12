import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from src.main import app
from src.db import get_db
from src.models import Asset, Base, GenerationJob, User
from src.security import get_current_user

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


def _make_user(user_id: str = 'test-user-id') -> User:
    user = MagicMock(spec=User)
    user.id = user_id
    user.credits_balance = 100
    return user


@pytest.mark.asyncio
async def test_generate_image_insufficient_credits(db_session):
    mock_user = _make_user()

    async def override_db():
        yield db_session

    def override_user():
        return mock_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        with patch('src.routers.generations._get_workspace_id', new_callable=AsyncMock, return_value='ws-1'), \
             patch('src.routers.generations.create_job', side_effect=ValueError('insufficient_credits')):
            async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
                resp = await client.post(
                    '/api/generation/image',
                    json={'prompt': 'a cat'},
                )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code == 402


@pytest.mark.asyncio
async def test_list_jobs_requires_workspace_ownership(db_session):
    mock_user = _make_user()

    async def override_db():
        yield db_session

    def override_user():
        return mock_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.get(
                '/api/generation/jobs?workspace_id=not-my-workspace',
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_toggle_favorite_forbidden_for_other_user(db_session):
    mock_user = _make_user('test-user-id')

    # Insert an asset owned by a different user directly into the in-memory DB
    other_asset = Asset(
        id='asset-1',
        generation_job_id='job-1',
        user_id='other-user',
        workspace_id='ws-1',
        type='image',
        storage_key='img/img.png',
        mime_type='image/png',
    )
    db_session.add(other_asset)
    await db_session.commit()

    async def override_db():
        yield db_session

    def override_user():
        return mock_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.patch('/api/generation/assets/asset-1/favorite')
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code == 403

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.services.generation import create_job
from src.services.inference import CREDIT_COSTS
from src.models import GenerationJob, User


@pytest.fixture
def mock_user():
    u = MagicMock(spec=User)
    u.id = 'user-1'
    u.credits_remaining = 1000
    u.credits_reserved = 0
    return u


@pytest.mark.asyncio
async def test_create_job_reserves_credits(mock_user):
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    job = await create_job(db, mock_user, 'ws-1', 'image', 'a cat')

    assert mock_user.credits_reserved == CREDIT_COSTS['image']
    assert job.mode == 'image'
    assert job.status == 'queued'
    assert job.workspace_id == 'ws-1'


@pytest.mark.asyncio
async def test_create_job_raises_on_insufficient_credits(mock_user):
    mock_user.credits_remaining = 5
    mock_user.credits_reserved = 0
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    db.refresh = AsyncMock()

    with pytest.raises(ValueError, match='insufficient_credits'):
        await create_job(db, mock_user, 'ws-1', 'image', 'a cat')


@pytest.mark.asyncio
async def test_create_job_idempotency_returns_existing(mock_user):
    existing = MagicMock(spec=GenerationJob)
    existing.id = 'existing-job'
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=existing)
    db.refresh = AsyncMock()

    job = await create_job(db, mock_user, 'ws-1', 'image', 'a cat', idempotency_key='key-1')

    assert job.id == 'existing-job'
    assert mock_user.credits_reserved == 0  # not reserved again


@pytest.mark.asyncio
async def test_credit_costs_correct():
    assert CREDIT_COSTS['image'] == 10
    assert CREDIT_COSTS['video'] == 50
    assert CREDIT_COSTS['audio'] == 20

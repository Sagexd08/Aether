import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from src.main import app
from src.models import Asset, GenerationJob, User


@pytest.fixture
def auth_headers():
    from src.security import create_access_token
    token = create_access_token('test-user-id')
    return {'Authorization': f'Bearer {token}'}


@pytest.mark.asyncio
async def test_generate_image_insufficient_credits(auth_headers):
    with patch('src.routers.generations.get_current_user') as mock_cu, \
         patch('src.routers.generations._get_workspace_id', new_callable=AsyncMock, return_value='ws-1'), \
         patch('src.services.generation.create_job', side_effect=ValueError('insufficient_credits')):
        mock_user = MagicMock(spec=User)
        mock_user.id = 'test-user-id'
        mock_cu.return_value = mock_user

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.post(
                '/api/generation/image',
                json={'prompt': 'a cat'},
                headers=auth_headers,
            )
    assert resp.status_code == 402


@pytest.mark.asyncio
async def test_list_jobs_requires_workspace_ownership(auth_headers):
    with patch('src.routers.generations.get_current_user') as mock_cu, \
         patch('src.routers.generations.get_db') as mock_db:
        mock_user = MagicMock(spec=User)
        mock_user.id = 'test-user-id'
        mock_cu.return_value = mock_user

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=None)  # workspace not found
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.get(
                '/api/generation/jobs?workspace_id=not-my-workspace',
                headers=auth_headers,
            )
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_toggle_favorite_forbidden_for_other_user(auth_headers):
    mock_asset = MagicMock(spec=Asset)
    mock_asset.user_id = 'other-user'
    mock_asset.deleted_at = None

    with patch('src.routers.generations.get_current_user') as mock_cu, \
         patch('src.routers.generations.get_db') as mock_db:
        mock_user = MagicMock(spec=User)
        mock_user.id = 'test-user-id'
        mock_cu.return_value = mock_user

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=mock_asset)
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.patch(
                '/api/generation/assets/asset-1/favorite',
                headers=auth_headers,
            )
    assert resp.status_code == 403

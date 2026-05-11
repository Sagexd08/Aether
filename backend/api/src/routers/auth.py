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
    token_hash = hash_refresh_token(aether_refresh)
    matched = await db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .where(RefreshToken.revoked.is_(False))
        .where(RefreshToken.expires_at > now)
    )

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

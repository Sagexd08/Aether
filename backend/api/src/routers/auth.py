from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..models import User, Workspace
from ..schemas import AuthResponse, SignInRequest, SignUpRequest, UserResponse
from ..security import audit, create_access_token, hash_password, verify_password

router = APIRouter()


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
    db.add(user)
    db.add(Workspace(id=str(uuid4()), owner_id=user.id, name=f"{payload.name}'s Studio", plan='studio'))
    await audit(db, user.id, 'auth.signup', 'user', user.id)
    await db.commit()

    access_token = create_access_token(user.id)
    response.set_cookie('aether_refresh', access_token, httponly=True, samesite='lax')
    return AuthResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post('/signin', response_model=AuthResponse)
async def signin(payload: SignInRequest, response: Response, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    await audit(db, user.id, 'auth.signin', 'user', user.id)
    await db.commit()
    access_token = create_access_token(user.id)
    response.set_cookie('aether_refresh', access_token, httponly=True, samesite='lax')
    return AuthResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post('/signout')
async def signout(response: Response) -> dict[str, str]:
    response.delete_cookie('aether_refresh')
    return {'status': 'signed_out'}

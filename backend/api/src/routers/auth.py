from uuid import uuid4
from fastapi import APIRouter, HTTPException, Response
from ..schemas import AuthResponse, SignInRequest, SignUpRequest, UserResponse
from ..security import create_access_token, hash_password, verify_password

router = APIRouter()
_fake_users: dict[str, dict[str, str | int]] = {}


@router.post('/signup', response_model=AuthResponse)
async def signup(payload: SignUpRequest, response: Response) -> AuthResponse:
    if payload.email in _fake_users:
        raise HTTPException(status_code=400, detail='User already exists')

    user = {
        'id': str(uuid4()),
        'email': payload.email,
        'name': payload.name,
        'password_hash': hash_password(payload.password),
        'credits_remaining': 1000,
    }
    _fake_users[payload.email] = user
    access_token = create_access_token(user['id'])
    response.set_cookie('aether_refresh', access_token, httponly=True, samesite='lax')
    return AuthResponse(
        access_token=access_token,
        user=UserResponse(
            id=user['id'],
            email=user['email'],
            name=user['name'],
            credits_remaining=int(user['credits_remaining']),
        ),
    )


@router.post('/signin', response_model=AuthResponse)
async def signin(payload: SignInRequest, response: Response) -> AuthResponse:
    user = _fake_users.get(payload.email)
    if not user or not verify_password(payload.password, str(user['password_hash'])):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    access_token = create_access_token(str(user['id']))
    response.set_cookie('aether_refresh', access_token, httponly=True, samesite='lax')
    return AuthResponse(
        access_token=access_token,
        user=UserResponse(
            id=str(user['id']),
            email=str(user['email']),
            name=str(user['name']),
            credits_remaining=int(user['credits_remaining']),
        ),
    )


@router.post('/signout')
async def signout(response: Response) -> dict[str, str]:
    response.delete_cookie('aether_refresh')
    return {'status': 'signed_out'}

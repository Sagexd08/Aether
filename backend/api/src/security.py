from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import jwt
import secrets
import bcrypt as _bcrypt_lib
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .config import get_settings
from .db import get_db
from .models import AuditLog, User
from uuid import uuid4

settings = get_settings()


def _pre_hash(password: str) -> bytes:
    """Pre-hash with SHA-256 (hex digest) so bcrypt never sees > 72 bytes."""
    return hashlib.sha256(password.encode()).hexdigest().encode()


def hash_password(password: str) -> str:
    return _bcrypt_lib.hashpw(_pre_hash(password), _bcrypt_lib.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return _bcrypt_lib.checkpw(_pre_hash(password), password_hash.encode())


def create_refresh_token_value() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    # SHA-256 is appropriate for opaque bearer tokens (bcrypt is for passwords).
    return hashlib.sha256(token.encode()).hexdigest()


def verify_refresh_token_value(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hashlib.sha256(token.encode()).hexdigest(), token_hash)


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.access_token_ttl_minutes)
    return jwt.encode(
        {'sub': subject, 'exp': expires, 'iat': now, 'jti': secrets.token_hex(8)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail='Invalid token') from exc
    subject = payload.get('sub')
    if not subject:
        raise HTTPException(status_code=401, detail='Invalid token')
    return str(subject)


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Missing bearer token')
    user_id = decode_access_token(authorization.removeprefix('Bearer ').strip())
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail='User not found')
    return user


def require_role(*roles: str):
    async def dependency(user: User = Depends(get_current_user)) -> User:
        if roles and user.role not in roles:
            raise HTTPException(status_code=403, detail='Insufficient permissions')
        return user

    return dependency


async def audit(db: AsyncSession, user_id: str | None, action: str, target_type: str, target_id: str | None, metadata: dict | None = None) -> None:
    db.add(
        AuditLog(
            id=str(uuid4()),
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata_json=metadata or {},
        )
    )

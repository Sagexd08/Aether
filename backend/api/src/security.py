from datetime import datetime, timedelta, timezone
import jwt
from passlib.context import CryptContext
from .config import get_settings

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
settings = get_settings()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(subject: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_ttl_minutes)
    return jwt.encode({'sub': subject, 'exp': expires}, settings.jwt_secret, algorithm=settings.jwt_algorithm)

from datetime import datetime, timedelta, timezone
from uuid import uuid4
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Session
from ..schemas import CreateSessionResponse

router = APIRouter()

GENERATION_LIMIT = 2
SESSION_TTL_HOURS = 24


async def get_or_create_session(db: AsyncSession, session_id: str | None = None) -> Session:
    if session_id:
        stmt = select(Session).where(Session.session_id == session_id)
        existing = await db.scalar(stmt)
        if existing:
            existing.last_seen_at = datetime.now(timezone.utc)
            await db.commit()
            return existing

    new_session = Session(
        id=str(uuid4()),
        session_id=secrets.token_urlsafe(48),
        generations_used=0,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
        last_seen_at=datetime.now(timezone.utc),
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return new_session


async def get_session_from_id(session_id: str, db: AsyncSession) -> Session:
    stmt = select(Session).where(Session.session_id == session_id)
    session = await db.scalar(stmt)
    if not session:
        raise HTTPException(status_code=404, detail='Session not found')
    if session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail='Session expired')
    session.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return session


@router.post('/create', response_model=CreateSessionResponse, status_code=201)
async def create_session(db: AsyncSession = Depends(get_db)) -> CreateSessionResponse:
    session = await get_or_create_session(db)
    remaining = GENERATION_LIMIT - session.generations_used
    return CreateSessionResponse(
        session_id=session.session_id,
        generation_limit_remaining=remaining if remaining > 0 else 0
    )

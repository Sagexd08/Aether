from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine, AsyncSession
from .config import get_settings
from .models import Base

settings = get_settings()
engine = create_async_engine(settings.database_url, future=True, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    if settings.environment not in {'development', 'test'}:
        return
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

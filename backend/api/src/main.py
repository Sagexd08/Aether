from contextlib import asynccontextmanager
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .db import init_db
from .routers import auth, datasets, generations, health, ops, registry, training, workspaces
from . import realtime


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(title='AETHER AI API', lifespan=lifespan)
settings = get_settings()
_rate_buckets: dict[str, deque[float]] = defaultdict(deque)


@app.middleware('http')
async def rate_limit(request: Request, call_next):
    client = request.client.host if request.client else 'unknown'
    now = time.time()
    bucket = _rate_buckets[client]
    while bucket and now - bucket[0] > 60:
        bucket.popleft()
    if len(bucket) >= settings.rate_limit_per_minute:
        return JSONResponse(status_code=429, content={'detail': 'Rate limit exceeded'})
    bucket.append(now)
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(health.router)
app.include_router(auth.router, prefix='/api/auth', tags=['auth'])
app.include_router(workspaces.router, prefix='/api/workspaces', tags=['workspaces'])
app.include_router(generations.router, prefix='/api/generations', tags=['generations'])
app.include_router(datasets.router, prefix='/api/datasets', tags=['datasets'])
app.include_router(training.router, prefix='/api/training', tags=['training'])
app.include_router(registry.router, prefix='/api/models', tags=['models'])
app.include_router(ops.router, prefix='/api', tags=['ops'])
app.include_router(realtime.router)

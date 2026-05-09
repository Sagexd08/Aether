from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, generations, health
from . import realtime


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title='AETHER AI API', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(health.router)
app.include_router(auth.router, prefix='/api/auth', tags=['auth'])
app.include_router(generations.router, prefix='/api/generations', tags=['generations'])
app.include_router(realtime.router)

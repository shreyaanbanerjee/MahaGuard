"""
MahaGuard AI — FastAPI Main Application
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import upload, tasks

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("MahaGuard AI backend starting up...")
    yield
    logger.info("MahaGuard AI backend shutting down.")


app = FastAPI(
    title="MahaGuard AI",
    description="Automated Legal Risk Audit Engine for MahaRERA Documents",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.environ.get("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(upload.router, prefix="/api", tags=["Upload"])
app.include_router(tasks.router, prefix="/api", tags=["Tasks"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "MahaGuard AI Backend"}

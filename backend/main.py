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
# ALLOWED_ORIGINS can be a comma-separated list, e.g.:
#   https://mahaguard.vercel.app,https://mahaguard-git-main-user.vercel.app
_raw_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    os.environ.get("FRONTEND_URL", "http://localhost:3000"),
)
_allowed_origins = [o.strip().rstrip("/") for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # allow all Vercel preview deployments
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

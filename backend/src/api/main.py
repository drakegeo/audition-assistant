from dotenv import load_dotenv

load_dotenv()  # loads backend/.env locally; no-op on Render where vars are set by the platform

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .health import router as health_router
from .scripts import router as scripts_router

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(levelname)s %(name)s %(message)s",
)

app = FastAPI(title="audition-assistant API", version="0.1.0")

_origins = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_headers=["Authorization", "Content-Type"],
    allow_methods=["*"],
)

app.include_router(health_router)
app.include_router(scripts_router)

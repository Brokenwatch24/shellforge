"""
ShellForge API - FastAPI application entry point.

Run with:
    uvicorn backend.api.main:app --reload --port 8000

Docs available at:
    http://localhost:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router

app = FastAPI(
    title="ShellForge API",
    description="Automatic 3D printable enclosure generator for electronics projects.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow frontend (React on port 5173) to talk to the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "name": "ShellForge API",
        "version": "0.1.0",
        "docs": "/docs",
    }

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from db import (
    FRONTEND_ASSETS,
    FRONTEND_DIST,
    OUTPUT_DIR,
    UPLOAD_DIR,
    ensure_runtime_dirs,
    init_db,
)
from routers import auth, brochures, customers, properties, schedules
from services.seed import seed_users_from_env
from services.storage import ensure_storage_configured, storage_status


app = FastAPI(title="Real Estate Local MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_runtime_dirs()

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

if FRONTEND_ASSETS.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_ASSETS)), name="frontend-assets")

app.include_router(auth.router)
app.include_router(properties.router)
app.include_router(brochures.router)
app.include_router(customers.router)
app.include_router(schedules.router)


@app.on_event("startup")
def startup():
    init_db()
    ensure_storage_configured()
    seed_users_from_env()


@app.get("/health/storage")
def health_storage():
    return storage_status()


@app.get("/")
def root():
    index_file = FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "FastAPI backend is running. Build frontend to serve the app."}


@app.get("/app")
def serve_frontend():
    index_file = FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {
        "success": False,
        "message": "frontend/dist가 없습니다. frontend 폴더에서 npm run build를 먼저 실행하세요.",
    }

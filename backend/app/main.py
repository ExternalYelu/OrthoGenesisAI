from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.config import get_settings
from app.core.logging import init_logging
from app.db.schema_compat import ensure_schema_compatibility
from app.db.session import Base, get_engine
from app.services.async_jobs import job_worker

settings = get_settings()


def create_app() -> FastAPI:
    init_logging()
    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    @app.get("/health")
    def health_check():
        return {"status": "ok"}

    return app


app = create_app()


@app.on_event("startup")
def on_startup():
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility(engine)
    job_worker.start()


@app.on_event("shutdown")
def on_shutdown():
    job_worker.stop()

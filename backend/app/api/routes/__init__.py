from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.upload import router as upload_router
from app.api.routes.reconstruct import router as reconstruct_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(upload_router)
api_router.include_router(reconstruct_router)

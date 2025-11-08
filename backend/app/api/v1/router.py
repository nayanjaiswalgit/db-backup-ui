"""
Main API router
"""
from fastapi import APIRouter
from app.api.v1 import auth

api_router = APIRouter()

# Include routers
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])

# Additional routers will be added here
# api_router.include_router(servers.router, prefix="/servers", tags=["Servers"])
# api_router.include_router(backups.router, prefix="/backups", tags=["Backups"])
# api_router.include_router(schedules.router, prefix="/schedules", tags=["Schedules"])
# api_router.include_router(commands.router, prefix="/commands", tags=["Commands"])

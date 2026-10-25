import logging

from fastapi import FastAPI

from app.api.routes import router
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

app = FastAPI(
    title=f"{settings.app_name} API",
    description="Comparator de prețuri IT&C — prototip PlayStation 5. Preț final real, istoric, recomandări.",
    version="0.1.0",
)
app.include_router(router)

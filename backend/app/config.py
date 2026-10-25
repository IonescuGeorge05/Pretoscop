from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
SEED_DIR = Path(__file__).resolve().parent / "seed"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(BACKEND_DIR.parent / ".env", ".env"), extra="ignore")

    app_name: str = "Pretoscop"
    database_url: str = "postgresql+psycopg://pretoscop:pretoscop@localhost:5432/pretoscop"
    admin_token: str = ""
    data_mode: Literal["mock", "real"] = "mock"

    scraping_enabled: bool = True
    scrape_interval_hours: float = 6
    scrape_jitter_minutes: int = 30
    scraper_contact: str = "contact@example.com"


settings = Settings()

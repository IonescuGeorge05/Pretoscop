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

    # alerte OLX pe email (opțional): căsuța în care OLX trimite notificările căutărilor salvate
    imap_host: str = ""  # gol = dedus din adresa de email (vezi imap_server)
    imap_user: str = ""
    imap_password: str = ""  # la Gmail: „parolă pentru aplicații”, nu parola contului
    imap_folder: str = "INBOX"
    olx_alert_sender: str = "olx.ro"
    email_poll_minutes: int = 30

    # căutare web prin Brave Search API (opțional): anunțuri OLX din index + descoperire de magazine
    brave_api_key: str = ""
    search_interval_hours: float = 12
    discovery_interval_days: float = 7


# serverele IMAP ale furnizorilor uzuali, după domeniul adresei
IMAP_SERVERS = {
    "gmail.com": "imap.gmail.com",
    "googlemail.com": "imap.gmail.com",
    "yahoo.com": "imap.mail.yahoo.com",
    "yahoo.ro": "imap.mail.yahoo.com",
    "ymail.com": "imap.mail.yahoo.com",
    "outlook.com": "outlook.office365.com",
    "hotmail.com": "outlook.office365.com",
    "live.com": "outlook.office365.com",
    "icloud.com": "imap.mail.me.com",
    "me.com": "imap.mail.me.com",
}


def imap_server(s: "Settings") -> str:
    if s.imap_host:
        return s.imap_host
    domain = s.imap_user.rsplit("@", 1)[-1].lower()
    return IMAP_SERVERS.get(domain, f"imap.{domain}")


settings = Settings()

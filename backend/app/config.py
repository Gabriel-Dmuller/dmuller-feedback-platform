from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os

load_dotenv()


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


class Settings(BaseModel):
    firebase_project_id: str = os.getenv("FIREBASE_PROJECT_ID", "feedback---d-muller")
    google_application_credentials: str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    api_prefix: str = os.getenv("API_PREFIX", "/api")
    cors_allow_origins: list[str] = Field(default_factory=lambda: _split_csv(
        os.getenv(
            "CORS_ALLOW_ORIGINS",
            ",".join([
                "http://localhost:5000",
                "http://127.0.0.1:5000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:5500",
                "http://127.0.0.1:5500",
                "https://SEU-PROJETO.web.app",
                "https://SEU-PROJETO.firebaseapp.com",
                "https://SEU-DOMINIO-DE-PRODUCAO",
            ]),
        )
    ))


settings = Settings()

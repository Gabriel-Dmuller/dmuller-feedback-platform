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
    cors_allow_methods: list[str] = Field(default_factory=lambda: _split_csv(
        os.getenv("CORS_ALLOW_METHODS", "GET,POST,PATCH,DELETE,OPTIONS")
    ))
    cors_allow_headers: list[str] = Field(default_factory=lambda: _split_csv(
        os.getenv("CORS_ALLOW_HEADERS", "Authorization,Content-Type")
    ))
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
                "https://feedback---d-muller.web.app",
                "https://feedback---d-muller.firebaseapp.com",
            ]),
        )
    ))


settings = Settings()

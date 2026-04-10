from collections.abc import Iterable
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os

load_dotenv()

LOCAL_CORS_ORIGINS = (
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
)

PRODUCTION_CORS_ORIGINS = (
    "https://feedback---d-muller.web.app",
    "https://feedback---d-muller.firebaseapp.com",
)

PLACEHOLDER_CORS_ORIGINS = {
    "https://seu-projeto.web.app",
    "https://seu-projeto.firebaseapp.com",
    "https://seu-dominio-de-producao",
}

REQUIRED_CORS_METHODS = ("GET", "POST", "PATCH", "DELETE", "OPTIONS")
REQUIRED_CORS_HEADERS = ("Authorization", "Content-Type")


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def _unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            out.append(value)
    return out


def _normalize_origin(value: str) -> str:
    return str(value or "").strip().rstrip("/").lower()


def _build_cors_allow_origins() -> list[str]:
    env_values = [_normalize_origin(item) for item in _split_csv(os.getenv("CORS_ALLOW_ORIGINS", ""))]
    base_values = _unique([*_map_normalized(LOCAL_CORS_ORIGINS), *_map_normalized(PRODUCTION_CORS_ORIGINS)])
    merged = _unique([*base_values, *env_values])
    return [
        origin
        for origin in merged
        if origin and origin not in PLACEHOLDER_CORS_ORIGINS and origin != "*"
    ]


def _map_normalized(values: Iterable[str]) -> list[str]:
    return [_normalize_origin(value) for value in values if _normalize_origin(value)]


def _build_cors_allow_methods() -> list[str]:
    env_values = [str(item or "").strip().upper() for item in _split_csv(os.getenv("CORS_ALLOW_METHODS", ""))]
    return _unique([*REQUIRED_CORS_METHODS, *[value for value in env_values if value]])


def _build_cors_allow_headers() -> list[str]:
    env_values = [str(item or "").strip() for item in _split_csv(os.getenv("CORS_ALLOW_HEADERS", ""))]
    return _unique([*REQUIRED_CORS_HEADERS, *[value for value in env_values if value]])


class Settings(BaseModel):
    firebase_project_id: str = os.getenv("FIREBASE_PROJECT_ID", "feedback---d-muller")
    google_application_credentials: str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    api_prefix: str = os.getenv("API_PREFIX", "/api")
    cors_allow_methods: list[str] = Field(default_factory=_build_cors_allow_methods)
    cors_allow_headers: list[str] = Field(default_factory=_build_cors_allow_headers)
    cors_allow_origins: list[str] = Field(default_factory=_build_cors_allow_origins)


settings = Settings()

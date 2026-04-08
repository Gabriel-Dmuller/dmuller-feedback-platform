from functools import lru_cache
import firebase_admin
from firebase_admin import credentials, firestore
from .config import settings


@lru_cache(maxsize=1)
def get_app():
    if firebase_admin._apps:
        return firebase_admin.get_app()

    if settings.google_application_credentials:
        cred = credentials.Certificate(settings.google_application_credentials)
        return firebase_admin.initialize_app(cred, {"projectId": settings.firebase_project_id})

    return firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})


@lru_cache(maxsize=1)
def get_db():
    app = get_app()
    return firestore.client(app=app)

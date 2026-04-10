from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import auth as firebase_auth
from .config import settings
from .firebase_admin_client import get_app, get_db
from .schemas import AdmissionTasksCreatePayload, EmployeeUpdatePayload, EmployeeUpsert, BootstrapResponse, ReviewAcknowledgmentPayload, ReviewSubmitPayload, ReviewTaskCreatePayload
from .services.employees import normalize_employee
from .services.portal import acknowledge_review, delete_employee, get_me, get_review, get_task, list_scoped_employees, list_scoped_reviews, list_scoped_tasks, list_visible_leaders, update_employee
from .services.reviews import build_admission_tasks, create_admission_tasks, create_review_task, review_template, submit_review

app = FastAPI(title="D'Muller Avaliações API", version="2026.04")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
    max_age=86400,
)


def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token.count(".") != 2:
        raise HTTPException(status_code=401, detail="invalid bearer token")
    get_app()
    try:
        return firebase_auth.verify_id_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="invalid bearer token") from exc


def role_for_uid(db, uid: str) -> str:
    snap = db.collection("roles").document(uid).get()
    if not snap.exists:
        raise HTTPException(status_code=403, detail="role not found")
    data = snap.to_dict() or {}
    if data.get("ativo") is False:
        raise HTTPException(status_code=403, detail="role inactive")
    return data.get("role") or ""


def _handle_service_error(exc: Exception):
    if isinstance(exc, LookupError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, PermissionError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise exc


@app.get("/health")
def health():
    return {"ok": True, "service": "dmuller-avaliacoes-api"}


@app.get(f"{settings.api_prefix}/system/bootstrap", response_model=BootstrapResponse)
def bootstrap():
    return BootstrapResponse()


@app.get(f"{settings.api_prefix}/reviews/template/{{task_type}}")
def get_review_template(task_type: str):
    return review_template(task_type)


@app.get(f"{settings.api_prefix}/me")
def me_route(user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return get_me(db, uid, user.get("email", ""), role_for_uid(db, uid))
    except Exception as exc:
        _handle_service_error(exc)


@app.get(f"{settings.api_prefix}/leaders")
def leaders_route(user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return {"ok": True, "leaders": list_visible_leaders(db, uid, role_for_uid(db, uid))}
    except Exception as exc:
        _handle_service_error(exc)


@app.get(f"{settings.api_prefix}/employees")
def employees_route(
    gestorId: str = "",
    coordinatorUid: str = "",
    user=Depends(current_user),
):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return {"ok": True, "employees": list_scoped_employees(db, uid, role_for_uid(db, uid), gestorId, coordinatorUid)}
    except Exception as exc:
        _handle_service_error(exc)


@app.patch(f"{settings.api_prefix}/employees/{{employee_uid}}")
def update_employee_route(employee_uid: str, payload: EmployeeUpdatePayload, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return update_employee(db, employee_uid, payload.model_dump(), uid, role_for_uid(db, uid))
    except Exception as exc:
        _handle_service_error(exc)


@app.delete(f"{settings.api_prefix}/employees/{{employee_uid}}")
def delete_employee_route(employee_uid: str, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return delete_employee(db, employee_uid, uid, role_for_uid(db, uid))
    except Exception as exc:
        _handle_service_error(exc)


@app.get(f"{settings.api_prefix}/reviews/tasks")
def review_tasks_route(
    gestorId: str = "",
    coordinatorUid: str = "",
    limit: int = Query(default=0, ge=0, le=200),
    user=Depends(current_user),
):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return {"ok": True, "tasks": list_scoped_tasks(db, uid, role_for_uid(db, uid), gestorId, coordinatorUid, limit or None)}
    except Exception as exc:
        _handle_service_error(exc)


@app.get(f"{settings.api_prefix}/reviews")
def reviews_route(
    gestorId: str = "",
    coordinatorUid: str = "",
    evaluatedUid: str = "",
    limit: int = Query(default=0, ge=0, le=200),
    user=Depends(current_user),
):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return {"ok": True, "reviews": list_scoped_reviews(db, uid, role_for_uid(db, uid), gestorId, coordinatorUid, evaluatedUid, limit or None)}
    except Exception as exc:
        _handle_service_error(exc)


@app.get(f"{settings.api_prefix}/reviews/tasks/{{task_id}}")
def review_task_route(task_id: str, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return get_task(db, task_id, uid, role_for_uid(db, uid))
    except Exception as exc:
        _handle_service_error(exc)


@app.get(f"{settings.api_prefix}/reviews/{{review_id}}")
def review_route(review_id: str, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return get_review(db, review_id, uid, role_for_uid(db, uid))
    except Exception as exc:
        _handle_service_error(exc)


@app.post(f"{settings.api_prefix}/reviews/{{review_id}}/acknowledge")
def acknowledge_review_route(review_id: str, payload: ReviewAcknowledgmentPayload, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return acknowledge_review(db, review_id, payload.comment, uid, role_for_uid(db, uid))
    except Exception as exc:
        _handle_service_error(exc)


@app.post(f"{settings.api_prefix}/employees/normalize")
def normalize_employee_route(payload: EmployeeUpsert, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    role = role_for_uid(db, uid)
    if role not in {"admin", "manager", "coordinator"}:
        raise HTTPException(status_code=403, detail="role not allowed")
    return {"ok": True, "employee": normalize_employee(payload)}


@app.post(f"{settings.api_prefix}/reviews/tasks/generate-admission")
def generate_admission_tasks(payload: EmployeeUpsert, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    role = role_for_uid(db, uid)
    if role not in {"admin", "manager", "coordinator"}:
        raise HTTPException(status_code=403, detail="role not allowed")
    employee = normalize_employee(payload)
    tasks = build_admission_tasks(employee, created_by_uid="system", created_by_role="system")
    return {"ok": True, "tasks": tasks}


@app.post(f"{settings.api_prefix}/reviews/tasks/create")
def create_review_task_route(payload: ReviewTaskCreatePayload, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return create_review_task(db, payload.model_dump(), uid, role_for_uid(db, uid))
    except Exception as exc:
        _handle_service_error(exc)


@app.post(f"{settings.api_prefix}/reviews/tasks/create-admission")
def create_admission_tasks_route(payload: AdmissionTasksCreatePayload, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return create_admission_tasks(db, payload.employeeUid, uid, role_for_uid(db, uid))
    except Exception as exc:
        _handle_service_error(exc)


@app.post(f"{settings.api_prefix}/reviews/submit")
def submit_review_route(payload: ReviewSubmitPayload, user=Depends(current_user)):
    db = get_db()
    uid = user.get("uid", "")
    try:
        return submit_review(db, payload.model_dump(), uid, role_for_uid(db, uid))
    except Exception as exc:
        _handle_service_error(exc)

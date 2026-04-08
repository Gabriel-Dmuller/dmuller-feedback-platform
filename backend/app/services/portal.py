from datetime import date, datetime
from typing import Any, Dict, Iterable, List

from firebase_admin import firestore


def _jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _jsonable(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    return value


def _doc(item) -> Dict[str, Any]:
    return _jsonable({"id": item.id, **(item.to_dict() or {})})


def _active(item: Dict[str, Any]) -> bool:
    return item.get("ativo") is not False


def _sort_by_name(items: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(items, key=lambda item: (item.get("nome") or item.get("email") or "").lower())


def _query(db, collection_name: str, field: str, value: str, limit: int | None = None) -> List[Dict[str, Any]]:
    query = db.collection(collection_name).where(field, "==", value)
    if limit:
        query = query.limit(limit)
    return [_doc(item) for item in query.stream()]


def _all(db, collection_name: str, limit: int | None = None) -> List[Dict[str, Any]]:
    query = db.collection(collection_name)
    if limit:
        query = query.limit(limit)
    return [_doc(item) for item in query.stream()]


def _role(db, uid: str) -> Dict[str, Any]:
    snap = db.collection("roles").document(uid).get()
    if not snap.exists:
        raise PermissionError("role not found")
    data = _doc(snap)
    if data.get("ativo") is False:
        raise PermissionError("role inactive")
    return data


def _validate_manager_for_user(db, manager_uid: str, user_uid: str, user_role: str) -> Dict[str, Any]:
    manager = _role(db, manager_uid)
    if manager.get("role") != "manager":
        raise PermissionError("gestorId out of scope")
    if user_role == "manager" and manager_uid != user_uid:
        raise PermissionError("manager out of scope")
    if user_role == "coordinator" and manager.get("coordinatorUid") != user_uid:
        raise PermissionError("coordinator out of scope")
    if user_role not in {"admin", "manager", "coordinator"}:
        raise PermissionError("role not allowed")
    return manager


def resolve_scope(db, user_uid: str, user_role: str, manager_uid: str = "", coordinator_uid: str = "") -> Dict[str, str]:
    manager_uid = (manager_uid or "").strip()
    coordinator_uid = (coordinator_uid or "").strip()

    if user_role == "manager":
        return {"kind": "manager", "field": "gestorId", "uid": user_uid}

    if user_role == "employee":
        return {"kind": "employee", "field": "evaluatedUid", "uid": user_uid}

    if user_role == "coordinator":
        if manager_uid:
            _validate_manager_for_user(db, manager_uid, user_uid, user_role)
            return {"kind": "manager", "field": "gestorId", "uid": manager_uid}
        return {"kind": "coordinator", "field": "coordinatorUid", "uid": user_uid}

    if user_role == "admin":
        if manager_uid:
            _validate_manager_for_user(db, manager_uid, user_uid, user_role)
            return {"kind": "manager", "field": "gestorId", "uid": manager_uid}
        if coordinator_uid:
            coordinator = _role(db, coordinator_uid)
            if coordinator.get("role") != "coordinator":
                raise PermissionError("coordinatorUid out of scope")
            return {"kind": "coordinator", "field": "coordinatorUid", "uid": coordinator_uid}
        return {"kind": "all", "field": "", "uid": ""}

    raise PermissionError("role not allowed")


def list_visible_leaders(db, user_uid: str, user_role: str) -> List[Dict[str, Any]]:
    if user_role == "admin":
        return _sort_by_name(item for item in _all(db, "roles") if _active(item) and item.get("role") in {"admin", "coordinator", "manager"})
    own = [_role(db, user_uid)]
    if user_role == "coordinator":
        managers = [item for item in _query(db, "roles", "coordinatorUid", user_uid) if _active(item) and item.get("role") == "manager"]
        by_id = {item["id"]: item for item in [*own, *managers]}
        return _sort_by_name(by_id.values())
    if user_role == "manager":
        return _sort_by_name(own)
    return []


def get_me(db, user_uid: str, user_email: str, user_role: str) -> Dict[str, Any]:
    role = _role(db, user_uid)
    return {"uid": user_uid, "email": user_email or role.get("email", ""), "role": user_role, "profile": role}


def list_scoped_collection(db, collection_name: str, user_uid: str, user_role: str, manager_uid: str = "", coordinator_uid: str = "", limit: int | None = None) -> List[Dict[str, Any]]:
    scope = resolve_scope(db, user_uid, user_role, manager_uid, coordinator_uid)
    if scope["kind"] == "all":
        return _all(db, collection_name, limit)
    return _query(db, collection_name, scope["field"], scope["uid"], limit)


def list_scoped_employees(db, user_uid: str, user_role: str, manager_uid: str = "", coordinator_uid: str = "") -> List[Dict[str, Any]]:
    if user_role == "employee":
        snap = db.collection("employees").document(user_uid).get()
        return [_doc(snap)] if snap.exists else []
    items = list_scoped_collection(db, "employees", user_uid, user_role, manager_uid, coordinator_uid)
    return _sort_by_name(item for item in items if _active(item) and (item.get("role") or "employee") == "employee")


def _can_manage_employee(employee: Dict[str, Any], user_uid: str, user_role: str) -> bool:
    if user_role == "admin":
        return True
    if user_role == "manager":
        return employee.get("gestorId") == user_uid
    return False


def update_employee(db, employee_uid: str, payload: Dict[str, Any], user_uid: str, user_role: str) -> Dict[str, Any]:
    snap = db.collection("employees").document((employee_uid or "").strip()).get()
    if not snap.exists:
        raise LookupError("employee not found")
    employee = _doc(snap)
    if not _can_manage_employee(employee, user_uid, user_role):
        raise PermissionError("employee out of scope")
    update = {
        "nome": (payload.get("nome") or "").strip(),
        "email": (payload.get("email") or "").strip().lower(),
        "cargo": (payload.get("cargo") or "").strip(),
        "ativo": bool(payload.get("ativo")),
        "admissionDate": (payload.get("admissionDate") or "").strip(),
        "nascimento": (payload.get("nascimento") or "").strip(),
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    if not update["nome"]:
        raise ValueError("nome is required")
    db.collection("employees").document(employee["id"]).set(update, merge=True)
    role_update = {key: value for key, value in update.items() if key in {"nome", "email", "ativo", "updatedAt"}}
    db.collection("roles").document(employee.get("uid") or employee["id"]).set(role_update, merge=True)
    return {"ok": True, "employee": {**employee, **{key: value for key, value in update.items() if key != "updatedAt"}}}


def delete_employee(db, employee_uid: str, user_uid: str, user_role: str) -> Dict[str, Any]:
    snap = db.collection("employees").document((employee_uid or "").strip()).get()
    if not snap.exists:
        raise LookupError("employee not found")
    employee = _doc(snap)
    if not _can_manage_employee(employee, user_uid, user_role):
        raise PermissionError("employee out of scope")
    db.collection("employees").document(employee["id"]).delete()
    db.collection("roles").document(employee.get("uid") or employee["id"]).delete()
    return {"ok": True, "employeeUid": employee.get("uid") or employee["id"]}


def list_scoped_tasks(db, user_uid: str, user_role: str, manager_uid: str = "", coordinator_uid: str = "", limit: int | None = None) -> List[Dict[str, Any]]:
    return list_scoped_collection(db, "review_tasks", user_uid, user_role, manager_uid, coordinator_uid, limit)


def list_scoped_reviews(db, user_uid: str, user_role: str, manager_uid: str = "", coordinator_uid: str = "", evaluated_uid: str = "", limit: int | None = None) -> List[Dict[str, Any]]:
    evaluated_uid = (evaluated_uid or "").strip()
    if evaluated_uid:
        if user_role == "employee" and evaluated_uid != user_uid:
            raise PermissionError("employee out of scope")
        items = _query(db, "performance_reviews", "evaluatedUid", evaluated_uid, limit)
        return [item for item in items if can_read_review(db, item, user_uid, user_role)]
    return list_scoped_collection(db, "performance_reviews", user_uid, user_role, manager_uid, coordinator_uid, limit)


def can_read_review(db, review: Dict[str, Any], user_uid: str, user_role: str) -> bool:
    if user_role == "admin":
        return True
    if user_role == "manager":
        return review.get("gestorId") == user_uid
    if user_role == "employee":
        return review.get("evaluatedUid") == user_uid
    if user_role == "coordinator":
        if review.get("coordinatorUid") == user_uid:
            return True
        manager_uid = review.get("gestorId") or ""
        if not manager_uid:
            return False
        try:
            return _role(db, manager_uid).get("coordinatorUid") == user_uid
        except PermissionError:
            return False
    return False


def can_read_task(db, task: Dict[str, Any], user_uid: str, user_role: str) -> bool:
    if user_role == "admin":
        return True
    if user_role == "manager":
        return task.get("gestorId") == user_uid
    if user_role == "employee":
        return task.get("evaluatedUid") == user_uid
    if user_role == "coordinator":
        if task.get("coordinatorUid") == user_uid:
            return True
        manager_uid = task.get("gestorId") or ""
        if not manager_uid:
            return False
        try:
            return _role(db, manager_uid).get("coordinatorUid") == user_uid
        except PermissionError:
            return False
    return False


def get_review(db, review_id: str, user_uid: str, user_role: str) -> Dict[str, Any]:
    snap = db.collection("performance_reviews").document((review_id or "").strip()).get()
    if not snap.exists:
        raise LookupError("review not found")
    review = _doc(snap)
    if not can_read_review(db, review, user_uid, user_role):
        raise PermissionError("review out of scope")
    return review


def get_task(db, task_id: str, user_uid: str, user_role: str) -> Dict[str, Any]:
    snap = db.collection("review_tasks").document((task_id or "").strip()).get()
    if not snap.exists:
        raise LookupError("review task not found")
    task = _doc(snap)
    if not can_read_task(db, task, user_uid, user_role):
        raise PermissionError("task out of scope")
    return task


def acknowledge_review(db, review_id: str, comment: str, user_uid: str, user_role: str) -> Dict[str, Any]:
    if user_role != "employee":
        raise PermissionError("only employees can acknowledge reviews")
    ref = db.collection("performance_reviews").document((review_id or "").strip())
    snap = ref.get()
    if not snap.exists:
        raise LookupError("review not found")
    review = _doc(snap)
    if review.get("evaluatedUid") != user_uid:
        raise PermissionError("review out of scope")
    acknowledgment = {
        **(review.get("acknowledgment") or {}),
        "status": "acknowledged",
        "comment": (comment or "").strip(),
        "at": firestore.SERVER_TIMESTAMP,
    }
    ref.update({"acknowledgment": acknowledgment, "updatedAt": firestore.SERVER_TIMESTAMP})
    return {"ok": True, "reviewId": review_id, "acknowledgment": {**review.get("acknowledgment", {}), "status": "acknowledged", "comment": (comment or "").strip()}}

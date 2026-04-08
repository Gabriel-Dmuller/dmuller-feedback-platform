from typing import Dict
from ..schemas import EmployeeUpsert


def normalize_employee(payload: EmployeeUpsert) -> Dict:
    data = payload.model_dump()
    admission = (data.get("admissionDate") or "").strip()
    data["uid"] = (data.get("uid") or "").strip()
    data["nome"] = (data.get("nome") or "").strip()
    data["email"] = (data.get("email") or "").strip().lower()
    data["cargo"] = (data.get("cargo") or "").strip()
    data["gestorId"] = (data.get("gestorId") or "").strip()
    data["coordinatorUid"] = (data.get("coordinatorUid") or "").strip()
    data["admissionDate"] = admission
    data["observacoes"] = (data.get("observacoes") or "").strip()
    return data

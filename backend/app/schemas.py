from typing import Any, Dict, Literal, List, Optional
from pydantic import BaseModel, Field


TaskType = Literal["experience_45", "experience_90", "semiannual", "annual", "requested"]


class EmployeeBase(BaseModel):
    uid: str
    nome: str
    email: str
    cargo: str = ""
    ativo: bool = True
    gestorId: str = ""
    coordinatorUid: str = ""
    admissionDate: str = ""
    nascimento: str = ""
    observacoes: str = ""


class EmployeeUpsert(EmployeeBase):
    role: Literal["employee"] = "employee"


class EmployeeUpdatePayload(BaseModel):
    nome: str
    email: str = ""
    cargo: str = ""
    ativo: bool = True
    admissionDate: str = ""
    nascimento: str = ""


class ReviewTaskPayload(BaseModel):
    id: str
    taskType: TaskType
    templateKey: str
    evaluatedUid: str
    evaluatedName: str
    evaluatorUid: str
    evaluatorName: str
    gestorId: str
    coordinatorUid: str = ""
    referenceDate: str
    dueDate: str
    status: Literal["pending", "submitted", "cancelled"] = "pending"


class ReviewTaskCreatePayload(BaseModel):
    taskType: TaskType
    evaluatedUid: str
    gestorId: str
    referenceDate: str
    dueDate: str


class ReviewSubmitPayload(BaseModel):
    taskId: str
    answers: Dict[str, Dict[str, int]]
    feedback: Dict[str, str] = Field(default_factory=dict)
    experienceAnalysis: Optional[Dict[str, Any]] = None


class AdmissionTasksCreatePayload(BaseModel):
    employeeUid: str


class ReviewAcknowledgmentPayload(BaseModel):
    comment: str = ""


class BootstrapResponse(BaseModel):
    ok: bool = True
    schema_version: str = "2026.04"
    employee_primary_manager_field: str = "gestorId"
    employee_primary_admission_field: str = "admissionDate"
    removed_modules: List[str] = Field(default_factory=lambda: ["feedbacks"])

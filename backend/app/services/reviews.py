from datetime import datetime, timedelta
from typing import Any, Dict, List

from firebase_admin import firestore

STANDARD_SCALE = [
    {"value": 5, "label": "Muito bom"},
    {"value": 4, "label": "Bom"},
    {"value": 3, "label": "Médio"},
    {"value": 2, "label": "Ruim"},
    {"value": 1, "label": "Muito ruim"},
]

STANDARD_SECTIONS = [
    {
        "id": "assiduidade",
        "title": "Assiduidade",
        "questions": [
            {"id": "assiduidade_01", "text": "Comparece regularmente ao trabalho"},
            {"id": "assiduidade_02", "text": "É pontual no horário"},
            {"id": "assiduidade_03", "text": "Permanece no trabalho durante o expediente"},
            {"id": "assiduidade_04", "text": "Dedica-se à execução das tarefas, evitando interrupções e interferências alheias"},
            {"id": "assiduidade_05", "text": "Informa em tempo hábil imprevistos que impeçam o comparecimento ou cumprimento do horário"},
        ],
    },
    {
        "id": "disciplina",
        "title": "Disciplina",
        "questions": [
            {"id": "disciplina_01", "text": "Exerce com zelo e dedicação as atribuições do cargo ou função"},
            {"id": "disciplina_02", "text": "Observa as normas legais e regulamentares estabelecidas pela instituição"},
            {"id": "disciplina_03", "text": "Cumpre as orientações superiores respeitando a hierarquia"},
            {"id": "disciplina_04", "text": "Trata com urbanidade colegas e público em geral"},
            {"id": "disciplina_05", "text": "Evita comentários comprometedores à imagem e ao ambiente de trabalho"},
        ],
    },
    {
        "id": "iniciativa",
        "title": "Iniciativa",
        "questions": [
            {"id": "iniciativa_01", "text": "Procura conhecer a instituição, a área e os procedimentos"},
            {"id": "iniciativa_02", "text": "Busca atualização e capacitação contínua"},
            {"id": "iniciativa_03", "text": "Encontra soluções adequadas para as necessidades do setor"},
            {"id": "iniciativa_04", "text": "Encaminha corretamente assuntos fora da própria alçada"},
            {"id": "iniciativa_05", "text": "Mostra disposição para aprender outros serviços e apoiar colegas"},
        ],
    },
    {
        "id": "produtividade",
        "title": "Produtividade",
        "questions": [
            {"id": "produtividade_01", "text": "Planeja e organiza as tarefas observando prioridades"},
            {"id": "produtividade_02", "text": "Mantém ritmo de trabalho regular e responde bem a picos"},
            {"id": "produtividade_03", "text": "Executa atividades com qualidade, evitando retrabalho"},
            {"id": "produtividade_04", "text": "Usa o tempo de forma racional, cumprindo prazos"},
            {"id": "produtividade_05", "text": "Domina tecnologias e equipamentos necessários"},
        ],
    },
    {
        "id": "responsabilidade",
        "title": "Responsabilidade",
        "questions": [
            {"id": "responsabilidade_01", "text": "Inspira confiança por honestidade, integridade e imparcialidade"},
            {"id": "responsabilidade_02", "text": "Zela pelo patrimônio e evita desperdícios"},
            {"id": "responsabilidade_03", "text": "Mostra comprometimento com acordos e obrigações"},
            {"id": "responsabilidade_04", "text": "Zela pela imagem profissional e apresentação"},
            {"id": "responsabilidade_05", "text": "Age com discrição em assuntos internos"},
        ],
    },
    {
        "id": "comunicacao",
        "title": "Comunicação",
        "questions": [
            {"id": "comunicacao_01", "text": "Sabe escutar e interagir com clareza"},
            {"id": "comunicacao_02", "text": "Relaciona-se cordialmente para manter ambiente produtivo"},
            {"id": "comunicacao_03", "text": "Adapta a linguagem aos interlocutores e transmite com precisão"},
        ],
    },
]

EXPERIENCE_QUESTIONS = [
    {"id": "experiencia_qualidade_execucao", "text": "Qualidade da execução"},
    {"id": "experiencia_comprometimento", "text": "Comprometimento"},
    {"id": "experiencia_organizacao", "text": "Organização"},
    {"id": "experiencia_relacionamento_equipe", "text": "Relacionamento com a equipe"},
    {"id": "experiencia_resultado_entregue", "text": "Resultado entregue"},
]

EXPERIENCE_DECISIONS = [
    {"value": "effectivate", "label": "Efetivar"},
    {"value": "extend", "label": "Prorrogar"},
    {"value": "dismiss", "label": "Desligar"},
]


def review_template(task_type: str) -> Dict:
    is_experience = task_type in {"experience_45", "experience_90"}
    return {
        "taskType": task_type,
        "scale": STANDARD_SCALE,
        "standardSections": STANDARD_SECTIONS,
        "feedbackFields": [
            {"id": "strengths", "label": "Pontos fortes"},
            {"id": "weaknesses", "label": "Pontos de atenção"},
            {"id": "improvements", "label": "Pontos de melhoria"},
            {"id": "generalComment", "label": "Comentário geral"},
        ],
        "experience": {
            "enabled": is_experience,
            "questions": EXPERIENCE_QUESTIONS if is_experience else [],
            "decisions": EXPERIENCE_DECISIONS if is_experience else [],
        },
    }


def flatten_standard_questions() -> List[Dict[str, str]]:
    return [
        {**question, "sectionId": section["id"], "sectionTitle": section["title"]}
        for section in STANDARD_SECTIONS
        for question in section["questions"]
    ]


def score_label(avg: float) -> str:
    if avg >= 4.5:
        return "Excelente"
    if avg >= 3.5:
        return "Bom"
    if avg >= 2.5:
        return "MÃ©dio"
    if avg >= 1.5:
        return "Ruim"
    return "Muito ruim"


def submit_review(db, payload: Dict[str, Any], user_uid: str, user_role: str) -> Dict[str, Any]:
    task_id = (payload.get("taskId") or "").strip()
    if not task_id:
        raise ValueError("taskId is required")

    task_ref = db.collection("review_tasks").document(task_id)
    task_snap = task_ref.get()
    if not task_snap.exists:
        raise LookupError("review task not found")
    task = task_snap.to_dict() or {}

    if user_role != "manager":
        raise PermissionError("only the responsible manager can submit reviews")
    if task.get("gestorId") != user_uid:
        raise PermissionError("manager out of scope")

    answers = payload.get("answers") or {}
    standard_answers = {
        key: int(value)
        for key, value in (answers.get("standard") or {}).items()
    }
    standard_questions = flatten_standard_questions()
    missing = [q["id"] for q in standard_questions if q["id"] not in standard_answers]
    if missing:
        raise ValueError("standard answers are incomplete")
    if any(value < 1 or value > 5 for value in standard_answers.values()):
        raise ValueError("standard answers must be between 1 and 5")

    values = [standard_answers[q["id"]] for q in standard_questions]
    avg = round(sum(values) / len(values), 2)

    is_experience = task.get("taskType") in {"experience_45", "experience_90"}
    experience_answers = {
        key: int(value)
        for key, value in (answers.get("experience") or {}).items()
    }
    if is_experience:
        missing_experience = [q["id"] for q in EXPERIENCE_QUESTIONS if q["id"] not in experience_answers]
        if missing_experience:
            raise ValueError("experience answers are incomplete")
        if any(value < 1 or value > 5 for value in experience_answers.values()):
            raise ValueError("experience answers must be between 1 and 5")

    settings_snap = db.collection("app_settings").document("system_options").get()
    settings = settings_snap.to_dict() if settings_snap.exists else {}
    ack_required = settings.get("employeeAcknowledgmentRequired") is not False
    now = firestore.SERVER_TIMESTAMP
    review_id = task_id

    review = {
        "taskId": task_id,
        "taskType": task.get("taskType"),
        "templateKey": task.get("templateKey") or ("experience_review_v2" if is_experience else "employee_periodic_review_v2"),
        "evaluatedUid": task.get("evaluatedUid", ""),
        "evaluatedRole": task.get("evaluatedRole", "employee"),
        "evaluatedName": task.get("evaluatedName", ""),
        "evaluatorUid": task.get("evaluatorUid", ""),
        "evaluatorRole": task.get("evaluatorRole") or user_role,
        "evaluatorName": task.get("evaluatorName", ""),
        "gestorId": task.get("gestorId", ""),
        "coordinatorUid": task.get("coordinatorUid", ""),
        "referenceDate": task.get("referenceDate", ""),
        "dueDate": task.get("dueDate", ""),
        "submittedAt": now,
        "status": "submitted",
        "answers": {
            "standard": standard_answers,
            "experience": experience_answers if is_experience else {},
        },
        "score": {
            "average": avg,
            "label": score_label(avg),
        },
        "experienceAnalysis": payload.get("experienceAnalysis") if is_experience else None,
        "feedback": payload.get("feedback") or {},
        "acknowledgment": {
            "required": ack_required,
            "status": "pending",
            "comment": "",
            "at": None,
        },
        "createdAt": now,
        "updatedAt": now,
    }

    db.collection("performance_reviews").document(review_id).set(review, merge=True)
    task_ref.update({
        "status": "submitted",
        "submittedReviewId": review_id,
        "updatedAt": now,
        "notificationState": {
            **(task.get("notificationState") or {}),
            "isNew": False,
            "readByEvaluator": True,
        },
    })

    return {"ok": True, "reviewId": review_id, "score": review["score"]}


def _task_template_key(task_type: str) -> str:
    return "experience_review_v2" if task_type in {"experience_45", "experience_90"} else "employee_periodic_review_v2"


def _validate_manager_scope(db, gestor_id: str, employee: Dict[str, Any], user_uid: str, user_role: str) -> Dict[str, Any]:
    manager_snap = db.collection("roles").document(gestor_id).get()
    if not manager_snap.exists:
        raise LookupError("manager role not found")
    manager = manager_snap.to_dict() or {}
    if manager.get("role") != "manager":
        raise ValueError("gestorId must point to a manager role")
    if employee.get("gestorId") != gestor_id:
        raise PermissionError("employee does not belong to gestorId")
    if user_role == "manager" and gestor_id != user_uid:
        raise PermissionError("manager out of scope")
    if user_role == "coordinator" and manager.get("coordinatorUid") != user_uid:
        raise PermissionError("coordinator out of scope")
    if user_role not in {"admin", "manager", "coordinator"}:
        raise PermissionError("role not allowed")
    return manager


def create_review_task(db, payload: Dict[str, Any], user_uid: str, user_role: str) -> Dict[str, Any]:
    task_type = (payload.get("taskType") or "").strip()
    evaluated_uid = (payload.get("evaluatedUid") or "").strip()
    gestor_id = (payload.get("gestorId") or "").strip()
    reference_date = (payload.get("referenceDate") or payload.get("dueDate") or "").strip()
    due_date = (payload.get("dueDate") or reference_date).strip()
    if not task_type or not evaluated_uid or not gestor_id or not reference_date or not due_date:
        raise ValueError("taskType, evaluatedUid, gestorId, referenceDate and dueDate are required")
    _parse_date(reference_date)
    _parse_date(due_date)

    employee_snap = db.collection("employees").document(evaluated_uid).get()
    if not employee_snap.exists:
        raise LookupError("employee not found")
    employee = employee_snap.to_dict() or {}
    manager = _validate_manager_scope(db, gestor_id, employee, user_uid, user_role)
    task_id = f"{task_type}_{evaluated_uid}_{due_date}"
    now = firestore.SERVER_TIMESTAMP
    task = {
        "taskType": task_type,
        "origin": "manager_request" if user_role == "manager" else "coordinator_request",
        "templateKey": _task_template_key(task_type),
        "evaluatedUid": evaluated_uid,
        "evaluatedRole": employee.get("role", "employee"),
        "evaluatedName": employee.get("nome", ""),
        "evaluatorUid": gestor_id,
        "evaluatorRole": "manager",
        "evaluatorName": manager.get("nome") or manager.get("email") or "",
        "gestorId": gestor_id,
        "coordinatorUid": employee.get("coordinatorUid") or manager.get("coordinatorUid") or "",
        "referenceDate": reference_date,
        "dueDate": due_date,
        "status": "pending",
        "priority": "high",
        "submittedReviewId": None,
        "createdByUid": user_uid,
        "createdByRole": user_role,
        "createdAt": now,
        "updatedAt": now,
        "notificationState": {"isNew": True, "readByEvaluator": False, "lastReminderAt": None},
        "requestMeta": {
            "reason": "Criada pelo gestor" if user_role == "manager" else "Solicitada pelo coordenador",
            "requestedType": task_type,
        },
        "requiresAcknowledgment": True,
        "visibleToEmployee": True,
    }
    settings_snap = db.collection("app_settings").document("system_options").get()
    if settings_snap.exists:
        task["requiresAcknowledgment"] = (settings_snap.to_dict() or {}).get("employeeAcknowledgmentRequired") is not False
    db.collection("review_tasks").document(task_id).set(task, merge=True)
    return {"ok": True, "taskId": task_id, "task": {key: value for key, value in task.items() if key not in {"createdAt", "updatedAt"}}}


def create_admission_tasks(db, employee_uid: str, user_uid: str, user_role: str) -> Dict[str, Any]:
    employee_uid = (employee_uid or "").strip()
    if not employee_uid:
        raise ValueError("employeeUid is required")
    employee_snap = db.collection("employees").document(employee_uid).get()
    if not employee_snap.exists:
        raise LookupError("employee not found")
    employee = employee_snap.to_dict() or {}
    gestor_id = (employee.get("gestorId") or "").strip()
    if user_role == "manager" and gestor_id != user_uid:
        raise PermissionError("manager out of scope")
    if user_role not in {"admin", "manager"}:
        raise PermissionError("role not allowed")

    rules_snap = db.collection("app_settings").document("review_rules").get()
    rules = rules_snap.to_dict() if rules_snap.exists else {}
    tasks = build_admission_tasks(employee, created_by_uid=user_uid, created_by_role=user_role, review_rules=rules)
    if not tasks:
        return {"ok": True, "tasks": []}
    batch = db.batch()
    now = firestore.SERVER_TIMESTAMP
    for task in tasks:
        task_id = task.pop("id")
        ref = db.collection("review_tasks").document(task_id)
        batch.set(ref, {**task, "createdAt": now, "updatedAt": now}, merge=True)
        task["id"] = task_id
    batch.commit()
    return {"ok": True, "tasks": tasks}


def _parse_date(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%Y-%m-%d")


def build_admission_tasks(employee: Dict, created_by_uid: str, created_by_role: str, review_rules: Dict[str, Any] | None = None) -> List[Dict]:
    admission = (employee.get("admissionDate") or employee.get("admissao") or "").strip()
    if not admission or not (employee.get("uid") or "").strip():
        return []

    admission_date = _parse_date(admission)
    out = []
    rules = review_rules or {}
    defs = [
        ("experience_45", rules.get("experience45") or {"enabled": True, "daysAfterAdmission": 45, "daysBeforeDue": 4}),
        ("experience_90", rules.get("experience90") or {"enabled": True, "daysAfterAdmission": 90, "daysBeforeDue": 4}),
    ]
    for task_type, rule in defs:
        if rule.get("enabled") is False:
            continue
        days_after = int(rule.get("daysAfterAdmission") or (45 if task_type == "experience_45" else 90))
        days_before_due = int(rule.get("daysBeforeDue") or 4)
        ref = admission_date + timedelta(days=days_after)
        due = ref - timedelta(days=days_before_due)
        out.append({
            "id": f"{task_type}_{employee['uid']}_{ref.strftime('%Y-%m-%d')}",
            "taskType": task_type,
            "templateKey": "experience_review_v2",
            "origin": "automatic_admission_rule",
            "evaluatedUid": employee["uid"],
            "evaluatedName": employee.get("nome", ""),
            "evaluatorUid": employee.get("gestorId", ""),
            "evaluatorName": employee.get("gestorNome", ""),
            "gestorId": employee.get("gestorId", ""),
            "coordinatorUid": employee.get("coordinatorUid", ""),
            "referenceDate": ref.strftime('%Y-%m-%d'),
            "dueDate": due.strftime('%Y-%m-%d'),
            "status": "pending",
            "priority": "high",
            "submittedReviewId": None,
            "createdByUid": created_by_uid,
            "createdByRole": created_by_role,
        })
    return out

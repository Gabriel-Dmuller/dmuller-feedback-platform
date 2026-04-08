
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "/js/firebase.js";
import { apiGet, logBackendSuccess, logLocalFallback, shouldUseFirestoreFallback } from "/js/api-client.js";

export const EMPLOYEE_MANAGER_FIELD = "gestorId";
export const EMPLOYEE_ADMISSION_FIELD = "admissionDate";

export const DEFAULT_REVIEW_RULES = {
  experience45: { enabled: true, daysAfterAdmission: 45, daysBeforeDue: 4, templateKey: "experience_review_v2" },
  experience90: { enabled: true, daysAfterAdmission: 90, daysBeforeDue: 4, templateKey: "experience_review_v2" },
  semiannual: { enabled: true, daysBeforeDue: 7, templateKey: "employee_periodic_review_v2" },
  annual: { enabled: true, daysBeforeDue: 10, templateKey: "employee_periodic_review_v2" },
  requested: { enabled: true, daysBeforeDue: 7, templateKey: "employee_periodic_review_v2" }
};

export const DEFAULT_NOTIFICATION_RULES = {
  inAppEnabled: true,
  notifyOnNewTask: true,
  notifyDaysBeforeDue: [7,3,1]
};

export const REVIEW_SCALE = [
  { value: 5, label: "Muito bom" },
  { value: 4, label: "Bom" },
  { value: 3, label: "MÃ©dio" },
  { value: 2, label: "Ruim" },
  { value: 1, label: "Muito ruim" }
];

export const STANDARD_SECTIONS = [
  {
    id: "assiduidade",
    title: "Assiduidade",
    questions: [
      { id: "assiduidade_01", text: "Comparece regularmente ao trabalho" },
      { id: "assiduidade_02", text: "Ã‰ pontual no horÃ¡rio" },
      { id: "assiduidade_03", text: "Permanece no trabalho durante o expediente" },
      { id: "assiduidade_04", text: "Dedica-se Ã  execuÃ§Ã£o das tarefas, evitando interrupÃ§Ãµes e interferÃªncias alheias" },
      { id: "assiduidade_05", text: "Informa em tempo hÃ¡bil imprevistos que impeÃ§am o comparecimento ou cumprimento do horÃ¡rio" }
    ]
  },
  {
    id: "disciplina",
    title: "Disciplina",
    questions: [
      { id: "disciplina_01", text: "Exerce com zelo e dedicaÃ§Ã£o as atribuiÃ§Ãµes do cargo ou funÃ§Ã£o" },
      { id: "disciplina_02", text: "Observa as normas legais e regulamentares estabelecidas pela instituiÃ§Ã£o" },
      { id: "disciplina_03", text: "Cumpre as orientaÃ§Ãµes superiores respeitando a hierarquia" },
      { id: "disciplina_04", text: "Trata com urbanidade colegas e pÃºblico em geral" },
      { id: "disciplina_05", text: "Evita comentÃ¡rios comprometedores Ã  imagem e ao ambiente de trabalho" }
    ]
  },
  {
    id: "iniciativa",
    title: "Iniciativa",
    questions: [
      { id: "iniciativa_01", text: "Procura conhecer a instituiÃ§Ã£o, a Ã¡rea e os procedimentos" },
      { id: "iniciativa_02", text: "Busca atualizaÃ§Ã£o e capacitaÃ§Ã£o contÃ­nua" },
      { id: "iniciativa_03", text: "Encontra soluÃ§Ãµes adequadas para as necessidades do setor" },
      { id: "iniciativa_04", text: "Encaminha corretamente assuntos fora da prÃ³pria alÃ§ada" },
      { id: "iniciativa_05", text: "Mostra disposiÃ§Ã£o para aprender outros serviÃ§os e apoiar colegas" }
    ]
  },
  {
    id: "produtividade",
    title: "Produtividade",
    questions: [
      { id: "produtividade_01", text: "Planeja e organiza as tarefas observando prioridades" },
      { id: "produtividade_02", text: "MantÃ©m ritmo de trabalho regular e responde bem a picos" },
      { id: "produtividade_03", text: "Executa atividades com qualidade, evitando retrabalho" },
      { id: "produtividade_04", text: "Usa o tempo de forma racional, cumprindo prazos" },
      { id: "produtividade_05", text: "Domina tecnologias e equipamentos necessÃ¡rios" }
    ]
  },
  {
    id: "responsabilidade",
    title: "Responsabilidade",
    questions: [
      { id: "responsabilidade_01", text: "Inspira confianÃ§a por honestidade, integridade e imparcialidade" },
      { id: "responsabilidade_02", text: "Zela pelo patrimÃ´nio e evita desperdÃ­cios" },
      { id: "responsabilidade_03", text: "Mostra comprometimento com acordos e obrigaÃ§Ãµes" },
      { id: "responsabilidade_04", text: "Zela pela imagem profissional e apresentaÃ§Ã£o" },
      { id: "responsabilidade_05", text: "Age com discriÃ§Ã£o em assuntos internos" }
    ]
  },
  {
    id: "comunicacao",
    title: "ComunicaÃ§Ã£o",
    questions: [
      { id: "comunicacao_01", text: "Sabe escutar e interagir com clareza" },
      { id: "comunicacao_02", text: "Relaciona-se cordialmente para manter ambiente produtivo" },
      { id: "comunicacao_03", text: "Adapta a linguagem aos interlocutores e transmite com precisÃ£o" }
    ]
  }
];

export const EXPERIENCE_QUESTIONS = [
  { id: "experiencia_qualidade_execucao", text: "Qualidade da execuÃ§Ã£o" },
  { id: "experiencia_comprometimento", text: "Comprometimento" },
  { id: "experiencia_organizacao", text: "OrganizaÃ§Ã£o" },
  { id: "experiencia_relacionamento_equipe", text: "Relacionamento com a equipe" },
  { id: "experiencia_resultado_entregue", text: "Resultado entregue" }
];

export const EXPERIENCE_DECISIONS = [
  { value: "effectivate", label: "Efetivar" },
  { value: "extend", label: "Prorrogar" },
  { value: "dismiss", label: "Desligar" }
];

export const FEEDBACK_FIELDS = [
  { id: "strengths", label: "Pontos fortes" },
  { id: "weaknesses", label: "Pontos de atenÃ§Ã£o" },
  { id: "improvements", label: "Pontos de melhoria" },
  { id: "generalComment", label: "ComentÃ¡rio geral" }
];

export function isExperienceTask(taskType) {
  return ["experience_45", "experience_90"].includes(String(taskType || ""));
}

export function flattenStandardQuestions() {
  return STANDARD_SECTIONS.flatMap(section => section.questions.map(q => ({ ...q, sectionId: section.id, sectionTitle: section.title })));
}

export function getTemplateForTaskType(taskType) {
  const isExperience = isExperienceTask(taskType);
  return {
    taskType,
    scale: REVIEW_SCALE,
    standardSections: STANDARD_SECTIONS,
    feedbackFields: FEEDBACK_FIELDS,
    experience: {
      enabled: isExperience,
      questions: isExperience ? EXPERIENCE_QUESTIONS : [],
      decisions: isExperience ? EXPERIENCE_DECISIONS : []
    }
  };
}

export async function loadTemplateForTaskType(taskType) {
  try {
    const template = await apiGet(`/api/reviews/template/${encodeURIComponent(taskType || "")}`, { authRequired: false });
    logBackendSuccess("template de avaliação", { taskType });
    return template;
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    logLocalFallback("template de avaliação", error);
    return getTemplateForTaskType(taskType);
  }
}

export async function loadSettingsDoc(id, defaults={}) {
  try {
    const snap = await getDoc(doc(db, 'app_settings', id));
    if (!snap.exists()) return structuredClone(defaults);
    return deepMerge(structuredClone(defaults), snap.data() || {});
  } catch {
    return structuredClone(defaults);
  }
}

function deepMerge(target, source) {
  for (const [k,v] of Object.entries(source || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      target[k] = deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

export function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatDateOnly(value) {
  const d = parseDateOnly(value);
  if (!d) return '';
  const y = String(d.getFullYear());
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

export function formatDateBR(value) {
  const d = parseDateOnly(value);
  if (!d) return '-';
  return d.toLocaleDateString('pt-BR');
}

export function addDays(dateValue, days) {
  const d = parseDateOnly(dateValue);
  if (!d) return null;
  const out = new Date(d);
  out.setDate(out.getDate() + Number(days || 0));
  return out;
}

export function diffDays(a, b) {
  const da = parseDateOnly(a);
  const db = parseDateOnly(b);
  if (!da || !db) return null;
  const ms = new Date(da.getFullYear(),da.getMonth(),da.getDate()).getTime() - new Date(db.getFullYear(),db.getMonth(),db.getDate()).getTime();
  return Math.round(ms / 86400000);
}

export function getEmployeeAdmissionDate(employee) {
  // Compatibilidade isolada para documentos antigos; novos fluxos escrevem apenas admissionDate.
  return employee?.[EMPLOYEE_ADMISSION_FIELD] || employee?.admissao || '';
}

export function getEmployeeGestorId(employee, fallback='') {
  return employee?.[EMPLOYEE_MANAGER_FIELD] || fallback || '';
}

export function makeTaskId(taskType, evaluatedUid, referenceDate) {
  return `${String(taskType||'task').trim()}_${String(evaluatedUid||'').trim()}_${formatDateOnly(referenceDate)}`;
}

export function buildAutomaticExperienceTasks(employee, settings, context={}) {
  const admission = parseDateOnly(getEmployeeAdmissionDate(employee));
  if (!admission || !employee?.uid) return [];
  const rules = settings || DEFAULT_REVIEW_RULES;
  const gestorId = getEmployeeGestorId(employee, context.gestorId);
  const base = {
    evaluatedUid: employee.uid,
    evaluatedRole: employee.role || 'employee',
    evaluatedName: employee.nome || '',
    evaluatorUid: gestorId,
    evaluatorRole: 'manager',
    evaluatorName: context.managerName || '',
    gestorId,
    coordinatorUid: employee.coordinatorUid || context.coordinatorUid || '',
    employeeAdmissionDate: formatDateOnly(admission),
    createdByUid: context.createdByUid || 'system',
    createdByRole: context.createdByRole || 'system',
    notificationState: { isNew: true, readByEvaluator: false, lastReminderAt: null },
    requestMeta: { reason: null, cycleId: null }
  };
  const defs = [
    ['experience_45', rules.experience45],
    ['experience_90', rules.experience90],
  ];
  const out = [];
  for (const [taskType, rule] of defs) {
    if (!rule?.enabled) continue;
    const referenceDate = addDays(admission, Number(rule.daysAfterAdmission || 0));
    const dueDate = addDays(referenceDate, -Number(rule.daysBeforeDue || 0));
    out.push({
      id: makeTaskId(taskType, employee.uid, referenceDate),
      taskType,
      origin: 'automatic_admission_rule',
      templateKey: rule.templateKey || 'experience_review_v2',
      referenceDate: formatDateOnly(referenceDate),
      dueDate: formatDateOnly(dueDate),
      status: 'pending',
      priority: 'high',
      submittedReviewId: null,
      ...base
    });
  }
  return out;
}

export function taskBadge(task) {
  const st = String(task?.status || 'pending').toLowerCase();
  if (st === 'submitted') return 'Enviada';
  if (st === 'overdue') return 'Atrasada';
  if (st === 'cancelled') return 'Cancelada';
  if (st === 'in_progress') return 'Em andamento';
  return 'Pendente';
}

export function taskTypeLabel(type) {
  return {
    experience_45: '45 dias de experiência',
    experience_90: '90 dias de experiência',
    semiannual: 'Semestral',
    annual: 'Anual',
    requested: 'Solicitada',
  }[type] || type || '-';
}

export function isOverdue(task) {
  const st = String(task?.status || '').toLowerCase();
  if (st === 'submitted' || st === 'cancelled') return false;
  const dd = diffDays(task?.dueDate, formatDateOnly(new Date()));
  return dd != null && dd < 0;
}

export function dueInDays(task) {
  return diffDays(task?.dueDate, formatDateOnly(new Date()));
}

export function scoreLabel(avg) {
  const n = Number(avg || 0);
  if (n >= 4.5) return 'Excelente';
  if (n >= 3.5) return 'Bom';
  if (n >= 2.5) return 'Médio';
  if (n >= 1.5) return 'Ruim';
  return 'Muito ruim';
}

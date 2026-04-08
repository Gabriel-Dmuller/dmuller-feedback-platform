import { apiPost, logBackendSuccess, shouldUseFirestoreFallback } from "/js/api-client.js";
import { requireRole } from "/js/auth-guard.js";
import { renderShell } from "/js/ui-shell.js";
import { dueInDays, formatDateBR, taskTypeLabel } from "/js/review-core.js";
import { getActiveScope, getManagerScopeUid, getScopeLabel, loadScopedEmployees, loadScopedTasks, loadVisibleLeaderMap } from "/js/scope-utils.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const todayStr = () => new Date().toISOString().slice(0, 10);

function taskStatus(task) {
  const days = dueInDays(task);
  if (days != null && days < 0) return ["red", "Atrasada"];
  if (days === 0) return ["yellow", "Vence hoje"];
  return ["blue", "Pendente"];
}

function taskTable(tasks, role) {
  if (!tasks.length) return `<div class="empty">Nenhuma pendência em aberto.</div>`;
  return `<table class="table"><thead><tr><th>Funcionário</th><th>Tipo</th><th>Líder</th><th>Prazo</th><th>Status</th><th></th></tr></thead><tbody>${tasks.map((task) => {
    const [cls, label] = taskStatus(task);
    const action = role === "manager" ? `<a class="btn" href="/performance-review-create.html?taskId=${encodeURIComponent(task.id)}">Abrir</a>` : `<span class="pill blue">Consulta</span>`;
    return `<tr><td>${esc(task.evaluatedName || "-")}</td><td>${esc(taskTypeLabel(task.taskType))}</td><td>${esc(task.evaluatorName || "-")}</td><td>${esc(formatDateBR(task.dueDate))}</td><td><span class="pill ${cls}">${label}</span></td><td>${action}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function createPanel(canCreate, employees, blockedMessage) {
  if (!canCreate) return `<div class="empty">${esc(blockedMessage)}</div>`;
  return `<div class="createWrap"><div class="field"><div class="label">Funcionário</div><select id="employeeSelect" class="select"><option value="">Selecione</option>${employees.map((employee) => `<option value="${employee.uid || employee.id}">${esc(employee.nome || employee.email || "Funcionário")}</option>`).join("")}</select></div><div class="field"><div class="label">Tipo de avaliação</div><select id="typeSelect" class="select"><option value="semiannual">Semestral</option><option value="annual">Anual</option><option value="requested">Solicitada</option></select></div><div class="field"><div class="label">Prazo para finalizar</div><input type="date" id="dueDate" class="input" value="${todayStr()}"></div><div class="msg" id="createMsg"></div><div><button class="btn" id="btnCreateTask">Criar avaliação</button></div></div>`;
}

async function bindCreateTask({ employees, managerScopeUid }) {
  const msg = document.getElementById("createMsg");
  const setMsg = (text, ok = false) => {
    msg.className = `msg ${text ? (ok ? "ok" : "bad") : ""}`;
    msg.textContent = text || "";
  };

  document.getElementById("btnCreateTask").addEventListener("click", async () => {
    const dueDate = document.getElementById("dueDate").value;
    const employeeUid = document.getElementById("employeeSelect").value;
    const taskType = document.getElementById("typeSelect").value;
    if (!dueDate) return setMsg("Informe o prazo para finalizar.");
    if (!employeeUid) return setMsg("Selecione um funcionário.");
    const employee = employees.find((item) => (item.uid || item.id) === employeeUid);
    if (!employee) return setMsg("Funcionário não encontrado.");

    setMsg("Criando avaliação...");
    try {
      await apiPost("/api/reviews/tasks/create", { taskType, evaluatedUid: employee.uid || employee.id, gestorId: managerScopeUid, referenceDate: dueDate, dueDate });
      logBackendSuccess("criação de review task", { taskType, evaluatedUid: employee.uid || employee.id, gestorId: managerScopeUid });
      setMsg("Avaliação criada com sucesso.", true);
      setTimeout(() => location.reload(), 500);
    } catch (apiError) {
      console.error(apiError);
      setMsg(shouldUseFirestoreFallback(apiError)
        ? "Backend indisponível para criar a avaliação."
        : "Não foi possível criar a avaliação pelo backend agora.");
    }
  });
}

const { user, role } = await requireRole(["manager", "admin", "coordinator"]);
const content = await renderShell({ role, currentPage: "manager-performance" });
const scope = getActiveScope(role, user);
const [roleMap, tasksRaw, employees] = await Promise.all([
  loadVisibleLeaderMap(role, user),
  loadScopedTasks(role, user, { scope }),
  loadScopedEmployees(role, user, { scope }),
]);
const openTasks = tasksRaw
  .filter((task) => !["submitted", "cancelled"].includes(String(task.status || "").toLowerCase()))
  .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
const scopeLabel = getScopeLabel(scope, user, roleMap);
const managerScopeUid = getManagerScopeUid(role, user);
const canCreate = role !== "admin" && !!managerScopeUid;
const createBlockedMessage = role === "admin" ? "O acesso do admin é somente para consulta nesta tela." : "Selecione um gestor no topo para criar uma avaliação manual.";

content.innerHTML = `
<style>.wrap{display:grid;gap:16px;max-width:1180px;margin:0 auto}.grid2{display:grid;grid-template-columns:1.12fr .88fr;gap:16px}.box{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:20px;box-shadow:0 10px 24px rgba(0,0,0,.04)}.title{font-size:24px;font-weight:900;color:#0f172a}.sub{margin-top:6px;color:#64748b;font-size:13px;font-weight:700}.table{width:100%;border-collapse:collapse;margin-top:16px}.table th,.table td{padding:14px 12px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:middle}.table th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}.pill{padding:6px 10px;border-radius:999px;font-size:12px;font-weight:900;display:inline-flex;align-items:center}.blue{background:#e8f1ff;color:#1d4ed8}.yellow{background:#fff7d6;color:#92400e}.red{background:#fee2e2;color:#991b1b}.btn{display:inline-flex;padding:10px 12px;border-radius:12px;background:#0f172a;color:#fff;text-decoration:none;font-weight:900;cursor:pointer;border:none}.empty{padding:20px;color:#64748b;font-weight:800}.createWrap{display:grid;gap:14px;margin-top:14px}.field{display:flex;flex-direction:column;gap:8px}.label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:900}.input,.select{width:100%;padding:12px;border:1px solid #d1d5db;border-radius:14px;font:inherit;background:#fff}.msg{margin-top:12px;font-weight:800}.msg.ok{color:#166534}.msg.bad{color:#b91c1c}@media(max-width:960px){.grid2{grid-template-columns:1fr}}</style>
<div class="wrap"><div class="grid2"><div class="box"><div class="title">Aguardando avaliação</div><div class="sub">Pendências do escopo: ${esc(scopeLabel)}.</div>${taskTable(openTasks, role)}</div><div class="box"><div class="title">Criar avaliação</div><div class="sub">Abra uma nova pendência manual para a equipe do gestor selecionado.</div>${createPanel(canCreate, employees, createBlockedMessage)}</div></div></div>`;

if (canCreate) await bindCreateTask({ employees, managerScopeUid });

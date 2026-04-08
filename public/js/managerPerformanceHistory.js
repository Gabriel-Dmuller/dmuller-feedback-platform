import { requireRole } from "/js/auth-guard.js";
import { renderShell } from "/js/ui-shell.js";
import { taskTypeLabel, formatDateBR } from "/js/review-core.js";
import { getActiveScope, getScopeLabel, loadScopedReviews, loadScopedTasks, loadVisibleLeaderMap } from "/js/scope-utils.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
function renderMessage(content, message) { content.innerHTML = `<div style="max-width:1180px;margin:0 auto"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:24px;font-weight:800;color:#475569">${esc(message)}</div></div>`; }
async function loadScopeData(role, user) {
  const scope = getActiveScope(role, user);
  const [taskSnap, reviewSnap, roleMap] = await Promise.all([
    loadScopedTasks(role, user, { scope }),
    loadScopedReviews(role, user, { scope }),
    loadVisibleLeaderMap(role, user)
  ]);
  return {
    tasks: taskSnap,
    reviews: reviewSnap,
    label: getScopeLabel(scope, user, roleMap),
  };
}

const { user, role } = await requireRole(["manager", "admin", "coordinator"]);
const content = await renderShell({ role, currentPage: "manager-performance-history" });
try {
  const { tasks, reviews, label } = await loadScopeData(role, user);
  const orderedReviews = reviews.sort((a,b)=>(b.submittedAt?.toMillis?.()||0)-(a.submittedAt?.toMillis?.()||0));
  const awaitingManager = tasks.filter((t)=>!["submitted","cancelled"].includes(String(t.status||"").toLowerCase())).sort((a,b)=>String(a.dueDate||"").localeCompare(String(b.dueDate||"")));
  const pendingAck = orderedReviews.filter((r)=>!["acknowledged","done","not_required"].includes(String(r.acknowledgment?.status||"").toLowerCase()));
  const completed = orderedReviews.filter((r)=>["acknowledged","done","not_required"].includes(String(r.acknowledgment?.status||"").toLowerCase()));
  const box=(title,sub,inner)=>`<div class="box"><div class="title">${title}</div><div class="sub">${sub}</div>${inner}</div>`;
  const taskTable=(items)=>items.length?`<table class="table"><thead><tr><th>Funcionário</th><th>Tipo</th><th>Líder</th><th>Prazo</th>${role === "manager" ? "<th></th>" : ""}</tr></thead><tbody>${items.map((item)=>`<tr><td>${esc(item.evaluatedName||"-")}</td><td>${esc(taskTypeLabel(item.taskType))}</td><td>${esc(item.evaluatorName||"-")}</td><td>${esc(formatDateBR(item.dueDate))}</td>${role === "manager" ? `<td><a class="btn" href="/performance-review-create.html?taskId=${encodeURIComponent(item.id)}">Abrir</a></td>` : ""}</tr>`).join("")}</tbody></table>`:`<div class="empty">Nenhum registro.</div>`;
  const reviewTable=(items,statusText)=>items.length?`<table class="table"><thead><tr><th>Funcionário</th><th>Tipo</th><th>Referência</th><th>Média</th><th>Status</th><th></th></tr></thead><tbody>${items.map((item)=>`<tr><td>${esc(item.evaluatedName||"-")}</td><td>${esc(taskTypeLabel(item.taskType))}</td><td>${esc(formatDateBR(item.referenceDate))}</td><td><span class="pill score">${esc(item.score?.average ?? "-")}</span></td><td><span class="pill ${statusText === "Concluída" ? "ack" : "pending"}">${statusText}</span></td><td><a class="btn" href="/performance-review-view.html?id=${encodeURIComponent(item.id)}">Ver</a></td></tr>`).join("")}</tbody></table>`:`<div class="empty">Nenhum registro.</div>`;
  content.innerHTML = `<style>.wrap{display:grid;gap:16px;max-width:1180px;margin:0 auto}.box{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:20px;box-shadow:0 10px 24px rgba(0,0,0,.04)}.title{font-size:22px;font-weight:900;color:#0f172a}.sub{margin-top:6px;color:#64748b;font-size:13px;font-weight:700}.table{width:100%;border-collapse:collapse;margin-top:16px}.table th,.table td{padding:14px 12px;border-bottom:1px solid #e5e7eb;text-align:left}.table th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}.pill{padding:6px 10px;border-radius:999px;font-size:12px;font-weight:900}.pending{background:#fff7d6;color:#92400e}.ack{background:#dcfce7;color:#166534}.score{background:#e8f1ff;color:#1d4ed8}.btn{display:inline-flex;padding:10px 12px;border-radius:12px;background:#0f172a;color:#fff;text-decoration:none;font-weight:900}.empty{padding:20px;color:#64748b;font-weight:800}</style><div class="wrap">${box("Aguardando avaliação",`Pendências do escopo: ${esc(label)}.`,taskTable(awaitingManager))}${box("Pendentes de confirmação",`Avaliações já enviadas no escopo: ${esc(label)}.`,reviewTable(pendingAck,"Pendente de confirmação"))}${box("Concluídas",`Avaliações finalizadas no escopo: ${esc(label)}.`,reviewTable(completed,"Concluída"))}</div>`;
} catch (error) { console.error(error); renderMessage(content, "Não foi possível carregar o histórico agora."); }

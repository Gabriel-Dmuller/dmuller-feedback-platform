import { requireRole } from "/js/auth-guard.js";
import { renderShell } from "/js/ui-shell.js";
import {
  setActiveManagerUid
} from "/js/state.js";
import { dueInDays, formatDateBR, taskTypeLabel } from "/js/review-core.js";
import { getActiveScope, loadScopedEmployees, loadScopedReviews, loadScopedTasks, loadVisibleLeaderMap } from "/js/scope-utils.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));

function emptyState(content, message) {
  content.innerHTML = `
    <div style="max-width:1180px;margin:0 auto">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:24px;font-weight:800;color:#475569">
        ${esc(message)}
      </div>
    </div>
  `;
}

function taskCard(task, late = false) {
  const badgeClass = late ? "red" : "blue";
  const leader = task.evaluatorName || "-";

  return `
    <div class="item">
      <div class="item-name">${esc(task.evaluatedName || "Funcionário")}</div>

      <div class="item-line">
        <span class="label">Tipo:</span>
        <span class="pill ${badgeClass}">
          ${esc(taskTypeLabel(task.taskType, task.requestMeta?.requestedType))}
        </span>
      </div>

      <div class="item-line">
        <span class="label">Líder:</span>
        <span>${esc(leader)}</span>
      </div>

      <div class="item-line">
        <span class="label">Prazo:</span>
        <span>${esc(formatDateBR(task.dueDate))}</span>
      </div>
    </div>
  `;
}

function buildManagerAlert(tasks) {
  const overdue = tasks
    .filter((t) => {
      const dd = dueInDays(t);
      return dd != null && dd < 0;
    })
    .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));

  const dueSoon = tasks
    .filter((t) => {
      const dd = dueInDays(t);
      return dd != null && dd >= 0 && dd <= 7;
    })
    .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));

  return { overdue, dueSoon };
}

function renderManagerAlertModal(items) {
  if (!items.length) return "";

  return `
    <div class="mh-modal-backdrop" id="pendingModal">
      <div class="mh-modal">
        <div class="mh-modal-head">
          <div>
            <div class="mh-modal-title">Você tem avaliações pedindo atenção</div>
            <div class="mh-modal-sub">Quer responder alguma agora?</div>
          </div>
          <button class="mh-modal-close" id="closePendingModal" type="button">Fechar</button>
        </div>

        <div class="mh-modal-list">
          ${items.map((task) => {
            const dd = dueInDays(task);
            const tag = dd < 0
              ? `<span class="mh-modal-pill red">Atrasada ${Math.abs(dd)} dia(s)</span>`
              : dd === 0
                ? `<span class="mh-modal-pill yellow">Vence hoje</span>`
                : `<span class="mh-modal-pill blue">Vence em ${dd} dia(s)</span>`;

            return `
              <div class="mh-modal-item">
                <div class="mh-modal-item-main">
                  <div class="mh-modal-item-name">${esc(task.evaluatedName || "Funcionário")}</div>
                  <div class="mh-modal-item-sub">
                    ${esc(taskTypeLabel(task.taskType, task.requestMeta?.requestedType))} •
                    Prazo ${esc(formatDateBR(task.dueDate))}
                  </div>
                </div>
                <div class="mh-modal-item-actions">
                  ${tag}
                  <a class="mh-open-btn" href="/performance-review-create.html?taskId=${encodeURIComponent(task.id)}">Abrir</a>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

const { user, role } = await requireRole(["admin", "manager", "coordinator"]);
const content = await renderShell({ role, currentPage: "manager-home" });

const scope = getActiveScope(role, user, { allowAdminAll: false });

if (!scope) {
  emptyState(content, "Selecione um coordenador ou gestor para visualizar o painel.");
} else {
  try {
    const [roleMap, employees, tasks, reviews] = await Promise.all([
      loadVisibleLeaderMap(role, user),
      loadScopedEmployees(role, user, { scope }),
      loadScopedTasks(role, user, { scope }),
      loadScopedReviews(role, user, { scope })
    ]);
    const leader = roleMap.get(scope.uid) || {};
    const managersForCoordinator = scope.kind === "coordinator"
      ? [...roleMap.values()].filter((x) => x.role === "manager" && x.coordinatorUid === scope.uid)
      : [];

    const filteredTasks = [...tasks];
    const selectedManagerUid = "";
    const selectedManagerName = "";

    const openTasks = filteredTasks.filter(
      (t) => !["submitted", "cancelled"].includes(String(t.status || "").toLowerCase())
    );

    const overdue = openTasks
      .filter((t) => {
        const dd = dueInDays(t);
        return dd != null && dd < 0;
      })
      .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));

    const upcoming = openTasks
      .filter((t) => {
        const dd = dueInDays(t);
        return dd != null && dd >= 0;
      })
      .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));

    const doneThisScope = filteredTasks.filter(
      (t) => String(t.status || "").toLowerCase() === "submitted"
    ).length;

    const avgScore = reviews.length
      ? reviews.reduce((acc, item) => acc + Number(item.score?.average || 0), 0) / reviews.length
      : 0;

    const scopeLabel = selectedManagerName || leader.nome || leader.email || (scope.kind === "coordinator" ? "Coordenador" : "Gestor");

    const managerAlert =
      role === "manager"
        ? buildManagerAlert(openTasks)
        : { overdue: [], dueSoon: [] };

    const managerAlertItems = [...managerAlert.overdue, ...managerAlert.dueSoon].slice(0, 12);

    content.innerHTML = `
      <style>
        .dash{display:grid;gap:16px;max-width:1180px;margin:0 auto}
        .hero{background:linear-gradient(135deg,#081226 0%,#0f254c 100%);color:#fff;border-radius:24px;padding:22px;border:1px solid rgba(255,255,255,.08);box-shadow:0 16px 34px rgba(2,8,23,.18)}
        .kicker{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#dbe7ff}
        .kicker i{width:8px;height:8px;border-radius:999px;background:#f4c400;display:inline-block;box-shadow:0 0 0 6px rgba(244,196,0,.14)}
        .title{margin-top:10px;font-size:30px;font-weight:900;line-height:1.08;color:#fff !important}
        .sub{margin-top:8px;font-size:14px;color:#dbe7ff;font-weight:700;line-height:1.5}
        .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
        .card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;box-shadow:0 12px 24px rgba(15,23,42,.05)}
        .k{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:900}
        .v{margin-top:10px;font-size:28px;font-weight:900;color:#0f172a}
        .s{margin-top:8px;color:#64748b;font-size:13px;font-weight:700}
        .panelGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .panel{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;box-shadow:0 12px 24px rgba(15,23,42,.05)}
        .panelTitle{font-size:18px;font-weight:900;color:#0b1f44}
        .panelSub{margin-top:6px;color:#64748b;font-size:13px;font-weight:700}
        .list{display:grid;gap:10px;margin-top:14px}
        .item{border:1px solid #e5e7eb;border-radius:16px;padding:14px;background:#f8fafc}
        .item-name{font-size:14px;font-weight:900;color:#0f172a;margin-bottom:8px}
        .item-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;color:#334155;font-weight:700;font-size:13px}
        .label{color:#64748b;font-weight:900}
        .pill{display:inline-flex;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:900}
        .pill.blue{background:#e8f1ff;color:#1d4ed8}
        .pill.red{background:#fee2e2;color:#991b1b}
        .empty{padding:18px;border:1px dashed #cbd5e1;border-radius:18px;background:#fff;color:#475569;font-weight:700}
        .mh-filter{margin-top:14px;display:flex;gap:10px;align-items:end;flex-wrap:wrap}
        .mh-field{display:flex;flex-direction:column;gap:6px;min-width:260px}
        .mh-label{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#dbe7ff}
        .mh-select{width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.10);color:#fff;font-weight:800;outline:none}
        .mh-select option{color:#111}
        .mh-modal-backdrop{position:fixed;inset:0;background:rgba(2,8,23,.56);display:flex;align-items:center;justify-content:center;padding:18px;z-index:9999}
        .mh-modal{width:min(860px,100%);background:#fff;border-radius:22px;border:1px solid #e5e7eb;box-shadow:0 24px 60px rgba(15,23,42,.25);padding:20px}
        .mh-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .mh-modal-title{font-size:22px;font-weight:900;color:#0f172a}
        .mh-modal-sub{margin-top:6px;font-size:13px;color:#64748b;font-weight:700}
        .mh-modal-close{border:1px solid #cbd5e1;background:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:900}
        .mh-modal-list{display:grid;gap:10px;margin-top:16px;max-height:60vh;overflow:auto}
        .mh-modal-item{border:1px solid #e5e7eb;border-radius:16px;background:#f8fafc;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .mh-modal-item-name{font-size:15px;font-weight:900;color:#0f172a}
        .mh-modal-item-sub{margin-top:6px;font-size:13px;color:#64748b;font-weight:700}
        .mh-modal-item-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .mh-modal-pill{display:inline-flex;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:900}
        .mh-modal-pill.blue{background:#e8f1ff;color:#1d4ed8}
        .mh-modal-pill.yellow{background:#fff7d6;color:#92400e}
        .mh-modal-pill.red{background:#fee2e2;color:#991b1b}
        .mh-open-btn{display:inline-flex;padding:10px 12px;border-radius:12px;background:#0f172a;color:#fff;text-decoration:none;font-weight:900}
        @media(max-width:960px){.cards,.panelGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:640px){.cards,.panelGrid{grid-template-columns:1fr}}
      </style>

      <div class="dash">
        ${renderManagerAlertModal(managerAlertItems)}

        <section class="hero">
          <div class="kicker"><i></i> Painel de gestão</div>
          <div class="title">Visão geral da operação</div>
          <div class="sub">Escopo atual: ${esc(scopeLabel)}</div>

          ${scope.kind === "coordinator" ? `
            <div class="mh-filter">
              <div class="mh-field">
                <div class="mh-label">Gestor</div>
                <select id="coordinatorManagerFilter" class="mh-select">
                  <option value="">Todos os gestores</option>
                  ${managersForCoordinator.map((mgr) => `
                    <option value="${mgr.id}" ${mgr.id === selectedManagerUid ? "selected" : ""}>
                      ${esc(mgr.nome || mgr.email || "Gestor")}
                    </option>
                  `).join("")}
                </select>
              </div>
            </div>
          ` : ``}
        </section>

        <section class="cards">
          <div class="card">
            <div class="k">Funcionários</div>
            <div class="v">${employees.length}</div>
            <div class="s">Base ativa do escopo atual.</div>
          </div>

          <div class="card">
            <div class="k">Pendências abertas</div>
            <div class="v">${openTasks.length}</div>
            <div class="s">Avaliações aguardando envio do gestor.</div>
          </div>

          <div class="card">
            <div class="k">Atrasos</div>
            <div class="v">${overdue.length}</div>
            <div class="s">Pendências com prazo vencido.</div>
          </div>

          <div class="card">
            <div class="k">Média geral</div>
            <div class="v">${avgScore ? avgScore.toFixed(2) : "-"}</div>
            <div class="s">${doneThisScope} avaliação(ões) já enviadas.</div>
          </div>
        </section>

        <section class="panelGrid">
          <div class="panel">
            <div class="panelTitle">Próximas pendências</div>
            <div class="panelSub">Somente avaliações que ainda não venceram.</div>
            <div class="list">
              ${upcoming.length
                ? upcoming.slice(0, 8).map((task) => taskCard(task, false)).join("")
                : `<div class="empty">Nenhuma pendência futura em aberto.</div>`}
            </div>
          </div>

          <div class="panel">
            <div class="panelTitle">Atrasos</div>
            <div class="panelSub">Pendências que já passaram do prazo.</div>
            <div class="list">
              ${overdue.length
                ? overdue.slice(0, 8).map((task) => taskCard(task, true)).join("")
                : `<div class="empty">Nenhuma pendência em atraso.</div>`}
            </div>
          </div>
        </section>
      </div>
    `;

    const managerFilter = document.getElementById("coordinatorManagerFilter");
    if (managerFilter) {
      managerFilter.addEventListener("change", () => {
        setActiveManagerUid(managerFilter.value || "");
        location.reload();
      });
    }

    const pendingModal = document.getElementById("pendingModal");
    const closePendingModal = document.getElementById("closePendingModal");
    if (pendingModal && closePendingModal) {
      closePendingModal.addEventListener("click", () => pendingModal.remove());
    }
  } catch {
    emptyState(content, "Não foi possível carregar o painel agora.");
  }
}

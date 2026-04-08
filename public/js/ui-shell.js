
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth } from "/js/firebase.js";
import { apiGet, logBackendSuccess } from "/js/api-client.js";
import {
  getActiveManagerUid,
  setActiveManagerUid,
  getActiveCoordinatorUid,
  setActiveCoordinatorUid,
  clearActiveScope,
  setCurrentUserCache,
  clearCurrentUserCache
} from "/js/state.js";
import { taskTypeLabel, dueInDays, formatDateBR } from "/js/review-core.js";
import { getActiveScope, loadScopedTasks, loadVisibleLeaders } from "/js/scope-utils.js";

function waitForUser() {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser);
    const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u || null); });
  });
}

function accessLabel(role) {
  return { admin: "RH", coordinator: "Coordenador", manager: "Gestor", employee: "Funcionário" }[role] || "Painel";
}
function titleFromPage(page) {
  return {
    "manager-home": "Home",
    "manager-employees": "Funcionários",
    "manager-create-employee": "Criar Funcionário",
    "manager-performance": "Avaliações",
    "manager-performance-history": "Histórico de Avaliações",
    "admin-managers": "Lideranças",
    "admin-create-manager": "Criar Liderança",
    "admin-import": "Importar Dados",
    "admin-settings": "Configurações"
  }[page] || "Painel";
}

export async function renderShell({ role, currentPage }) {
  document.body.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><img class="brand-logo" src="/img/logo_dmuller.svg" alt="D'MULLER" onerror="this.style.display='none'"/><div class="brand-sub">Plataforma de avaliações</div></div>
        <div class="whoami"><div class="roleTag">Acesso</div><div class="who" id="whoami">-</div><div class="who-sub">${accessLabel(role)}</div></div>
        <nav class="nav">
          <a class="nav-item ${currentPage === "manager-home" ? "active" : ""}" href="/manager-home.html">Home</a>
          <a class="nav-item ${currentPage === "manager-employees" ? "active" : ""}" href="/manager-employees.html">Funcionários</a>
          ${role !== "coordinator" ? `<a class="nav-item ${currentPage === "manager-create-employee" ? "active" : ""}" href="/manager-create-employee.html">Criar Funcionário</a>` : ""}
          <a class="nav-item ${currentPage === "manager-performance" ? "active" : ""}" href="/manager-performance.html">Avaliações</a>
          <a class="nav-item ${currentPage === "manager-performance-history" ? "active" : ""}" href="/manager-performance-history.html">Histórico de Avaliações</a>
          ${role === "admin" ? `<div class="nav-section">Administração</div><a class="nav-item ${currentPage === "admin-managers" ? "active" : ""}" href="/admin-managers.html">Lideranças</a><a class="nav-item ${currentPage === "admin-create-manager" ? "active" : ""}" href="/admin-create-manager.html">Criar Liderança</a><a class="nav-item ${currentPage === "admin-import" ? "active" : ""}" href="/admin-import.html">Importar Dados</a><a class="nav-item ${currentPage === "admin-settings" ? "active" : ""}" href="/admin-settings.html">Configurações</a>` : ""}
        </nav>
        <button class="btn-logout" id="btnLogout">Sair</button>
      </aside>
      <main class="main">
        <header class="topbar">
          <div><div class="pageTitle">${titleFromPage(currentPage)}</div></div>
          <div class="topbar-right">
            ${(role === "admin" || role === "coordinator") ? `
              <div class="scope-stack">
                ${role === "admin" ? `<div class="pill"><span class="pill-label">Coordenador</span><select id="coordinatorSelect" class="pill-select"><option value="">Todos</option></select></div>` : ""}
                <div class="pill"><span class="pill-label">Gestor</span><select id="managerSelect" class="pill-select"><option value="">Todos</option></select></div>
              </div>` : ""}
            <button class="notif-btn" id="notifBtn" type="button" aria-label="Notificações">🔔<span class="notif-count" id="notifCount">0</span></button>
            <div class="notif-menu" id="notifMenu"><div class="notif-title">Notificações</div><div id="notifList"><div class="notif-empty">Nenhuma atualização por enquanto.</div></div></div>
            <div class="pill"><span class="pill-label">Usuário</span><span class="pill-value" id="whoamiTop">-</span></div>
          </div>
        </header>
        <section class="page"><div id="pageContent"></div></section>
      </main>
    </div>`;

  injectShellCSS();
  const currentUser = await waitForUser();
  const whoami = document.getElementById("whoami");
  const whoamiTop = document.getElementById("whoamiTop");
  if (currentUser) {
    try {
      const me = await apiGet("/api/me");
      logBackendSuccess("perfil do shell", { uid: me.uid, role: me.role });
      const data = me.profile || {};
      const label = data?.nome || currentUser.email || "Usuário";
      whoami.textContent = label;
      whoamiTop.textContent = label;
      setCurrentUserCache({ uid: currentUser.uid, email: currentUser.email || "", nome: data?.nome || "", role: me.role || data?.role || role || "" });
    } catch {
      const label = currentUser.email || "Usuário";
      whoami.textContent = label;
      whoamiTop.textContent = label;
    }
  }
  document.getElementById("btnLogout").addEventListener("click", async () => { clearCurrentUserCache(); clearActiveScope(); await signOut(auth); window.location.href = "/index.html"; });
  setupNotificationToggle();
  await hydrateNotifications(role, currentUser);
  if ((role === "admin" || role === "coordinator") && currentUser) await hydrateLeaderSelectors(role, currentUser.uid);
  return document.getElementById("pageContent");
}

function setupNotificationToggle() {
  const btn = document.getElementById("notifBtn");
  const menu = document.getElementById("notifMenu");
  if (!btn || !menu) return;
  btn.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("open"); });
  document.addEventListener("click", () => menu.classList.remove("open"));
  menu.addEventListener("click", (e) => e.stopPropagation());
}

async function hydrateNotifications(role, currentUser) {
  const countEl = document.getElementById("notifCount");
  const listEl = document.getElementById("notifList");
  if (!countEl || !listEl || !currentUser) return;
  try {
    const scope = getActiveScope(role, currentUser);
    let notes = await loadScopedTasks(role, currentUser, { scope, limit: 20 });
    notes = notes.filter((x) => !["submitted", "cancelled"].includes(String(x.status || "").toLowerCase())).sort((a,b)=>String(a.dueDate||"").localeCompare(String(b.dueDate||""))).slice(0,6);
    countEl.textContent = String(notes.length || 0);
    if (!notes.length) { listEl.innerHTML = `<div class="notif-empty">Nenhuma atualização por enquanto.</div>`; return; }
    listEl.innerHTML = notes.map((task) => {
      const days = dueInDays(task);
      let text = `${taskTypeLabel(task.taskType)} • ${task.evaluatedName || "Colaborador"}`;
      if (days == null) {} else if (days < 0) text += ` • atraso de ${Math.abs(days)} dia(s)`; else if (days === 0) text += ` • vence hoje`; else if (days <= 7) text += ` • vence em ${days} dia(s)`; else text += ` • prazo ${formatDateBR(task.dueDate)}`;
      return `<div class="notif-item"><div>${text}</div><div class="notif-time">${formatDateBR(task.dueDate)}</div></div>`;
    }).join("");
  } catch {
    countEl.textContent = "0";
    listEl.innerHTML = `<div class="notif-empty">Nenhuma atualização por enquanto.</div>`;
  }
}

async function hydrateLeaderSelectors(role, currentUid) {
  const cSel = document.getElementById("coordinatorSelect");
  const mSel = document.getElementById("managerSelect");
  if (!mSel) return;
  try {
    const leaders = await loadVisibleLeaders(role, { uid: currentUid });
    const coordinators = leaders.filter((x) => x.role === "coordinator").sort((a,b)=>(a.nome||"").localeCompare(b.nome||"", "pt-BR"));
    const managers = leaders.filter((x) => x.role === "manager").sort((a,b)=>(a.nome||"").localeCompare(b.nome||"", "pt-BR"));
    if (cSel) {
      cSel.innerHTML = `<option value="">Todos</option>`;
      coordinators.forEach((c)=>{ const opt=document.createElement("option"); opt.value=c.id; opt.textContent=c.nome||c.email||"Coordenador"; cSel.appendChild(opt); });
      if (getActiveCoordinatorUid()) cSel.value = getActiveCoordinatorUid();
    }
    function refillManagers() {
      const selectedCoord = role === "admin" ? (cSel?.value || "") : currentUid;
      const subset = selectedCoord ? managers.filter((m)=>(m.coordinatorUid||"")===selectedCoord) : managers;
      mSel.innerHTML = `<option value="">Todos</option>`;
      subset.forEach((m)=>{ const opt=document.createElement("option"); opt.value=m.id; opt.textContent=m.nome||m.email||"Gestor"; mSel.appendChild(opt); });
      const activeManager = getActiveManagerUid();
      if (activeManager && subset.some((x)=>x.id===activeManager)) mSel.value = activeManager;
    }
    refillManagers();
    cSel?.addEventListener("change", () => { setActiveCoordinatorUid(cSel.value || ""); setActiveManagerUid(""); refillManagers(); window.location.reload(); });
    mSel.addEventListener("change", () => { if (role === "coordinator") setActiveCoordinatorUid(currentUid); setActiveManagerUid(mSel.value || ""); window.location.reload(); });
  } catch {
    if (cSel) cSel.innerHTML = `<option value="">Todos</option>`;
    mSel.innerHTML = `<option value="">Todos</option>`;
  }
}

function injectShellCSS() {
  const css = `.shell{display:flex;min-height:100vh;background:#f6f7f9;color:#111;font-family:Arial,sans-serif}.sidebar{width:280px;background:linear-gradient(180deg,#0b0f1a,#0a0d14);color:#fff;padding:18px;display:flex;flex-direction:column;gap:14px}.brand{display:flex;flex-direction:column;gap:10px}.brand-logo{width:190px;height:auto;display:block}.brand-sub{font-size:11px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;font-weight:900}.whoami{padding:10px 10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.04)}.roleTag{font-size:11px;opacity:.8;margin-bottom:6px;font-weight:900;letter-spacing:.08em}.who{font-size:13px;opacity:.95;word-break:break-word;font-weight:800}.who-sub{font-size:12px;opacity:.8;margin-top:4px}.nav{display:flex;flex-direction:column;gap:8px;margin-top:6px}.nav-item{padding:12px;border-radius:14px;color:#cfd6e6;text-decoration:none;border:1px solid transparent;font-weight:900}.nav-item:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.08)}.nav-item.active{background:rgba(245,196,0,.16);border-color:rgba(245,196,0,.34);color:#fff}.nav-section{margin-top:10px;font-size:12px;opacity:.7;padding:6px 10px;font-weight:900;letter-spacing:.06em}.btn-logout{margin-top:auto;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-weight:950}.main{flex:1;display:flex;flex-direction:column}.topbar{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:#fff;border-bottom:1px solid #e5e7eb;position:relative}.pageTitle{font-size:22px;font-weight:900}.topbar-right{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.scope-stack{display:flex;gap:10px;flex-wrap:wrap}.pill{display:flex;gap:10px;align-items:center;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:999px;padding:10px 12px}.pill-label{font-size:12px;color:#6b7280;font-weight:700}.pill-value{font-size:12px;font-weight:700;color:#111;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pill-select{border:none;background:transparent;font-size:13px;outline:none;font-weight:800;min-width:180px}.notif-btn{position:relative;border:1px solid #e5e7eb;background:#f3f4f6;border-radius:999px;padding:10px 14px;cursor:pointer;font-size:16px}.notif-count{position:absolute;top:-6px;right:-4px;background:#dc2626;color:#fff;border-radius:999px;font-size:11px;font-weight:900;line-height:1;padding:4px 6px;min-width:18px;text-align:center}.notif-menu{display:none;position:absolute;right:22px;top:76px;width:320px;background:#fff;border:1px solid #d1d5db;border-radius:16px;box-shadow:0 18px 40px rgba(0,0,0,.12);padding:12px;z-index:20}.notif-menu.open{display:block}.notif-title{font-weight:900;margin-bottom:10px}.notif-empty{color:#6b7280;font-size:13px;padding:8px 2px}.notif-item{padding:10px 8px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;margin-bottom:8px;font-size:13px}.notif-time{font-size:11px;color:#6b7280;margin-top:5px}.page{padding:22px}@media (max-width:1100px){.sidebar{width:240px}.topbar{flex-direction:column;align-items:flex-start;gap:14px}.topbar-right{width:100%}}@media (max-width:860px){.shell{flex-direction:column}.sidebar{width:100%}.notif-menu{right:12px;top:128px;width:min(92vw,320px)}}`;
  let tag = document.getElementById("dmuller-shell-css");
  if (!tag) { tag = document.createElement("style"); tag.id = "dmuller-shell-css"; document.head.appendChild(tag); }
  tag.textContent = css;
}

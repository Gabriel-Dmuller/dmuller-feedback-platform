
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { requireRole } from "/js/auth-guard.js";
import { loadTemplateForTaskType, taskTypeLabel } from "/js/review-core.js";
import { apiGet, apiPost, logBackendSuccess, logFirestoreFallback, shouldUseFirestoreFallback } from "/js/api-client.js";

await requireRole(["admin", "manager", "coordinator", "employee"]);

const subHeader = document.getElementById("subHeader");
const statusPill = document.getElementById("statusPill");
const typePill = document.getElementById("typePill");
const employeeViewEl = document.getElementById("employeeView");
const employeeSubEl = document.getElementById("employeeSub");
const managerViewEl = document.getElementById("managerView");
const managerSubEl = document.getElementById("managerSub");
const periodEl = document.getElementById("period");
const createdAtEl = document.getElementById("createdAt");
const managerCommentEl = document.getElementById("managerComment");
const summaryCard = document.getElementById("summaryCard");
const sectionsRoot = document.getElementById("sectionsRoot");
const employeeCard = document.getElementById("employeeCard");
const ackPill = document.getElementById("ackPill");
const employeeComment = document.getElementById("employeeComment");
const btnAcknowledge = document.getElementById("btnAcknowledge");

const TYPE_LABELS = { experience_45: "45 dias de experiência", experience_90: "90 dias de experiência", semiannual: "Semestral", annual: "Anual", requested: "Solicitada" };

function qs(name) { return new URLSearchParams(location.search).get(name); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function fmtDate(ts) { try { const d = ts?.toDate ? ts.toDate() : new Date(ts); return isNaN(d.getTime()) ? "-" : d.toLocaleString("pt-BR"); } catch { return "-"; } }
function fmtDateOnly(v) { if (!v) return "-"; const s = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; } return s; }
function typeLabel(tipo) { return taskTypeLabel(tipo); }
function normalizeAck(raw) { const st = String(raw || "pending").toLowerCase(); return st === "done" || st === "acknowledged" ? "acknowledged" : "pending"; }
function ackLabel(raw) { return normalizeAck(raw) === "acknowledged" ? "Confirmada" : "Pendente"; }
function setPill(el, status) { const st = normalizeAck(status); el.className = `pill ${st === "acknowledged" ? "ack" : "pending"}`; el.textContent = ackLabel(st); }
function scoreLabel(v) { const n = Number(v || 0); if (n >= 4.5) return `Muito bom (${n})`; if (n >= 3.5) return `Bom (${n})`; if (n >= 2.5) return `Médio (${n})`; if (n >= 1.5) return `Ruim (${n})`; return `Muito ruim (${n})`; }

function normalizeAnswers(data) {
  if (data?.answers?.standard || data?.answers?.experience) return { standard: data.answers.standard || {}, experience: data.answers.experience || {} };
  return { standard: data?.answers || {}, experience: {} };
}

function renderSummary(data) {
  summaryCard.innerHTML = `
    <div class="summary-grid">
      <div class="kpi"><div class="k">Nota final</div><div class="v">${Number(data.score?.average || 0).toFixed(2)} / 5</div><div class="m">${esc(data.score?.label || "-")}</div></div>
      <div class="kpi"><div class="k">Tipo</div><div class="v" style="font-size:18px;">${esc(typeLabel(data.taskType))}</div><div class="m">${esc(fmtDateOnly(data.referenceDate))}</div></div>
      <div class="kpi"><div class="k">Prazo</div><div class="v" style="font-size:18px;">${esc(fmtDateOnly(data.dueDate))}</div><div class="m">Envio ${esc(fmtDate(data.submittedAt || data.createdAt))}</div></div>
      <div class="kpi"><div class="k">Confirmação</div><div class="v" style="font-size:18px;">${esc(ackLabel(data.acknowledgment?.status))}</div><div class="m">${data.acknowledgment?.at ? esc(fmtDate(data.acknowledgment.at)) : "Aguardando retorno"}</div></div>
    </div>
    ${data.experienceAnalysis ? `<div class="highlight-banner"><div><div class="highlight-title">Análise de experiência</div><div class="highlight-value">Decisão: ${esc({ effectivate: "Efetivar", extend: "Prorrogar", dismiss: "Desligar" }[data.experienceAnalysis.decision] || "-")}</div></div><div class="highlight-value">${data.experienceAnalysis.extensionUntil ? `Prorrogação até ${esc(fmtDateOnly(data.experienceAnalysis.extensionUntil))}` : ""}</div></div>` : ``}
  `;
}

function renderComments(data) {
  const feedback = data.feedback || {};
  const parts = [];
  if (feedback.strengths) parts.push(`Pontos fortes:
${feedback.strengths}`);
  if (feedback.weaknesses) parts.push(`Pontos de atenção:
${feedback.weaknesses}`);
  if (feedback.improvements) parts.push(`Pontos de melhoria:
${feedback.improvements}`);
  if (feedback.generalComment) parts.push(`Comentário geral:
${feedback.generalComment}`);
  if (data.experienceAnalysis?.justification) parts.push(`Justificativa da experiência:
${data.experienceAnalysis.justification}`);
  managerCommentEl.textContent = parts.length ? parts.join("\n\n") : "-";
}

async function renderSections(data) {
  const template = await loadTemplateForTaskType(data.taskType);
  const answers = normalizeAnswers(data);
  const sections = [];
  for (const section of template.standardSections) {
    sections.push({ title: section.title, items: section.questions.map(q => ({ label: q.text, value: Number(answers.standard[q.id] || 0) })) });
  }
  if (template.experience.enabled) {
    sections.push({ title: "Avaliação de experiência", items: template.experience.questions.map(q => ({ label: q.text, value: Number(answers.experience[q.id] || 0) })) });
  }

  sectionsRoot.innerHTML = sections.map((section, idx) => `
    <section class="sec-card">
      <div class="sec-head">
        <div>
          <div class="sec-title">${esc(section.title)}</div>
          <div class="sec-meta"><span class="pill score-pill">${section.items.length} item(ns)</span></div>
        </div>
        <div class="sec-actions"><button type="button" data-toggle="sec_${idx}">Ver detalhes</button></div>
      </div>
      <div id="sec_${idx}" class="sec-body">
        ${section.items.map(item => `<div class="q-row"><div class="q-text">${esc(item.label)}</div><div class="q-score"><span class="pill score-pill">${esc(scoreLabel(item.value))}</span></div></div>`).join("")}
      </div>
    </section>
  `).join("");

  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const body = document.getElementById(btn.dataset.toggle);
      const open = body.classList.toggle("open");
      btn.textContent = open ? "Ocultar detalhes" : "Ver detalhes";
    });
  });
}

function setupAckUI(currentUser, ref, data) {
  const isEmployee = currentUser && data.evaluatedUid && currentUser.uid === data.evaluatedUid;
  employeeCard.style.display = isEmployee ? "block" : "none";
  if (!isEmployee) return;
  const st = normalizeAck(data.acknowledgment?.status);
  setPill(ackPill, st);
  employeeComment.value = data.acknowledgment?.comment || "";
  const already = st === "acknowledged";
  btnAcknowledge.disabled = already;
  btnAcknowledge.textContent = already ? "Avaliação já confirmada" : "Confirmar recebimento";
  btnAcknowledge.addEventListener("click", async () => {
    if (btnAcknowledge.disabled) return;
    btnAcknowledge.disabled = true;
    try {
      try {
        await apiPost(`/api/reviews/${encodeURIComponent(data.id)}/acknowledge`, { comment: employeeComment.value.trim() });
        logBackendSuccess("confirmação de avaliação", { reviewId: data.id });
      } catch (apiError) {
        if (shouldUseFirestoreFallback(apiError)) {
          throw new Error("Backend indisponível para confirmação de avaliação.");
        }
        throw apiError;
      }
      setPill(ackPill, "acknowledged");
      btnAcknowledge.textContent = "Avaliação confirmada";
    } catch (error) {
      console.error(error);
      btnAcknowledge.disabled = false;
    }
  });
}

const docId = qs("id");
if (!docId) throw new Error("missing id");
const ref = doc(db, "performance_reviews", docId);
let data;
try {
  data = await apiGet(`/api/reviews/${encodeURIComponent(docId)}`);
  logBackendSuccess("leitura de avaliação por ID", { reviewId: docId });
} catch (apiError) {
  if (!shouldUseFirestoreFallback(apiError)) throw apiError;
  logFirestoreFallback("leitura de avaliação por ID", apiError);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("review not found");
  data = { id: snap.id, ...snap.data() };
}
const currentUser = auth.currentUser;

subHeader.textContent = `Avaliação registrada em ${fmtDate(data.submittedAt || data.createdAt)}`;
statusPill.textContent = normalizeAck(data.acknowledgment?.status) === "acknowledged" ? "Concluída" : "Pendente de confirmação";
statusPill.className = `pill ${normalizeAck(data.acknowledgment?.status) === "acknowledged" ? "ack" : "pending"}`;
typePill.textContent = typeLabel(data.taskType);
employeeViewEl.textContent = data.evaluatedName || "-";
employeeSubEl.textContent = data.evaluatedRole || "FuncionÃ¡rio";
managerViewEl.textContent = data.evaluatorName || "-";
managerSubEl.textContent = data.evaluatorRole || "Gestor";
periodEl.textContent = fmtDateOnly(data.referenceDate);
createdAtEl.textContent = fmtDate(data.submittedAt || data.createdAt);
renderSummary(data);
renderComments(data);
await renderSections(data);
setupAckUI(currentUser, ref, data);

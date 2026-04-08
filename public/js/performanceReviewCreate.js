
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "/js/firebase.js";
import { requireRole } from "/js/auth-guard.js";
import { taskTypeLabel, formatDateBR, loadTemplateForTaskType, flattenStandardQuestions } from "/js/review-core.js";
import { apiGet, apiPost, logBackendSuccess, logFirestoreFallback, shouldUseFirestoreFallback } from "/js/api-client.js";

const { role, user } = await requireRole(["manager", "admin"]);
const params = new URLSearchParams(location.search);
const taskId = params.get("taskId") || params.get("id") || "";
const msg = document.getElementById("msg");
const formRoot = document.getElementById("formRoot");
const btnSubmit = document.getElementById("btnSubmit");
const contextEmployee = document.getElementById("contextEmployee");
const contextType = document.getElementById("contextType");
const contextPeriod = document.getElementById("contextPeriod");
const contextDue = document.getElementById("contextDue");

function setError(text) { msg.className = "msg bad"; msg.textContent = text; }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, (m)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }

if (!taskId) {
  formRoot.innerHTML = `<div class="card">Não foi possível localizar a avaliação.</div>`;
  btnSubmit.disabled = true;
  throw new Error("task missing");
}

let task;
try {
  task = await apiGet(`/api/reviews/tasks/${encodeURIComponent(taskId)}`);
  logBackendSuccess("leitura da task de avaliação", { taskId });
} catch (apiError) {
  if (!shouldUseFirestoreFallback(apiError)) throw apiError;
  logFirestoreFallback("leitura da task de avaliação", apiError);
  const taskSnap = await getDoc(doc(db, "review_tasks", taskId));
if (!taskSnap.exists()) {
  formRoot.innerHTML = `<div class="card">Esta avaliação não está disponível.</div>`;
  btnSubmit.disabled = true;
  throw new Error("task not found");
}

  task = { id: taskSnap.id, ...taskSnap.data() };
}
if (role === "manager" && task.gestorId !== user.uid) {
  formRoot.innerHTML = `<div class="card">Esta avaliação pertence a outro gestor.</div>`;
  btnSubmit.disabled = true;
  throw new Error("task out of manager scope");
}
const template = await loadTemplateForTaskType(task.taskType);
const standardQuestions = flattenStandardQuestions();
const answers = {};

contextEmployee.textContent = task.evaluatedName || "-";
contextType.textContent = taskTypeLabel(task.taskType);
contextPeriod.textContent = formatDateBR(task.referenceDate);
contextDue.textContent = formatDateBR(task.dueDate);
if (role === "admin") btnSubmit.style.display = "none";

function scaleOptions(name) {
  return `<div class="opts">${template.scale.map(item => `<button type="button" class="opt" data-key="${name}" data-value="${item.value}">${item.label}</button>`).join("")}</div>`;
}

formRoot.innerHTML = `
  <div class="card">
    <h3 class="section-title">Avaliação padrão</h3>
    ${template.standardSections.map(section => `
      <div class="q-block">
        <div class="q-section-title">${section.title}</div>
        ${section.questions.map(question => `
          <div class="q">
            <div class="q-title">${question.text}</div>
            ${scaleOptions(question.id)}
          </div>
        `).join("")}
      </div>
    `).join("")}
  </div>

  ${template.experience.enabled ? `
    <div class="card">
      <h3 class="section-title">Avaliação de experiência</h3>
      ${template.experience.questions.map(question => `
        <div class="q">
          <div class="q-title">${question.text}</div>
          ${scaleOptions(question.id)}
        </div>
      `).join("")}

      <div class="grid2" style="margin-top:12px">
        <div>
          <div class="q-title">Decisão da experiência</div>
          <div class="opts">
            ${template.experience.decisions.map(item => `<button type="button" class="opt" data-key="experienceDecision" data-value="${item.value}">${item.label}</button>`).join("")}
          </div>
        </div>
        <div>
          <div class="q-title">Prorrogação até</div>
          <input type="date" id="extensionUntil">
        </div>
      </div>
      <div style="margin-top:12px">
        <div class="q-title">Justificativa da decisão</div>
        <textarea id="experienceJustification" placeholder="Descreva o motivo da decisão da experiência."></textarea>
      </div>
    </div>
  ` : ``}

  <div class="card">
    <h3 class="section-title">Comentários finais</h3>
    <div class="grid2">
      <div><div class="q-title">Pontos fortes</div><textarea id="strengths"></textarea></div>
      <div><div class="q-title">Pontos de atenção</div><textarea id="weaknesses"></textarea></div>
    </div>
    <div class="grid2" style="margin-top:12px">
      <div><div class="q-title">Pontos de melhoria</div><textarea id="improvements"></textarea></div>
      <div><div class="q-title">Comentário geral</div><textarea id="generalComment"></textarea></div>
    </div>
  </div>
`;

for (const el of document.querySelectorAll(".opt")) {
  el.addEventListener("click", () => {
    const key = el.dataset.key;
    const value = el.dataset.value;
    document.querySelectorAll(`.opt[data-key="${key}"]`).forEach(btn => btn.classList.remove("active"));
    el.classList.add("active");
    answers[key] = value;
  });
}

btnSubmit.addEventListener("click", async () => {
  if (role === "admin") return;
  const missingStandard = standardQuestions.filter(q => !answers[q.id]);
  if (missingStandard.length) return setError("Preencha todas as 28 perguntas padrão antes de enviar.");

  const experienceMissing = template.experience.enabled && template.experience.questions.filter(q => !answers[q.id]);
  if (experienceMissing?.length) return setError("Preencha todas as perguntas da avaliação de experiência.");
  if (template.experience.enabled && !answers.experienceDecision) return setError("Selecione a decisão final da experiência.");

  btnSubmit.disabled = true;
  msg.className = "msg";
  msg.textContent = "Enviando avaliação...";

  try {
    const standardAnswers = Object.fromEntries(standardQuestions.map(q => [q.id, Number(answers[q.id] || 0)]));
    const experienceAnswers = template.experience.enabled
      ? Object.fromEntries(template.experience.questions.map(q => [q.id, Number(answers[q.id] || 0)]))
      : {};
    const feedback = {
      strengths: document.getElementById("strengths").value.trim(),
      weaknesses: document.getElementById("weaknesses").value.trim(),
      improvements: document.getElementById("improvements").value.trim(),
      generalComment: document.getElementById("generalComment").value.trim()
    };
    const experienceAnalysis = template.experience.enabled ? {
      decision: answers.experienceDecision || "",
      justification: document.getElementById("experienceJustification")?.value?.trim() || "",
      extensionUntil: document.getElementById("extensionUntil")?.value || ""
    } : null;
    try {
      const result = await apiPost("/api/reviews/submit", {
        taskId: task.id,
        answers: {
          standard: standardAnswers,
          experience: experienceAnswers
        },
        feedback,
        experienceAnalysis
      });
      logBackendSuccess("submissão de avaliação", { reviewId: result.reviewId || task.id });
      window.location.href = `/performance-review-view.html?id=${encodeURIComponent(result.reviewId || task.id)}`;
      return;
    } catch (apiError) {
      if (shouldUseFirestoreFallback(apiError)) {
        throw new Error("Backend indisponível para submissão de avaliação.");
      }
      throw apiError;
    }
  } catch (error) {
    console.error(error);
    btnSubmit.disabled = false;
    setError("Não foi possível enviar a avaliação agora.");
  }
});

import { collection, doc, getDoc, getDocs, query, where, limit as limitQuery } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "/js/firebase.js";
import { getActiveCoordinatorUid, getActiveManagerUid } from "/js/state.js";
import { EMPLOYEE_MANAGER_FIELD } from "/js/review-core.js";
import { apiGet, logBackendSuccess, logFirestoreFallback, shouldUseFirestoreFallback } from "/js/api-client.js";

export const COORDINATOR_FIELD = "coordinatorUid";

export function dedupeById(items) {
  const map = new Map();
  for (const item of items || []) map.set(item.id, item);
  return [...map.values()];
}

export async function queryByField(collectionName, field, value, options = {}) {
  if (!value) return [];
  const constraints = [where(field, "==", value)];
  if (options.limit) constraints.push(limitQuery(options.limit));
  const snap = await getDocs(query(collection(db, collectionName), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function getActiveScope(role, user, options = {}) {
  const activeManagerUid = getActiveManagerUid();
  const activeCoordinatorUid = getActiveCoordinatorUid();
  const allowAdminAll = options.allowAdminAll !== false;

  if (role === "manager") {
    return { kind: "manager", field: EMPLOYEE_MANAGER_FIELD, uid: user.uid };
  }

  if (role === "coordinator") {
    if (activeManagerUid) return { kind: "manager", field: EMPLOYEE_MANAGER_FIELD, uid: activeManagerUid };
    return { kind: "coordinator", field: COORDINATOR_FIELD, uid: user.uid };
  }

  if (role === "admin") {
    if (activeManagerUid) return { kind: "manager", field: EMPLOYEE_MANAGER_FIELD, uid: activeManagerUid };
    if (activeCoordinatorUid) return { kind: "coordinator", field: COORDINATOR_FIELD, uid: activeCoordinatorUid };
    return allowAdminAll ? { kind: "all", field: "", uid: "" } : null;
  }

  return null;
}

export function getManagerScopeUid(role, user) {
  return role === "manager" ? user.uid : getActiveManagerUid();
}

function scopeParams(scope) {
  const params = new URLSearchParams();
  if (scope?.kind === "manager") params.set("gestorId", scope.uid);
  if (scope?.kind === "coordinator") params.set("coordinatorUid", scope.uid);
  return params;
}

function withLimit(params, options = {}) {
  if (options.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function getScopeLabel(scope, user, roleMap = new Map()) {
  if (!scope) return "";
  if (scope.kind === "all") return "todos os gestores";
  const leader = roleMap.get(scope.uid);
  const label = leader?.nome || leader?.email || (scope.uid === user?.uid ? user.email : "") || (scope.kind === "coordinator" ? "Coordenador sem nome" : "Gestor sem nome");
  if (scope.kind === "coordinator") return `todos os gestores de ${label}`;
  return label;
}

export async function loadVisibleLeaders(role, user) {
  try {
    const result = await apiGet("/api/leaders");
    logBackendSuccess("lideranças visíveis", { count: result?.leaders?.length || 0 });
    return result?.leaders || [];
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    logFirestoreFallback("lideranças visíveis", error);
  }

  if (role === "admin") {
    const snap = await getDocs(collection(db, "roles"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.ativo !== false);
  }

  const ownSnap = user?.uid ? await getDoc(doc(db, "roles", user.uid)) : null;
  const own = ownSnap?.exists() ? [{ id: ownSnap.id, ...ownSnap.data() }] : [];

  if (role === "coordinator") {
    const managersSnap = await getDocs(query(collection(db, "roles"), where("role", "==", "manager"), where("coordinatorUid", "==", user.uid)));
    const managers = managersSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.ativo !== false);
    return dedupeById([...own, ...managers]);
  }

  return own.filter((x) => x.ativo !== false);
}

export async function loadVisibleLeaderMap(role, user) {
  const leaders = await loadVisibleLeaders(role, user);
  return new Map(leaders.map((leader) => [leader.id, leader]));
}

export async function loadScopedCollection(collectionName, role, user, options = {}) {
  const scope = options.scope || getActiveScope(role, user, options);
  if (!scope) return [];
  if (scope.kind === "all") {
    const ref = options.limit
      ? query(collection(db, collectionName), limitQuery(options.limit))
      : collection(db, collectionName);
    const snap = await getDocs(ref);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return queryByField(collectionName, scope.field, scope.uid, options);
}

export async function loadScopedEmployees(role, user, options = {}) {
  const scope = options.scope || getActiveScope(role, user, options);
  try {
    const result = await apiGet(`/api/employees${withLimit(scopeParams(scope), options)}`);
    logBackendSuccess("funcionários por escopo", { count: result?.employees?.length || 0, scope });
    return (result?.employees || [])
      .filter((x) => x.ativo !== false && (options.includeNonEmployee || (x.role || "employee") === "employee"))
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    logFirestoreFallback("funcionários por escopo", error);
  }

  const items = await loadScopedCollection("employees", role, user, options);
  return items
    .filter((x) => x.ativo !== false && (options.includeNonEmployee || (x.role || "employee") === "employee"))
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}

export async function loadScopedTasks(role, user, options = {}) {
  const scope = options.scope || getActiveScope(role, user, options);
  try {
    const result = await apiGet(`/api/reviews/tasks${withLimit(scopeParams(scope), options)}`);
    logBackendSuccess("tarefas por escopo", { count: result?.tasks?.length || 0, scope });
    return result?.tasks || [];
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    logFirestoreFallback("tarefas por escopo", error);
  }
  return loadScopedCollection("review_tasks", role, user, options);
}

export async function loadScopedReviews(role, user, options = {}) {
  const scope = options.scope || getActiveScope(role, user, options);
  try {
    const params = scopeParams(scope);
    if (options.evaluatedUid) params.set("evaluatedUid", options.evaluatedUid);
    const result = await apiGet(`/api/reviews${withLimit(params, options)}`);
    logBackendSuccess("avaliações por escopo", { count: result?.reviews?.length || 0, scope });
    return result?.reviews || [];
  } catch (error) {
    if (!shouldUseFirestoreFallback(error)) throw error;
    logFirestoreFallback("avaliações por escopo", error);
  }
  return loadScopedCollection("performance_reviews", role, user, options);
}

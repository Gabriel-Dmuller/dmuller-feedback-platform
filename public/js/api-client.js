
import { auth, backendBaseUrl } from "/js/firebase.js";

function makeApiError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

async function headers({ json = false, authRequired = true } = {}) {
  const out = json ? { "Content-Type": "application/json" } : {};
  if (!auth.currentUser) {
    if (authRequired) {
      console.error("[API] erro de autenticação: usuário não autenticado para chamada protegida.");
      throw makeApiError("Usuário não autenticado para chamada protegida ao backend.", {
        kind: "auth",
        status: 401,
        fallbackAllowed: false,
      });
    }
    return out;
  }
  try {
    const token = await auth.currentUser.getIdToken();
    if (token) out.Authorization = `Bearer ${token}`;
  } catch (cause) {
    console.error("[API] erro de autenticação: falha ao obter Firebase ID token.", cause);
    throw makeApiError("Não foi possível obter o token Firebase para o backend.", {
      kind: "auth",
      status: 401,
      fallbackAllowed: false,
      cause,
    });
  }
  return out;
}

async function parseErrorBody(res) {
  const text = await res.text().catch(() => "");
  if (!text) return "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function apiRequest(method, path, { body, authRequired = true } = {}) {
  if (!backendBaseUrl) {
    console.warn("[API] backend indisponível: base da API não configurada.");
    throw makeApiError("Backend base URL is not configured.", {
      kind: "not_configured",
      fallbackAllowed: true,
    });
  }
  const url = `${backendBaseUrl}${path}`;
  console.info(`[API] usando backend: ${method} ${path}`);
  const requestHeaders = await headers({ json: body !== undefined, authRequired });
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body || {}),
    });
  } catch (cause) {
    console.warn(`[API] backend indisponível: ${backendBaseUrl}`, cause);
    throw makeApiError(`Backend indisponível em ${backendBaseUrl}.`, {
      kind: "unavailable",
      fallbackAllowed: true,
      cause,
    });
  }
  if (!res.ok) {
    const detail = await parseErrorBody(res);
    if (res.status === 401 || res.status === 403) {
      console.error(`[API] erro de autenticação: backend respondeu ${res.status} em ${path}.`, detail);
    } else {
      console.error(`[API] erro do backend: ${res.status} em ${path}.`, detail);
    }
    throw makeApiError(`Backend respondeu ${res.status} em ${path}.`, {
      kind: "http",
      status: res.status,
      detail,
      fallbackAllowed: false,
    });
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function apiGet(path, options = {}) {
  return apiRequest("GET", path, options);
}

export async function apiPost(path, body, options = {}) {
  return apiRequest("POST", path, { ...options, body });
}

export async function apiPatch(path, body, options = {}) {
  return apiRequest("PATCH", path, { ...options, body });
}

export async function apiDelete(path, options = {}) {
  return apiRequest("DELETE", path, options);
}

export function shouldUseFirestoreFallback(error) {
  return error?.fallbackAllowed === true;
}

export function logBackendSuccess(operation, detail = {}) {
  console.info(`[API] usando backend: ${operation} concluída com sucesso.`, detail);
}

export function logFirestoreFallback(operation, error) {
  console.warn(`[API] fallback ativado: ${operation} usará Firestore porque o backend local não está disponível/configurado.`, {
    kind: error?.kind || "unknown",
    message: error?.message || String(error),
  });
}

export function logLocalFallback(operation, error) {
  console.warn(`[API] fallback ativado: ${operation} usará código local porque o backend local não está disponível/configurado.`, {
    kind: error?.kind || "unknown",
    message: error?.message || String(error),
  });
}

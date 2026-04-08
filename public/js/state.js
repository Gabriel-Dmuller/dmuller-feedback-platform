const KEY_MANAGER = "activeManagerUid";
const KEY_COORDINATOR = "activeCoordinatorUid";
const KEY_SCOPE = "activeScopeType";
const KEY_USER = "currentUserCache";

export function getActiveManagerUid() { return localStorage.getItem(KEY_MANAGER) || ""; }
export function setActiveManagerUid(uid) {
  if (!uid) localStorage.removeItem(KEY_MANAGER);
  else localStorage.setItem(KEY_MANAGER, uid);
}

export function getActiveCoordinatorUid() { return localStorage.getItem(KEY_COORDINATOR) || ""; }
export function setActiveCoordinatorUid(uid) {
  if (!uid) localStorage.removeItem(KEY_COORDINATOR);
  else localStorage.setItem(KEY_COORDINATOR, uid);
}

export function getActiveScopeType() { return localStorage.getItem(KEY_SCOPE) || "manager"; }
export function setActiveScopeType(value) {
  if (!value) localStorage.removeItem(KEY_SCOPE);
  else localStorage.setItem(KEY_SCOPE, value);
}

export function clearActiveScope() {
  localStorage.removeItem(KEY_MANAGER);
  localStorage.removeItem(KEY_COORDINATOR);
  localStorage.removeItem(KEY_SCOPE);
}

export function setCurrentUserCache(data) {
  try { localStorage.setItem(KEY_USER, JSON.stringify(data || {})); } catch {}
}
export function getCurrentUserCache() {
  try { return JSON.parse(localStorage.getItem(KEY_USER) || "{}"); } catch { return {}; }
}
export function clearCurrentUserCache() { localStorage.removeItem(KEY_USER); }

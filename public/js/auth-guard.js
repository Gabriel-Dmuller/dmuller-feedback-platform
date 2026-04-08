import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth } from "./firebase.js";
import { apiGet, logBackendSuccess } from "/js/api-client.js";

function goHomeByAccess(access) {
  if (access === "employee") {
    window.location.href = "/employee.html";
    return;
  }
  if (access === "admin" || access === "manager" || access === "coordinator") {
    window.location.href = "/manager-home.html";
    return;
  }
  window.location.href = "/index.html";
}

export function requireRole(allowedRoles = []) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          window.location.href = "/index.html";
          return;
        }

        const me = await apiGet("/api/me");
        logBackendSuccess("autorização de acesso", { uid: me.uid, role: me.role });
        const roleData = me.profile || {};
        const role = me.role || roleData.role || null;
        if (!role) {
          try { await signOut(auth); } catch {}
          window.location.href = "/index.html?msg=acesso";
          return;
        }

        if (roleData.ativo === false) {
          try { await signOut(auth); } catch {}
          window.location.href = "/index.html?msg=inativo";
          return;
        }

        if (!allowedRoles.includes(role)) {
          goHomeByAccess(role);
          return;
        }
        resolve({ user, role, roleData });
      } catch {
        window.location.href = "/index.html?msg=erro";
      }
    });
  });
}

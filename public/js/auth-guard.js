import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { apiGet, logBackendSuccess, shouldUseFirestoreFallback } from "/js/api-client.js";

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

// Lê role diretamente do Firestore quando backend não está disponível
async function getRoleFromFirestore(uid) {
  try {
    const snap = await getDoc(doc(db, "roles", uid));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return { role: data.role || null, profile: data, uid };
  } catch {
    return null;
  }
}

export function requireRole(allowedRoles = []) {
  return new Promise((resolve) => {
    let settled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      // Previne execução múltipla caso onAuthStateChanged dispare mais de uma vez
      if (settled) return;
      try {
        if (!user) {
          // Aguarda um tick antes de redirecionar para login, pois onAuthStateChanged
          // pode disparar com null antes de restaurar a sessão persistida.
          await new Promise(r => setTimeout(r, 200));
          if (!auth.currentUser) {
            settled = true;
            unsub();
            window.location.href = "/index.html";
          }
          return;
        }

        let role = null;
        let roleData = {};

        // Tenta o backend primeiro
        try {
          const me = await apiGet("/api/me");
          logBackendSuccess("autorização de acesso", { uid: me.uid, role: me.role });
          roleData = me.profile || {};
          role = me.role || roleData.role || null;
        } catch (backendError) {
          // Se o backend não está disponível (cold start, rede, etc), usa Firestore direto
          if (shouldUseFirestoreFallback(backendError)) {
            console.warn("[auth-guard] backend indisponível, usando Firestore para leitura de role.", backendError?.message);
            const fsResult = await getRoleFromFirestore(user.uid);
            if (fsResult) {
              role = fsResult.role;
              roleData = fsResult.profile;
            }
          } else {
            // Erro de autenticação (401/403) ou backend retornou erro real
            // Não redireciona para login - mostra mensagem menos agressiva
            console.error("[auth-guard] erro de backend não recuperável:", backendError?.message);
            // Fallback final: tenta Firestore de qualquer forma para não travar o usuário
            const fsResult = await getRoleFromFirestore(user.uid);
            if (fsResult) {
              role = fsResult.role;
              roleData = fsResult.profile;
              console.warn("[auth-guard] usando Firestore como fallback de emergência após erro de backend.");
            }
          }
        }

        if (!role) {
          settled = true;
          unsub();
          try { await signOut(auth); } catch {}
          window.location.href = "/index.html?msg=acesso";
          return;
        }

        if (roleData.ativo === false) {
          settled = true;
          unsub();
          try { await signOut(auth); } catch {}
          window.location.href = "/index.html?msg=inativo";
          return;
        }

        if (!allowedRoles.includes(role)) {
          settled = true;
          unsub();
          goHomeByAccess(role);
          return;
        }
        settled = true;
        unsub();
        resolve({ user, role, roleData });
      } catch {
        // Último recurso: tenta ler role do Firestore antes de expulsar
        try {
          if (user) {
            const fsResult = await getRoleFromFirestore(user.uid);
            if (fsResult && fsResult.role && allowedRoles.includes(fsResult.role)) {
              settled = true;
              unsub();
              resolve({ user, role: fsResult.role, roleData: fsResult.profile });
              return;
            }
          }
        } catch {}
        settled = true;
        unsub();
        window.location.href = "/index.html?msg=erro";
      }
    });
  });
}

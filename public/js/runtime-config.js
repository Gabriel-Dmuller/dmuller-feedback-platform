const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

if (!window.__DMULLER_API_BASE__ && localHosts.has(window.location.hostname)) {
  window.__DMULLER_API_BASE__ = "http://127.0.0.1:8000";
}

if (window.__DMULLER_USE_FIREBASE_EMULATORS__ === undefined) {
  window.__DMULLER_USE_FIREBASE_EMULATORS__ = window.localStorage?.getItem("DMULLER_USE_FIREBASE_EMULATORS") === "1";
}

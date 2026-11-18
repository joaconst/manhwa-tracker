// ==UserScript==
// @name         ManhwaWeb · Mis lecturas
// @namespace    https://manhwaweb.com/
// @version      1.0.0
// @description  Abre tu dashboard de lecturas con la sesión de ManhwaWeb ya conectada.
// @author       vos
// @match        https://manhwaweb.com/*
// @match        https://www.manhwaweb.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  /* ============================================================
     CONFIGURACIÓN
     Poné acá la URL de tu dashboard en Vercel.
     Si la dejás vacía, el script te la pide la primera vez.
     ============================================================ */
  const DASHBOARD_URL = ""; // ej: "https://mi-biblioteca.vercel.app"

  const LAUNCHER_ID = "mwlib-launcher";
  const TOKEN_KEY = "tokenCommers";
  const API = "https://api.manhwaweb.com";

  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  /* ---------------- storage del gestor ---------------- */

  const cfg = {
    get base() {
      return String(GM_getValue("dashboardUrl", DASHBOARD_URL) || "").replace(/\/+$/, "");
    },
    set base(value) {
      GM_setValue("dashboardUrl", String(value || "").replace(/\/+$/, ""));
    },
    get token() {
      return String(GM_getValue("lastToken", "") || "");
    },
    set token(value) {
      GM_setValue("lastToken", String(value || ""));
    },
    get reading() {
      try {
        return JSON.parse(GM_getValue("lastReading", "null"));
      } catch {
        return null;
      }
    },
    set reading(value) {
      GM_setValue("lastReading", JSON.stringify(value || null));
    },
  };

  /* ---------------- token ---------------- */

  function readTokenFromPage() {
    try {
      const token = pageWindow.localStorage.getItem(TOKEN_KEY);
      if (token && token !== cfg.token) {
        cfg.token = token;
        updateLauncher();
      }
      return token || cfg.token;
    } catch {
      return cfg.token;
    }
  }

  function askForDashboardUrl(force = false) {
    if (cfg.base && !force) return cfg.base;
    const current = cfg.base || "";
    const value = prompt(
      "URL de tu dashboard (Vercel).\nEjemplo: https://mi-biblioteca.vercel.app",
      current
    );
    if (value === null) return "";
    const clean = value.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+/i.test(clean)) {
      alert("La URL tiene que empezar con https://");
      return "";
    }
    cfg.base = clean;
    return clean;
  }

  function openDashboard() {
    const base = askForDashboardUrl();
    if (!base) return;

    const token = readTokenFromPage();
    if (!token) {
      alert(
        "No encontré tu sesión de ManhwaWeb.\n\n" +
          "Iniciá sesión en la página y volvé a intentar."
      );
      return;
    }

    const url = `${base}/#token=${encodeURIComponent(token)}`;
    if (typeof GM_openInTab === "function") {
      GM_openInTab(url, { active: true, insert: true, setParent: true });
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  /* ---------------- detección del lector ---------------- */

  let lastCheckedPath = "";

  function trackReading() {
    const path = location.pathname;
    const match = path.match(/^\/(leer|leer_18)\/(.+)$/);
    if (!match) return;

    const routeId = decodeURIComponent(match[2]);
    if (!routeId || lastCheckedPath === path) return;
    lastCheckedPath = path;

    fetch(`${API}/chapters/see/${encodeURIComponent(routeId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?._id) return;
        cfg.reading = {
          id: data._id,
          title: data.name || "",
          chapter: Number(data.chapter?.chapter) || 0,
          at: Date.now(),
        };
        updateLauncher();
      })
      .catch(() => {
        /* sin drama: el dashboard igual sincroniza por polling */
      });
  }

  /* ---------------- botón flotante ---------------- */

  const ICON = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 5.5h5.5A2.5 2.5 0 0 1 12 8v11a2 2 0 0 0-2-2H4z"/>
    <path d="M20 5.5h-5.5A2.5 2.5 0 0 0 12 8v11a2 2 0 0 1 2-2h6z"/>
  </svg>`;

  function mountLauncher() {
    if (!document.body || document.getElementById(LAUNCHER_ID)) return;

    const btn = document.createElement("button");
    btn.id = LAUNCHER_ID;
    btn.type = "button";
    btn.innerHTML = `${ICON}<span>Mis lecturas</span>`;
    btn.addEventListener("click", openDashboard);
    document.body.appendChild(btn);

    const style = document.createElement("style");
    style.textContent = `
      #${LAUNCHER_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483000;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 15px 10px 12px;
        border-radius: 999px;
        border: 1px solid rgba(167, 139, 250, .45);
        background: rgba(14, 11, 22, .92);
        color: #e9e3ff;
        font: 600 13px/1 "Inter", system-ui, -apple-system, sans-serif;
        letter-spacing: -.01em;
        cursor: pointer;
        backdrop-filter: blur(10px);
        box-shadow: 0 12px 30px -10px rgba(0, 0, 0, .8), inset 0 1px 0 rgba(255, 255, 255, .12);
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
      }
      #${LAUNCHER_ID}:hover {
        transform: translateY(-2px);
        border-color: rgba(196, 181, 253, .85);
        background: rgba(24, 18, 38, .96);
        box-shadow: 0 18px 40px -12px rgba(124, 58, 237, .7), inset 0 1px 0 rgba(255, 255, 255, .16);
      }
      #${LAUNCHER_ID} svg { color: #a78bfa; }
      #${LAUNCHER_ID} span { white-space: nowrap; }
      @media (max-width: 640px) { #${LAUNCHER_ID} span { display: none; } #${LAUNCHER_ID} { padding: 11px; } }
    `;
    document.head.appendChild(style);

    updateLauncher();
  }

  function updateLauncher() {
    const btn = document.getElementById(LAUNCHER_ID);
    if (!btn) return;
    const reading = cfg.reading;
    const token = cfg.token;
    let title = "Abrir Mis lecturas";
    if (!token) title = "Iniciá sesión en ManhwaWeb para conectar";
    else if (reading?.chapter) title = `${reading.title} · Capítulo ${reading.chapter}`;
    btn.title = `${title}\nClic para abrir el dashboard`;
  }

  /* ---------------- menú de Violentmonkey ---------------- */

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("Abrir Mis lecturas", openDashboard);
    GM_registerMenuCommand("Configurar URL del dashboard", () => {
      if (askForDashboardUrl(true)) alert("URL guardada.");
    });
    GM_registerMenuCommand("Copiar token de sesión", () => {
      const token = readTokenFromPage();
      if (!token) return alert("No hay sesión activa en ManhwaWeb.");
      if (typeof GM_setClipboard === "function") GM_setClipboard(token, "text");
      else navigator.clipboard?.writeText(token);
      alert("Token copiado. Pegalo en el dashboard para conectar este navegador.");
    });
    GM_registerMenuCommand("Olvidar token guardado", () => {
      cfg.token = "";
      cfg.reading = null;
      updateLauncher();
      alert("Listo, se borró el token guardado por el script.");
    });
  }

  /* ---------------- ciclo de vida ---------------- */

  function tick() {
    mountLauncher();
    readTokenFromPage();
    trackReading();
    updateLauncher();
  }

  function start() {
    registerMenu();
    tick();
    // La web es una SPA: el path cambia sin recargar.
    setInterval(tick, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

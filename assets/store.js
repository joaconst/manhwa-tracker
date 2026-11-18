/**
 * Persistencia local. Todo vive en el localStorage de este navegador.
 */

const NS = "mwlib";
const K = {
  token: `${NS}.token`,
  user: `${NS}.user`,
  snapshot: `${NS}.snapshot`,
  details: `${NS}.details`,
  history: `${NS}.history`,
  notes: `${NS}.notes`,
  seen: `${NS}.seen`,
  prefs: `${NS}.prefs`,
};

const DETAIL_TTL = 1000 * 60 * 60 * 24 * 7; // 7 días
const MAX_DETAILS = 400;
const MAX_HISTORY = 1500;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    // Cuota llena: limpiamos la caché de detalles y reintentamos una vez.
    if (key !== K.details) {
      try {
        localStorage.removeItem(K.details);
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        console.warn("No se pudo guardar en localStorage:", err);
      }
    }
    return false;
  }
}

/* ---------------- token ---------------- */

export const getToken = () => {
  try {
    const raw = localStorage.getItem(K.token);
    if (!raw) return "";
    // Acepta tanto el valor plano como un JSON string (versiones previas).
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : raw;
    } catch {
      return raw;
    }
  } catch {
    return "";
  }
};

export const setToken = (token) => {
  try {
    localStorage.setItem(K.token, String(token || ""));
    return true;
  } catch {
    return false;
  }
};
export const clearToken = () => {
  try {
    localStorage.removeItem(K.token);
  } catch {
    /* noop */
  }
};

export const getUser = () => read(K.user, null);
export const setUser = (user) => write(K.user, user);

/* ---------------- snapshot de biblioteca ---------------- */

export function loadSnapshot() {
  const snap = read(K.snapshot, null);
  if (!snap || typeof snap !== "object") return null;
  return {
    leyendo: Array.isArray(snap.leyendo) ? snap.leyendo : [],
    planeado: Array.isArray(snap.planeado) ? snap.planeado : [],
    finalizado: Array.isArray(snap.finalizado) ? snap.finalizado : [],
    savedAt: Number(snap.savedAt) || 0,
  };
}

export function saveSnapshot(data) {
  return write(K.snapshot, {
    leyendo: data.leyendo || [],
    planeado: data.planeado || [],
    finalizado: data.finalizado || [],
    savedAt: Date.now(),
  });
}

/* ---------------- detalles enriquecidos ---------------- */

export function loadDetails() {
  const map = read(K.details, {});
  return map && typeof map === "object" ? map : {};
}

export function getCachedDetail(map, id, { allowStale = false } = {}) {
  const item = map[id];
  if (!item) return null;
  if (allowStale) return item;
  if (Date.now() - (item.fetchedAt || 0) > DETAIL_TTL) return null;
  return item;
}

export function saveDetails(map) {
  const entries = Object.entries(map);
  if (entries.length > MAX_DETAILS) {
    entries.sort((a, b) => (b[1].fetchedAt || 0) - (a[1].fetchedAt || 0));
    map = Object.fromEntries(entries.slice(0, MAX_DETAILS));
  }
  return write(K.details, map);
}

/* ---------------- historial ---------------- */

export function loadHistory() {
  const list = read(K.history, []);
  return Array.isArray(list) ? list : [];
}

export function pushHistory(entries) {
  if (!entries.length) return loadHistory();
  const list = loadHistory();
  const known = new Set(list.map((e) => `${e.id}:${e.chapter}`));
  const fresh = entries.filter((e) => !known.has(`${e.id}:${e.chapter}`));
  if (!fresh.length) return list;
  const next = [...fresh, ...list].slice(0, MAX_HISTORY);
  write(K.history, next);
  return next;
}

/* ---------------- notas ---------------- */

export function loadNotes() {
  const map = read(K.notes, {});
  return map && typeof map === "object" ? map : {};
}

export function saveNote(id, text) {
  const map = loadNotes();
  const clean = String(text || "").trim();
  if (clean) map[id] = clean;
  else delete map[id];
  write(K.notes, map);
  return map;
}

/* ---------------- capítulos vistos (badge de nuevos) ---------------- */

export function loadSeen() {
  const map = read(K.seen, {});
  return map && typeof map === "object" ? map : {};
}

export function saveSeen(map) {
  return write(K.seen, map && typeof map === "object" ? map : {});
}

export function markSeen(id, total) {
  const map = loadSeen();
  map[id] = Number(total) || 0;
  write(K.seen, map);
  return map;
}

/* ---------------- preferencias ---------------- */

export const DEFAULT_PREFS = {
  tab: "leyendo",
  view: "grid",
  filters: {
    leyendo: { sort: "recent", genre: "all" },
    planeado: { sort: "recent", genre: "all" },
    finalizado: { sort: "recent", genre: "all" },
  },
};

export function loadPrefs() {
  const saved = read(K.prefs, {});
  const safe = saved && typeof saved === "object" ? saved : {};
  return {
    ...DEFAULT_PREFS,
    ...safe,
    filters: {
      leyendo: { ...DEFAULT_PREFS.filters.leyendo, ...(safe.filters?.leyendo || {}) },
      planeado: { ...DEFAULT_PREFS.filters.planeado, ...(safe.filters?.planeado || {}) },
      finalizado: { ...DEFAULT_PREFS.filters.finalizado, ...(safe.filters?.finalizado || {}) },
    },
  };
}

export function savePrefs(prefs) {
  return write(K.prefs, prefs);
}

/* ---------------- export ---------------- */

export function exportAll(data) {
  return {
    exportado: new Date().toISOString(),
    origen: "manhwaweb.com",
    usuario: getUser(),
    biblioteca: data,
    notas: loadNotes(),
    historial: loadHistory(),
  };
}

/**
 * Mi Biblioteca · ManhwaWeb
 * Orquestación: conexión, sincronización, polling y render.
 */

import * as api from "./api.js";
import * as store from "./store.js";
import * as ui from "./ui.js";
import { streak as calcStreak } from "./charts.js";

const TAB_KEYS = ["leyendo", "planeado", "finalizado"];
const POLL_MS = 15000;
const DETAIL_FRESH = 1000 * 60 * 60 * 12;

const snapshot = store.loadSnapshot();

const state = {
  token: store.getToken(),
  user: store.getUser(),
  data: snapshot || { leyendo: [], planeado: [], finalizado: [], savedAt: 0 },
  details: store.loadDetails(),
  history: store.loadHistory(),
  notes: store.loadNotes(),
  seen: store.loadSeen(),
  prefs: store.loadPrefs(),
  current: store.loadCurrent(),
  loading: !snapshot,
  syncing: false,
  enriching: false,
  error: null,
  lastSync: snapshot?.savedAt || 0,
  query: "",
};

const el = {
  connect: ui.$("#view-connect"),
  dash: ui.$("#view-dash"),
  connectForm: ui.$("#connect-form"),
  tokenInput: ui.$("#token-input"),
  connectError: ui.$("#connect-error"),
  menu: ui.$("#menu"),
  menuUser: ui.$("#menu-user"),
  search: ui.$("#search"),
  searchCount: ui.$("#search-count"),
  sync: ui.$("#sync-status"),
  syncText: ui.$("#sync-text"),
  refresh: ui.$("#btn-refresh"),
  hero: ui.$("#hero-slot"),
  stats: ui.$("#stats"),
  tabs: ui.$("#tabs"),
  title: ui.$("#section-title"),
  grid: ui.$("#grid"),
  empty: ui.$("#empty"),
  genre: ui.$("#filter-genre"),
  sort: ui.$("#sort"),
  viewToggle: ui.$("#view-toggle"),
  footSync: ui.$("#foot-sync"),
};

/* ------------------------------------------------------------------ */
/* arranque                                                           */
/* ------------------------------------------------------------------ */

function readIncomingToken() {
  const fromHash = location.hash.match(/[#&]token=([^&]+)/);
  if (fromHash) return decodeURIComponent(fromHash[1]);
  const fromQuery = new URLSearchParams(location.search).get("token");
  return fromQuery ? fromQuery : "";
}

function stripTokenFromUrl() {
  try {
    const url = new URL(location.href);
    url.hash = "";
    url.searchParams.delete("token");
    history.replaceState(null, "", url.pathname + url.search);
  } catch {
    try {
      history.replaceState(null, "", location.pathname);
    } catch {
      /* si el navegador no lo permite, el token igual queda guardado */
    }
  }
}

async function boot() {
  const incoming = readIncomingToken();
  if (incoming) {
    state.token = incoming;
    if (!store.setToken(incoming)) {
      ui.toast("No se pudo guardar el token", "Revisá el almacenamiento del navegador.", "error");
    }
    stripTokenFromUrl();
  }

  const tab = (location.hash.match(/^#\/(leyendo|planeado|finalizado)$/) || [])[1];
  if (tab) state.prefs.tab = tab;

  bindStatic();

  if (!state.token) {
    showConnect();
    return;
  }

  showDash();
  mergeDetails();
  if (state.loading) {
    ui.renderSkeletons(el.grid, 12);
    paintShell();
  } else {
    paintAll({ enter: true });
  }
  paintSync();

  try {
    await validateToken();
    await sync({ silent: true });
  } catch (err) {
    if (err?.kind === "auth") {
      handleAuthError(err);
    } else {
      state.error = err;
      state.loading = false;
      paintShell();
      paintGrid();
      paintSync();
      ui.toast("No se pudo sincronizar", err?.message || "Revisá tu conexión.", "error");
    }
  }
}

async function validateToken() {
  const user = await api.getUser(state.token);
  state.user = user;
  store.setUser(user);
  el.menuUser.textContent = user.nick ? `@${user.nick}` : "tu cuenta";
}

function handleAuthError(err) {
  state.error = err;
  store.clearToken();
  state.token = "";
  showConnect(err?.message || "Tu sesión expiró. Volvé a conectar tu token.");
}

function showConnect(message = "") {
  el.connect.hidden = false;
  el.dash.hidden = true;
  el.connectError.textContent = message;
  setTimeout(() => el.tokenInput?.focus(), 60);
}

function showDash() {
  el.connect.hidden = true;
  el.dash.hidden = false;
  if (state.user?.nick) el.menuUser.textContent = `@${state.user.nick}`;
}

/* ------------------------------------------------------------------ */
/* sincronización                                                     */
/* ------------------------------------------------------------------ */

async function sync({ silent = false } = {}) {
  if (!state.token || state.syncing) return;
  state.syncing = true;
  state.error = null;
  paintSync();

  try {
    const results = await Promise.all(
      TAB_KEYS.map((key) => api.fetchStatus(state.token, api.STATUS[key]))
    );

    const next = { leyendo: results[0], planeado: results[1], finalizado: results[2] };

    if (!state.loading && !silent) {
      ui.toast("Biblioteca actualizada", `${countAll(next)} obras en total.`);
    }

    detectChanges(next);
    baselineSeen(next);
    const firstLoad = state.loading;
    state.data = next;
    state.loading = false;
    state.lastSync = Date.now();
    mergeDetails();
    store.saveSnapshot(state.data);

    paintAll({ enter: firstLoad });
    enrichMissing();

    if (!silent) paintSync();
  } catch (err) {
    state.error = err;
    state.loading = false;
    if (err?.kind === "auth") {
      handleAuthError(err);
      return;
    }
    paintShell();
    paintGrid();
    if (!silent) ui.toast("Error al sincronizar", err?.message || "Intentá de nuevo.", "error");
  } finally {
    state.syncing = false;
    paintSync();
  }
}

function countAll(data) {
  return TAB_KEYS.reduce((sum, key) => sum + (data[key]?.length || 0), 0);
}

function detectChanges(next) {
  const previous = new Map();
  for (const key of TAB_KEYS) {
    for (const item of state.data[key] || []) previous.set(item.id, item);
  }

  const events = [];
  for (const key of TAB_KEYS) {
    for (const item of next[key] || []) {
      const before = previous.get(item.id);
      if (before && item.read > before.read) {
        events.push({ id: item.id, title: item.title, chapter: item.read, total: item.total, at: Date.now() });
      }
    }
  }

  if (events.length) {
    state.history = store.pushHistory(events);
    const latest = events[0];
    state.current = store.saveCurrent(latest.id);
    ui.toast(
      latest.chapter ? `Vas por el capítulo ${latest.chapter}` : "Progreso actualizado",
      latest.title,
      "new"
    );
  }
}

function baselineSeen(next) {
  let changed = false;
  for (const key of TAB_KEYS) {
    for (const item of next[key] || []) {
      if (state.seen[item.id] === undefined) {
        state.seen[item.id] = item.total || 0;
        changed = true;
      }
    }
  }
  if (changed) store.saveSeen(state.seen);
}

function newCounts() {
  const map = {};
  for (const key of TAB_KEYS) {
    for (const item of state.data[key] || []) {
      const seen = state.seen[item.id];
      const diff = (item.total || 0) - (seen ?? item.total ?? 0);
      map[item.id] = diff > 0 ? diff : 0;
    }
  }
  return map;
}

async function enrichMissing() {
  if (state.enriching) return;
  const queue = [];
  for (const key of TAB_KEYS) {
    for (const item of state.data[key] || []) {
      const cached = state.details[item.id];
      const fresh = cached && Date.now() - (cached.fetchedAt || 0) < DETAIL_FRESH;
      if (!fresh) queue.push(item);
    }
  }

  const batch = queue.slice(0, 24);
  if (!batch.length) return;

  state.enriching = true;
  let updated = 0;
  await api.pool(batch, 3, async (item) => {
    try {
      const detail = await api.fetchDetails(item.realId || item.id);
      if (!detail.id) detail.id = item.id;
      state.details[item.id] = detail;
      updated += 1;
    } catch {
      /* una obra rota no debería romper la sincronización */
    }
  });

  state.enriching = false;
  if (updated) {
    store.saveDetails(state.details);
    mergeDetails();
    store.saveSnapshot(state.data);
    paintAll();
  }
}

/** Completa los campos que la lista no trae usando el detalle cacheado. */
function mergeDetails() {
  for (const key of TAB_KEYS) {
    for (const item of state.data[key] || []) {
      const detail = state.details[item.id];
      if (!detail) continue;
      if (!item.genres?.length) item.genres = detail.genres || [];
      if (!item.synopsis) item.synopsis = detail.synopsis || "";
      if (!item.cover) item.cover = detail.cover || "";
      if (!item.total) item.total = detail.total || 0;
      if (!item.alt?.length) item.alt = detail.alt || [];
      if (!item.demographic) item.demographic = detail.demographic || "";
      if (!item.state) item.state = detail.state || "";
      if (!item.updatedAt || item.updatedAt < (detail.lastChapterAt || 0)) {
        item.updatedAt = detail.lastChapterAt || item.updatedAt;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* render                                                            */
/* ------------------------------------------------------------------ */

const tabsCounts = () => ({
  leyendo: state.data.leyendo?.length || 0,
  planeado: state.data.planeado?.length || 0,
  finalizado: state.data.finalizado?.length || 0,
});

function allItems() {
  return TAB_KEYS.flatMap((key) => state.data[key] || []);
}

function findItem(id) {
  return allItems().find((item) => item.id === id) || null;
}

function lastReadMap() {
  const map = new Map();
  for (const entry of state.history) {
    if (!map.has(entry.id)) map.set(entry.id, entry.at);
  }
  return map;
}

function currentReading() {
  const items = state.data.leyendo || [];
  if (!items.length) return null;

  // 1) Lo que elegiste (o el último capítulo que el dashboard te vio leer).
  if (state.current) {
    const pinned = items.find((item) => item.id === state.current.id);
    if (pinned) return pinned;
  }

  // 2) La obra con el cambio de capítulo más reciente detectado.
  const last = lastReadMap();
  const known = items
    .filter((item) => last.get(item.id))
    .sort((a, b) => (last.get(b.id) || 0) - (last.get(a.id) || 0));
  if (known.length) return known[0];

  // 3) Sin señales: la última obra que sumó capítulos.
  return [...items].sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || progressOf(b) - progressOf(a)
  )[0];
}

function setCurrent(id, { repaint = true } = {}) {
  if (!id) return;
  state.current = store.saveCurrent(id);
  if (repaint) paintShell();
}

function switchCurrent() {
  const items = [...(state.data.leyendo || [])];
  if (!items.length) return;

  const last = lastReadMap();
  items.sort(
    (a, b) => (last.get(b.id) || 0) - (last.get(a.id) || 0) || (b.updatedAt || 0) - (a.updatedAt || 0)
  );

  ui.openPicker(
    {
      items,
      currentId: currentReading()?.id || "",
      onPick: (id) => setCurrent(id),
    },
    () => {}
  );
}

const progressOf = (item) => (item.total ? item.read / item.total : 0);

function activeGenres(items) {
  return [...new Set(items.flatMap((item) => item.genres || []))].sort((a, b) => a.localeCompare(b, "es"));
}

function filteredItems() {
  const tab = state.prefs.tab;
  const items = [...(state.data[tab] || [])];
  const query = state.query.trim().toLowerCase();
  const last = lastReadMap();

  let result = items;
  if (query) {
    result = result.filter((item) =>
      [item.title, ...(item.alt || []), ...(item.genres || [])]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }
  const filters = state.prefs.filters[state.prefs.tab] || { sort: "recent", genre: "all" };

  if (filters.genre !== "all") {
    result = result.filter((item) => (item.genres || []).includes(filters.genre));
  }

  switch (filters.sort) {
    case "progress":
      result.sort((a, b) => progressOf(b) - progressOf(a));
      break;
    case "title":
      result.sort((a, b) => a.title.localeCompare(b.title, "es"));
      break;
    case "total":
      result.sort((a, b) => (b.total || 0) - (a.total || 0));
      break;
    default:
      result.sort(
        (a, b) =>
          (last.get(b.id) || 0) - (last.get(a.id) || 0) ||
          (b.updatedAt || 0) - (a.updatedAt || 0) ||
          (b.read || 0) - (a.read || 0)
      );
  }
  return result;
}

function paintAll({ enter = false } = {}) {
  paintShell({ enter });
  paintGrid({ enter });
  paintSync();
}

function paintShell({ enter = false } = {}) {
  const tab = state.prefs.tab;
  ui.renderTabs(el.tabs, tabsCounts(), tab, setTab);

  if (tab === "leyendo") {
    const current = currentReading();
    ui.renderHero(
      el.hero,
      {
        current,
        detail: current ? state.details[current.id] : null,
        lastReadAt: current ? lastReadMap().get(current.id) : 0,
        newCount: current ? newCounts()[current.id] || 0 : 0,
      },
      {
        setTab,
        open: openDetail,
        switchCurrent,
        markReading: (id) => setCurrent(id),
      }
    );
    if (enter) ui.replayEnter(el.hero, "is-entering", 420);
  } else {
    el.hero.innerHTML = "";
    el.hero.classList.remove("is-entering");
  }

  const items = state.data[tab] || [];
  ui.renderStats(el.stats, {
    tab,
    items,
    history: state.history,
    streak: calcStreak(state.history),
  });

  const genres = activeGenres(items);
  el.genre.innerHTML =
    `<option value="all">Todos</option>` +
    genres.map((g) => `<option value="${ui.esc(g)}">${ui.esc(g)}</option>`).join("");
  const filters = state.prefs.filters[tab];
  if (!genres.includes(filters.genre)) filters.genre = "all";
  el.genre.value = filters.genre;

  el.sort.value = filters.sort;
  ui.$$("button", el.viewToggle).forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === state.prefs.view);
  });
  el.viewToggle.dataset.active = state.prefs.view;

  ui.syncCustomSelect(el.genre);
  ui.syncCustomSelect(el.sort);

  if (state.user?.nick) el.menuUser.textContent = `@${state.user.nick}`;
}

function paintGrid({ enter = false } = {}) {
  const tab = state.prefs.tab;
  const all = state.data[tab] || [];
  const items = filteredItems();
  const counts = { newById: newCounts() };

  el.searchCount.textContent = state.query ? `${items.length} resultado${items.length === 1 ? "" : "s"}` : "";

  if (state.loading) {
    ui.renderSkeletons(el.grid, 12);
    el.empty.hidden = true;
    el.title.textContent = "Sincronizando tu biblioteca…";
    return;
  }

  ui.renderSectionTitle(el.title, tab, items.length, all.length, state.query);

  if (!items.length) {
    el.grid.innerHTML = "";
    ui.renderEmpty(el.empty, tab, state.query, all.length, { enter });
    return;
  }

  el.empty.hidden = true;
  ui.renderGrid(el.grid, items, counts, state.prefs.view, { open: openDetail }, { enter });
}

function paintSync() {
  const syncEl = el.sync;
  syncEl.classList.remove("is-live", "is-busy", "is-error");

  if (state.syncing) {
    syncEl.classList.add("is-busy");
    el.syncText.textContent = "sincronizando…";
    el.refresh.classList.add("is-spinning");
  } else {
    el.refresh.classList.remove("is-spinning");
    if (state.error) {
      syncEl.classList.add("is-error");
      el.syncText.textContent = "sin conexión";
    } else if (state.lastSync) {
      const secs = Math.round((Date.now() - state.lastSync) / 1000);
      const label =
        secs < 60
          ? `hace ${Math.max(1, secs)}s`
          : secs < 3600
            ? `hace ${Math.round(secs / 60)} min`
            : `hace ${Math.round(secs / 3600)} h`;
      syncEl.classList.add("is-live");
      el.syncText.textContent = label;
    } else {
      el.syncText.textContent = "conectando…";
    }
  }

  el.footSync.textContent = state.lastSync
    ? `actualizado ${new Date(state.lastSync).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`
    : "—";

  el.sync.title = state.lastSync ? `Última sincronización: ${new Date(state.lastSync).toLocaleString("es")}` : "";
}

/* ------------------------------------------------------------------ */
/* acciones                                                           */
/* ------------------------------------------------------------------ */

function setTab(tab) {
  if (!TAB_KEYS.includes(tab) || tab === state.prefs.tab) return;
  state.prefs.tab = tab;
  state.query = "";
  el.search.value = "";
  store.savePrefs(state.prefs);
  history.replaceState(null, "", `#/${tab}`);
  paintAll({ enter: true });
}

async function openDetail(id) {
  const item = findItem(id);
  if (!item) return;

  const cached = state.details[id] || null;
  let modal = null;

  const markViewed = () => {
    state.seen[id] = item.total || 0;
    store.saveSeen(state.seen);
    paintGrid();
  };

  modal = ui.openModal(
    {
      item,
      detail: cached,
      note: state.notes[id] || "",
      newCount: newCounts()[id] || 0,
      onNote: (text) => {
        state.notes = store.saveNote(id, text);
      },
    },
    () => {
      modal = null;
    }
  );

  if (cached?.chapters?.length) modal.update(cached);
  markViewed();

  const stale = !cached || Date.now() - (cached.fetchedAt || 0) > DETAIL_FRESH;
  if (!stale) return;

  try {
    const detail = await api.fetchDetails(item.realId || item.id);
    if (!detail.id) detail.id = id;
    state.details[id] = detail;
    store.saveDetails(state.details);
    if (modal) modal.update(detail);
    if (currentReading()?.id === id) paintShell();
  } catch (err) {
    ui.toast("No se pudieron cargar los capítulos", err?.message || "Intentá de nuevo.", "error");
  }
}

function exportLibrary() {
  const data = {
    generado: new Date().toISOString(),
    usuario: state.user,
    biblioteca: state.data,
    detalles: state.details,
    notas: state.notes,
    historial: state.history,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mi-biblioteca-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  ui.toast("Exportado", "Se descargó tu biblioteca en JSON.");
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(state.token);
    ui.toast("Token copiado", "Pegalo en otro navegador para conectar esa sesión.");
  } catch {
    ui.toast("No se pudo copiar", "Copialo manualmente desde el menú del navegador.", "error");
  }
}

function disconnect() {
  if (!confirm("¿Desconectar este navegador? Se borra el token guardado (tu biblioteca local queda).")) return;
  store.clearToken();
  state.token = "";
  state.user = null;
  store.setUser(null);
  showConnect("Desconectado. Podés volver a conectar cuando quieras.");
}

/* ------------------------------------------------------------------ */
/* eventos                                                            */
/* ------------------------------------------------------------------ */

function bindStatic() {
  el.connectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = el.tokenInput.value.trim();
    if (!token) {
      el.connectError.textContent = "Pegá tu token para continuar.";
      return;
    }

    const button = el.connectForm.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Conectando…";
    el.connectError.textContent = "";

    try {
      state.token = token;
      await validateToken();
      store.setToken(token);
      el.tokenInput.value = "";
      showDash();
      state.loading = true;
      paintShell();
      paintGrid();
      await sync({ silent: true });
      state.prefs.tab = "leyendo";
      paintAll({ enter: true });
    } catch (err) {
      el.connectError.textContent =
        err?.kind === "auth"
          ? "Ese token no es válido o expiró. Copiá uno nuevo desde ManhwaWeb."
          : err?.message || "No se pudo conectar.";
      state.token = "";
      store.clearToken();
    } finally {
      button.disabled = false;
      button.textContent = "Conectar";
    }
  });

  ui.$("#btn-toggle-token").addEventListener("click", () => {
    el.tokenInput.type = el.tokenInput.type === "password" ? "text" : "password";
    el.tokenInput.focus();
  });

  el.refresh.addEventListener("click", () => sync({ silent: false }));

  const toggleMenu = (open) => {
    el.menu.hidden = !open;
    ui.$("#btn-menu").setAttribute("aria-expanded", String(open));
  };
  ui.$("#btn-menu").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu(el.menu.hidden);
  });
  document.addEventListener("click", (event) => {
    if (!el.menu.hidden && !event.target.closest("#menu, #btn-menu")) toggleMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.menu.hidden) toggleMenu(false);
  });

  // Cualquier "Continuar" (hero o modal) confirma cuál es tu lectura actual.
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-continue]");
    if (link?.dataset.continue) setCurrent(link.dataset.continue);
  });

  let searchTimer = null;
  el.search.addEventListener("input", () => {    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = el.search.value;
      paintGrid();
    }, 120);
  });

  ui.setupCustomDropdowns();
  ui.syncCustomSelect(el.genre);
  ui.syncCustomSelect(el.sort);

  el.genre.addEventListener("change", () => {
    state.prefs.filters[state.prefs.tab].genre = el.genre.value;
    ui.syncCustomSelect(el.genre);
    store.savePrefs(state.prefs);
    paintGrid();
  });

  el.sort.addEventListener("change", () => {
    state.prefs.filters[state.prefs.tab].sort = el.sort.value;
    ui.syncCustomSelect(el.sort);
    store.savePrefs(state.prefs);
    paintGrid();
  });

  function setView(view) {
    state.prefs.view = view;
    el.viewToggle.dataset.active = view;
    ui.$$("button", el.viewToggle).forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === view);
    });
    store.savePrefs(state.prefs);
    paintGrid();
  }

  ui.$$("button", el.viewToggle).forEach((btn) => {
    btn.addEventListener("click", () => {
      setView(btn.dataset.view);
    });
  });

  ui.$("#btn-export").addEventListener("click", () => {
    toggleMenu(false);
    exportLibrary();
  });
  ui.$("#btn-copy-token").addEventListener("click", () => {
    toggleMenu(false);
    copyToken();
  });
  ui.$("#btn-disconnect").addEventListener("click", () => {
    toggleMenu(false);
    disconnect();
  });

  window.addEventListener("hashchange", () => {
    const tab = (location.hash.match(/^#\/(leyendo|planeado|finalizado)$/) || [])[1];
    if (tab && tab !== state.prefs.tab) setTab(tab);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.token && Date.now() - state.lastSync > 5000) {
      sync({ silent: true });
    }
  });

  setInterval(() => {
    paintSync();
  }, 1000);

  setInterval(() => {
    if (document.visibilityState === "visible" && state.token && !state.syncing) {
      sync({ silent: true });
    }
  }, POLL_MS);
}

boot();

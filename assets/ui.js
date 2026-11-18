/**
 * Render del dashboard. HTML string + listeners puntuales.
 */

import { chapterUrl, coverSrc, workUrl } from "./api.js";
import { activityMarkup, relativeTime, shortDate } from "./charts.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const STATUS_TEXT = { leyendo: "Leyendo", planeado: "Planeado", finalizado: "Finalizado" };
const STATUS_PILL = { leyendo: "pill--violet", planeado: "pill--amber", finalizado: "pill--teal" };
const TAB_LABEL = { leyendo: "Leyendo", planeado: "Planeado", finalizado: "Finalizados" };

export const progress = (item) => {
  if (!item?.total) return 0;
  return Math.max(0, Math.min(100, Math.round((item.read / item.total) * 100)));
};

const coverStyle = (item) => (item.cover ? `style="--cover:url('${esc(coverSrc(item.cover))}')"` : "");

const img = (src, alt, cls = "") =>
  src
    ? `<img class="${cls}" src="${esc(coverSrc(src))}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.opacity=0" />`
    : `<div class="img-ph ${cls}" aria-hidden="true"></div>`;

/* ------------------------------------------------------------------ */
/* tabs                                                               */
/* ------------------------------------------------------------------ */

export function renderTabs(el, counts, active, onTab) {
  el.innerHTML = Object.keys(TAB_LABEL)
    .map(
      (key) => `<button class="tab ${key === active ? "is-active" : ""}" role="tab"
        aria-selected="${key === active}" data-tab="${key}">
        ${TAB_LABEL[key]}<span class="tab-count">${counts[key] ?? 0}</span>
      </button>`
    )
    .join("");

  $$(".tab", el).forEach((btn) => {
    btn.addEventListener("click", () => onTab(btn.dataset.tab));
  });
}

/* ------------------------------------------------------------------ */
/* hero                                                               */
/* ------------------------------------------------------------------ */

export function renderHero(el, ctx, actions) {
  const { current, detail, lastReadAt } = ctx;

  if (!current) {
    el.innerHTML = `<section class="hero hero--empty">
      <div class="hero-body">
        <span class="live-pill live-pill--off"><i></i>Sin lectura activa</span>
        <h2 class="hero-title">No tenés nada en “Leyendo”.</h2>
        <p class="hero-meta">Agregá obras en ManhwaWeb y aparecen acá automáticamente.</p>
        <div class="hero-actions">
          <button class="btn btn-ghost" data-go="planeado">Ver planeados</button>
        </div>
      </div>
    </section>`;
    const go = $("[data-go]", el);
    if (go) go.addEventListener("click", () => actions.setTab("planeado"));
    return;
  }

  const total = current.total || detail?.total || 0;
  const read = current.read || 0;
  const pct = progress(current);
  const next = total ? Math.min(total, read + 1) : read + 1;
  const isDone = total > 0 && read >= total;
  const newCount = ctx.newCount || 0;
  const genres = (detail?.genres?.length ? detail.genres : current.genres) || [];
  const metaBits = [
    genres.slice(0, 3).map(esc).join(" · "),
    detail?.demographic || current.demographic,
    detail?.state || current.state,
  ].filter(Boolean);

  el.innerHTML = `<article class="hero" ${coverStyle({ cover: detail?.cover || current.cover })}>
    <div class="hero-cover">${img(detail?.cover || current.cover, current.title)}</div>
    <div class="hero-body">
      <div class="hero-pills">
        <span class="live-pill"><i></i>Leyendo ahora</span>
        ${newCount > 0 ? `<span class="pill pill--new">+${newCount} nuevo${newCount === 1 ? "" : "s"}</span>` : ""}
        <button class="hero-switch" data-switch type="button" title="Elegir otra obra como lectura actual">Cambiar</button>
      </div>
      <h2 class="hero-title">${esc(detail?.title || current.title)}</h2>
      <p class="hero-meta">
        ${metaBits.length ? metaBits.map((m) => `<span>${m}</span>`).join('<span class="sep">·</span>') : "<span>Sin datos de la obra</span>"}
        ${lastReadAt ? `<span class="sep">·</span><span title="${esc(new Date(lastReadAt).toLocaleString("es"))}">último cambio ${esc(relativeTime(lastReadAt))}</span>` : ""}
      </p>
      <div class="hero-progress">
        <div class="hero-progress-top">
          <span>Capítulo <b>${read || 0}</b> de <b>${total || "?"}</b></span>
          <span class="pct">${pct}%</span>
        </div>
        <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      </div>
      <div class="hero-actions">
        <a class="btn btn-primary" data-continue="${esc(current.id)}" href="${esc(chapterUrl(current.realId, isDone ? total || read : next))}" target="_blank" rel="noopener noreferrer">
          ${isDone ? `Releer final · Cap. ${total || read}` : read ? `Continuar · Cap. ${next}` : "Empezar · Cap. 1"}
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h13M12 5l7 7-7 7"/></svg>
        </a>
        <button class="btn btn-ghost" data-open>Ver capítulos y notas</button>
      </div>
    </div>
    <div class="hero-figure" aria-hidden="true">
      <span>${read || 0}</span>
      <small>de ${total || "?"} capítulos</small>
    </div>
  </article>`;

  $("[data-switch]", el)?.addEventListener("click", () => actions.switchCurrent());
  $("[data-open]", el)?.addEventListener("click", () => actions.open(current.id));
}

/* ------------------------------------------------------------------ */
/* stats + actividad                                                  */
/* ------------------------------------------------------------------ */

const stat = (label, value, sub) =>
  `<div class="stat"><span class="stat-k">${esc(label)}</span><strong class="stat-v">${esc(value)}</strong><span class="stat-sub">${esc(sub)}</span></div>`;

export function renderStats(el, ctx) {
  const { tab, items, history } = ctx;
  const sum = (fn) => items.reduce((acc, item) => acc + fn(item), 0);
  const reads = sum((i) => i.read || 0);
  const totals = sum((i) => i.total || 0);

  let cells = "";
  if (tab === "leyendo") {
    const pending = Math.max(0, totals - reads);
    const days = ctx.streak || 0;
    cells =
      stat("Obras", items.length, "en lectura") +
      stat("Capítulos leídos", reads, `de ${totals || "—"}`) +
      stat("Por leer", pending, "en esas obras") +
      stat("Racha", days, days === 1 ? "día seguido" : "días seguidos");
  } else if (tab === "planeado") {
    const notStarted = items.filter((i) => !i.read).length;
    const topGenre = topValue(items.flatMap((i) => i.genres || [])) || "—";
    cells =
      stat("Obras", items.length, "en la lista") +
      stat("Sin empezar", notStarted, "esperando") +
      stat("Capítulos", totals, "acumulados") +
      stat("Género top", topGenre, "más frecuente");
  } else {
    const avg = items.length ? Math.round(totals / items.length) : 0;
    const last = items.reduce((max, i) => Math.max(max, i.updatedAt || 0), 0);
    cells =
      stat("Terminadas", items.length, "obras") +
      stat("Capítulos", totals, "leídos en total") +
      stat("Promedio", avg, "caps por obra") +
      stat("Última", last ? shortDate(last) : "—", "actualización");
  }

  const activity = history && history.length ? activityMarkup(history) : "";
  el.innerHTML = cells + activity;
}

function topValue(list) {
  const counts = new Map();
  for (const value of list) counts.set(value, (counts.get(value) || 0) + 1);
  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* grid                                                               */
/* ------------------------------------------------------------------ */

export function renderSkeletons(el, count = 12) {
  el.className = "grid";
  el.innerHTML = Array.from({ length: count })
    .map(
      () => `<div class="skeleton-card">
        <div class="sk sk-cover"></div>
        <div class="sk sk-line"></div>
        <div class="sk sk-line short"></div>
      </div>`
    )
    .join("");
}

const newBadge = (count) => (count > 0 ? `<span class="chip chip--new">+${count} nuevo${count === 1 ? "" : "s"}</span>` : "");

function card(item, counts, actions) {
  const pct = progress(item);
  const full = pct >= 100;
  return `<article class="card" data-id="${esc(item.id)}">
    <button class="card-hit" data-open aria-label="Abrir ${esc(item.title)}"></button>
    <div class="card-cover">
      ${img(item.cover, item.title)}
      ${newBadge(counts.newById[item.id] || 0)}
      <div class="card-progress ${full ? "is-full" : ""}"><span style="width:${pct}%"></span></div>
    </div>
    <div class="card-body">
      <h3 class="card-title">${esc(item.title)}</h3>
      <div class="card-meta">
        <span class="num"><b>${item.read || 0}</b>/${item.total || "?"}</span>
        <span class="sep"></span>
        <span>${full ? "Completo" : item.read ? `${pct}%` : STATUS_TEXT[item.status]}</span>
      </div>
    </div>
  </article>`;
}

export function renderGrid(el, items, counts, view, actions) {
  el.className = `grid ${view === "list" ? "is-list" : ""}`;
  el.innerHTML = items.map((item) => card(item, counts, actions)).join("");

  $$(".card", el).forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      actions.open(node.dataset.id);
    });
  });
}

export function renderEmpty(el, tab, query, total) {
  el.hidden = false;
  if (query) {
    el.innerHTML = `<strong>Sin resultados</strong><span>Nada coincide con “${esc(query)}” en esta sección.</span>`;
    return;
  }
  const copy = {
    leyendo: ["Acá no hay nada en lectura", "Agregá obras a “Siguiendo” en ManhwaWeb y aparecen en la próxima sincronización."],
    planeado: ["Tu lista de planeados está vacía", "En ManhwaWeb, marcá obras como “Pendiente” y se van a listar acá."],
    finalizado: ["Todavía no terminaste ninguna", "Cuando marques una obra como “Finalizado” va a aparecer en esta sección."],
  }[tab] || ["Nada por acá", ""];

  el.innerHTML = `<strong>${esc(copy[0])}</strong><span>${esc(copy[1])}</span>${
    total === 0 && tab === "leyendo" ? `<span class="hint">Biblioteca sincronizada, pero este estado está vacío en tu cuenta.</span>` : ""
  }`;
}

export function renderSectionTitle(el, tab, shown, total, query) {
  const noun = tab === "leyendo" ? "en lectura" : tab === "planeado" ? "planeada" : "finalizada";
  if (query) {
    el.innerHTML = `<b>${shown}</b> de ${total} ${total === 1 ? "obra" : "obras"} ${noun}`;
  } else {
    el.innerHTML = `<b>${total}</b> ${total === 1 ? "obra" : "obras"} ${noun}`;
  }
}

/* ------------------------------------------------------------------ */
/* modal                                                              */
/* ------------------------------------------------------------------ */

export function openModal({ item, detail, note, onNote, newCount }, onClose) {
  const root = $("#modal-root");
  const total = item.total || detail?.total || 0;
  const read = item.read || 0;
  const pct = progress({ read, total });

  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-backdrop" data-close></div>
    <div class="modal-panel">
      <button class="modal-close" data-close aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>

      <header class="modal-head">
        ${img(detail?.cover || item.cover, item.title, "modal-cover")}
        <div class="modal-info">
          <div class="modal-chips">
            <span class="pill ${STATUS_PILL[item.status] || ""}">${STATUS_TEXT[item.status] || ""}</span>
            ${newCount > 0 ? `<span class="pill pill--violet">+${newCount} nuevos</span>` : ""}
            ${detail?.erotic || item.erotic ? `<span class="pill pill--red">+18</span>` : ""}
            ${(detail?.demographic || item.demographic) ? `<span class="pill">${esc(detail?.demographic || item.demographic)}</span>` : ""}
            ${(detail?.state || item.state) ? `<span class="pill">${esc(detail?.state || item.state)}</span>` : ""}
            ${(detail?.genres || item.genres || []).slice(0, 3).map((g) => `<span class="pill">${esc(g)}</span>`).join("")}
          </div>
          <h2 class="modal-title" id="modal-title">${esc(detail?.title || item.title)}</h2>
          ${(detail?.alt?.[0] || item.alt?.[0]) ? `<p class="modal-alt">${esc(detail?.alt?.[0] || item.alt?.[0])}</p>` : ""}
          <div class="modal-meta">
            <span>Progreso <b>${read} / ${total || "?"}</b> (${pct}%)</span>
            ${detail?.author ? `<span>Autor <b>${esc(detail.author)}</b></span>` : ""}
            ${detail?.artist ? `<span>Artista <b>${esc(detail.artist)}</b></span>` : ""}
            ${detail?.platform ? `<span>Plataforma <b>${esc(detail.platform)}</b></span>` : ""}
          </div>
          <div class="modal-actions">
            <a class="btn btn-primary" data-continue="${esc(item.id)}" href="${esc(chapterUrl(item.realId, total && read >= total ? total : Math.min(total || read + 1, read + 1)))}" target="_blank" rel="noopener noreferrer">
              ${
                !read
                  ? "Empezar en Cap. 1"
                  : total && read >= total
                    ? "Releer final"
                    : `Continuar en Cap. ${Math.min(total || read + 1, read + 1)}`
              }
            </a>
            <a class="btn btn-ghost" href="${esc(workUrl(item.realId))}" target="_blank" rel="noopener noreferrer">Ver en ManhwaWeb</a>
          </div>
        </div>
      </header>

      <div class="modal-cols">
        <section>
          <div class="modal-progress">
            <div class="modal-progress-top"><span>Progreso de lectura</span><span class="pct">${pct}%</span></div>
            <div class="track"><div class="fill" style="width:${pct}%"></div></div>
          </div>
          <h3>Sinopsis</h3>
          <p class="synopsis" data-synopsis>${esc(detail?.synopsis || item.synopsis || "Sin sinopsis disponible.")}</p>
          <h3 style="margin-top:22px">Tus notas</h3>
          <textarea class="notes" data-notes placeholder="Ej: retomar cuando salga el cap 40…" maxlength="2000">${esc(note || "")}</textarea>
          <div class="notes-foot"><span data-note-state>se guarda solo</span><span>${esc(note ? "guardado" : "")}</span></div>
        </section>
        <section>
          <div class="chapters-head">
            <h3>Capítulos</h3>
            <span class="chapter-count" data-count>${total ? `${total} en total` : ""}</span>
          </div>
          <div class="chapters" data-chapters>
            <div class="chapter"><span class="n">Cargando capítulos…</span></div>
          </div>
        </section>
      </div>
    </div>
  </div>`;

  const modal = $(".modal", root);
  document.body.classList.add("is-locked");
  const restoreFocus = document.activeElement;
  $("[data-close]", root)?.focus?.();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.body.classList.remove("is-locked");
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey);
    if (restoreFocus?.focus) restoreFocus.focus({ preventScroll: true });
    onClose?.();
  };

  const onKey = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  $$("[data-close]", root).forEach((node) => node.addEventListener("click", close));

  const notes = $("[data-notes]", root);
  let timer = null;
  notes?.addEventListener("input", () => {
    const state = $("[data-note-state]", root);
    if (state) state.textContent = "guardando…";
    clearTimeout(timer);
    timer = setTimeout(() => {
      onNote(notes.value);
      if (state) state.textContent = "guardado";
    }, 450);
  });

  const fillChapters = (detailData) => {
    const box = $("[data-chapters]", root);
    if (!box) return;
    const list = detailData?.chapters?.length
      ? detailData.chapters
      : total > 0
        ? Array.from({ length: total }, (_, i) => ({ n: i + 1 }))
        : [];

    if (!list.length) {
      box.innerHTML = `<div class="chapter"><span class="n">No hay capítulos publicados.</span></div>`;
      return;
    }

    box.innerHTML = [...list]
      .sort((a, b) => b.n - a.n)
      .map((c) => {
        const anchor = c.link || chapterUrl(item.realId, c.n);
        const isRead = c.n <= read;
        const isCurrent = c.n === read;
        const cls = ["chapter", isRead ? "is-read" : "", isCurrent ? "is-current" : ""].join(" ").trim();
        return `<a class="${cls}" href="${esc(anchor)}" target="_blank" rel="noopener noreferrer">
          <span class="n">Capítulo ${c.n}</span>
          <span class="state">${isCurrent ? "estás acá" : isRead ? "leído" : ""}</span>
        </a>`;
      })
      .join("");

    const count = $("[data-count]", root);
    if (count) count.textContent = `${list.length} en total`;

    const current = box.querySelector(".chapter.is-current");
    if (current) {
      requestAnimationFrame(() => {
        const boxRect = box.getBoundingClientRect();
        const rowRect = current.getBoundingClientRect();
        box.scrollTop += rowRect.top - boxRect.top - box.clientHeight / 2 + rowRect.height / 2;
      });
    }
  };

  const update = (detailData) => {
    fillChapters(detailData);
    const syn = $("[data-synopsis]", root);
    if (syn && detailData?.synopsis) syn.textContent = detailData.synopsis;
    const count = $("[data-count]", root);
    if (count && detailData?.chapters?.length) count.textContent = `${detailData.chapters.length} en total`;
  };

  if (detail?.chapters?.length) update(detail);

  return { close, update };
}

/* ------------------------------------------------------------------ */
/* selector de lectura actual                                         */
/* ------------------------------------------------------------------ */

export function openPicker({ items, currentId, onPick }, onClose) {
  const root = $("#modal-root");

  root.innerHTML = `<div class="modal modal--picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
    <div class="modal-backdrop" data-close></div>
    <div class="modal-panel modal-panel--sm">
      <button class="modal-close" data-close aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
      <header class="picker-head">
        <h2 id="picker-title">¿Qué estás leyendo?</h2>
        <p>Elegí la obra que va en “Leyendo ahora”. Se guarda en este navegador.</p>
      </header>
      <div class="picker-list">
        ${items
          .map(
            (item) => `<button class="picker-row ${item.id === currentId ? "is-current" : ""}" data-pick="${esc(item.id)}" type="button">
            <span class="picker-cover">${img(item.cover, item.title)}</span>
            <span class="picker-text">
              <strong>${esc(item.title)}</strong>
              <small>Cap. ${item.read || 0}${item.total ? ` de ${item.total}` : ""}${item.genres?.length ? ` · ${esc(item.genres[0])}` : ""}</small>
            </span>
            <span class="picker-check" aria-hidden="true">✓</span>
          </button>`
          )
          .join("")}
      </div>
    </div>
  </div>`;

  document.body.classList.add("is-locked");
  const restoreFocus = document.activeElement;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.body.classList.remove("is-locked");
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey);
    restoreFocus?.focus?.({ preventScroll: true });
    onClose?.();
  };

  const onKey = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  $$("[data-close]", root).forEach((node) => node.addEventListener("click", close));
  $$("[data-pick]", root).forEach((node) =>
    node.addEventListener("click", () => {
      onPick?.(node.dataset.pick);
      close();
    })
  );
  $(".modal-close", root)?.focus?.();
}

/* ------------------------------------------------------------------ */
/* toasts                                                             */
/* ------------------------------------------------------------------ */

export function toast(title, message = "", kind = "info") {
  const box = $("#toasts");
  if (!box) return;
  const node = document.createElement("div");
  node.className = `toast is-${kind}`;
  node.innerHTML = `<span class="toast-icon"></span><div><strong>${esc(title)}</strong>${message ? `<p>${esc(message)}</p>` : ""}</div>`;
  box.appendChild(node);

  while (box.children.length > 4) box.firstElementChild.remove();

  setTimeout(() => {
    node.classList.add("is-out");
    setTimeout(() => node.remove(), 300);
  }, 5200);
}

/**
 * Cliente de la API pública de ManhwaWeb.
 * Todo se ejecuta en tu navegador: no hay servidor intermedio.
 */

export const API = "https://api.manhwaweb.com";
export const SITE = "https://manhwaweb.com";

export const STATUS = {
  leyendo: "siguiendo",
  planeado: "pendiente",
  finalizado: "finalizado",
};

const UI_STATUS = {
  siguiendo: "leyendo",
  pendiente: "planeado",
  finalizado: "finalizado",
};

export const STATUS_LABEL = {
  siguiendo: "Leyendo",
  pendiente: "Planeado",
  finalizado: "Finalizado",
};

const TIMEOUT = 20000;

export class ApiError extends Error {
  constructor(message, { status = 0, kind = "network" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

async function request(path, { token, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let res;
  try {
    res = await fetch(API + path, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (err) {
    throw new ApiError(
      err?.name === "AbortError" ? "La API tardó demasiado en responder." : "No se pudo conectar con ManhwaWeb.",
      { kind: "network" }
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new ApiError("Tu sesión expiró. Volvé a conectar tu token.", { status: res.status, kind: "auth" });
  }
  if (!res.ok) {
    throw new ApiError(`ManhwaWeb respondió ${res.status}.`, { status: res.status, kind: "http" });
  }

  const type = res.headers.get("content-type") || "";
  if (!type.includes("json")) {
    const text = await res.text();
    throw new ApiError(
      text.trim() === "no_existe" ? "Esa obra ya no existe en ManhwaWeb." : "Respuesta inesperada de la API.",
      { status: res.status, kind: "parse" }
    );
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

export const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const toTime = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

export function toList(value) {
  if (!value) return [];
  if (!Array.isArray(value)) value = [value];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const v = Object.values(item)[0];
        return typeof v === "string" ? v : "";
      }
      return "";
    })
    .map((s) => String(s).trim())
    .filter(Boolean);
}

export const chapterUrl = (realId, n) => `${SITE}/leer/${realId}-${n}_01`;
export const workUrl = (realId) => `${SITE}/manhwa/${realId}`;

export async function pool(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

/* ------------------------------------------------------------------ */
/* endpoints                                                          */
/* ------------------------------------------------------------------ */

export async function getUser(token) {
  const data = await request("/user/data", { token });
  return { nick: data?.nick || "tu cuenta", level: data?.level || "user" };
}

export async function fetchStatus(token, statusKey, onPage) {
  const all = [];
  let page = 0;

  while (page < 80) {
    const data = await request(`/follow/manhwa/${statusKey}?page=${page}`, { token });
    const items = Array.isArray(data?.manhwas2)
      ? data.manhwas2
      : Array.isArray(data?.manhwas)
        ? data.manhwas
        : [];

    all.push(...items);
    if (onPage) onPage(all.length);

    if (items.length === 0) break;
    if (!data?.next) break;
    page += 1;
  }

  return all.map((item) => normalizeLibraryItem(item, statusKey)).filter((item) => item.id);
}

export function normalizeLibraryItem(raw, statusKey) {
  if (!raw || typeof raw !== "object") return null;
  const base = raw.manhwa && typeof raw.manhwa === "object" ? raw.manhwa : raw;

  const id = String(base._id || base.real_id || base.id || raw.manhwa_id || raw._id || "");
  const realId = String(base.real_id || base._id || id);
  const title = base.the_real_name || base.name_esp || base.name_manhwa || base.name || "Sin título";
  const cover = base._imagen || base.img || base.cover || "";
  const total = Math.max(
    0,
    toNum(base.numero_cap_esp) || toNum(base._numero_cap) || toNum(raw.numero_cap_esp) || toNum(raw._numero_cap)
  );
  const read = Math.max(0, toNum(raw.chapter ?? raw.leido ?? raw.read ?? base.chapter ?? 0));

  return {
    id,
    realId,
    title,
    cover,
    total,
    read,
    status: UI_STATUS[statusKey] || statusKey,
    genres: toList(base._categoris ?? raw._categoris),
    synopsis: base._sinopsis || raw._sinopsis || "",
    state: base._status || raw._status || "",
    type: base._tipo || raw._tipo || "",
    demographic: base._demografi || raw._demografi || "",
    erotic: (base._erotico || raw._erotico) === "si",
    platform: base._plataforma || raw._plataforma || "",
    alt: toList(base.others_name ?? raw.others_name),
    updatedAt: toTime(raw.date ?? raw.update ?? base._creation) || null,
  };
}

export async function fetchDetails(id, signal) {
  const doc = await fetchRawDetails(id, signal);
  return normalizeDetails(doc);
}

export async function fetchRawDetails(id, signal) {
  const doc = await request(`/manhwa/see/${encodeURIComponent(id)}`, { signal });
  if (!doc || typeof doc !== "object") throw new ApiError("Detalle inválido.", { kind: "parse" });
  return doc;
}

export function normalizeDetails(doc) {
  const id = String(doc._id || doc.real_id || "");
  const realId = String(doc.real_id || doc._id || id);
  const chapters = (Array.isArray(doc.chapters) ? doc.chapters : [])
    .map((c) => ({
      n: toNum(c.chapter),
      link: c?.versions?.[0]?.link || chapterUrl(realId, toNum(c.chapter)),
      at: toTime(c?.versions?.[0]?.create),
    }))
    .filter((c) => c.n > 0)
    .sort((a, b) => a.n - b.n);

  const maxChapter = chapters.length ? chapters[chapters.length - 1].n : 0;
  const total = toNum(doc.numero_cap_esp ?? doc._numero_cap) || maxChapter;
  const lastChapterAt = chapters.reduce((max, c) => Math.max(max, c.at || 0), 0);

  return {
    id,
    realId,
    title: doc.the_real_name || doc.name_esp || "Sin título",
    alt: toList(doc.others_name),
    synopsis: doc._sinopsis || "",
    cover: doc._imagen || "",
    genres: toList(doc._categoris),
    state: doc._status || "",
    type: doc._tipo || "",
    demographic: doc._demografi || "",
    erotic: doc._erotico === "si",
    platform: doc._plataforma || "",
    author: toList(doc.autor).join(", "),
    artist: toList(doc.artista).join(", "),
    total,
    maxChapter,
    lastChapterAt,
    chapters,
    fetchedAt: Date.now(),
  };
}

/**
 * Racha y actividad de lectura. Sin librerías: barras con CSS.
 */

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function activitySeries(history, days = 14) {
  const counts = new Map();
  for (const entry of history) {
    if (!entry?.at) continue;
    const key = dayKey(new Date(entry.at));
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const today = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    out.push({
      key,
      date: d,
      count: counts.get(key) || 0,
      label: d.toLocaleDateString("es", { weekday: "short" }).replace(".", ""),
      full: d.toLocaleDateString("es", { day: "2-digit", month: "short" }),
      isToday: i === 0,
    });
  }
  return out;
}

export function streak(history) {
  const counts = new Map();
  for (const entry of history) {
    if (!entry?.at) continue;
    const key = dayKey(new Date(entry.at));
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  if (!counts.get(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let total = 0;
  while (counts.get(dayKey(cursor))) {
    total += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return total;
}

export function activityMarkup(history) {
  const series = activitySeries(history, 14);
  const max = Math.max(1, ...series.map((s) => s.count));
  const total = series.reduce((sum, s) => sum + s.count, 0);
  const days = streak(history);

  const bars = series
    .map((s) => {
      const pct = s.count === 0 ? 3 : Math.max(10, Math.round((s.count / max) * 100));
      const cls = ["bar-wrap", s.count ? "has-read" : "", s.isToday ? "is-today" : ""].join(" ").trim();
      const title = `${s.full}: ${s.count} capítulo${s.count === 1 ? "" : "s"}`;
      return `<div class="${cls}" title="${title}" aria-label="${title}">
        <span class="bar" style="height:${pct}%"></span>
        <span class="bar-day">${s.label}</span>
      </div>`;
    })
    .join("");

  return `<section class="activity-panel" aria-label="Actividad de lectura">
    <div class="activity-head">
      <div>
        <span class="stat-k">Últimos 14 días</span>
        <strong class="activity-total">${total} <small>capítulo${total === 1 ? "" : "s"}</small></strong>
      </div>
      <div class="streak">
        <span class="streak-flame" aria-hidden="true">◆</span>
        <span><b>${days}</b> día${days === 1 ? "" : "s"} de racha</span>
      </div>
    </div>
    <div class="activity-bars" role="img" aria-label="Capítulos leídos por día en las últimas dos semanas">
      ${bars}
    </div>
  </section>`;
}

export function relativeTime(ts) {
  if (!ts) return "nunca";
  const diff = Date.now() - ts;
  if (diff < 5000) return "ahora";
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(ts).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

export function shortDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("es", { day: "2-digit", month: "short" });
}

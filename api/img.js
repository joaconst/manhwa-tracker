/**
 * Proxy de portadas.
 *
 * img1mw.xyz e img2mw.xyz tienen protección de hotlink: solo devuelven la
 * imagen si el Referer es de manhwaweb.com. Desde otro dominio el navegador
 * manda nuestro origen, así que la imagen se bloquea con 403.
 *
 * Esta función corre en el servidor de Vercel, donde sí podemos mandar el
 * Referer correcto. No toca tokens ni datos del usuario: solo reenvía imágenes
 * de los hosts permitidos y las cachea en el CDN.
 *
 * Uso: /api/img?u=https://img1mw.xyz/manhwas/.../cover.webp
 */

const ALLOWED_HOSTS = new Set(["img1mw.xyz", "img2mw.xyz"]);

const UPSTREAM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CACHE =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400, immutable";

module.exports = async function handler(req, res) {
  const fromQuery = Array.isArray(req.query?.u) ? req.query.u[0] : req.query?.u;
  let raw = fromQuery;
  if (!raw && req.url) {
    try {
      raw = new URL(req.url, "http://localhost").searchParams.get("u") || "";
    } catch {
      raw = "";
    }
  }

  if (!raw) {
    res.status(400).json({ error: "Falta el parámetro u." });
    return;
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).json({ error: "URL inválida." });
    return;
  }

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    res.status(403).json({ error: "Host no permitido." });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: {
        Referer: "https://manhwaweb.com/",
        "User-Agent": UPSTREAM_UA,
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });
  } catch {
    res.status(502).json({ error: "No se pudo obtener la imagen." });
    return;
  }

  if (!upstream.ok) {
    res.status(upstream.status === 404 ? 404 : 502).end();
    return;
  }

  const type = upstream.headers.get("content-type") || "";
  if (!type.startsWith("image/")) {
    res.status(502).json({ error: "El origen no devolvió una imagen." });
    return;
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());

  res.setHeader("Content-Type", type);
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("Cache-Control", CACHE);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(buffer);
};

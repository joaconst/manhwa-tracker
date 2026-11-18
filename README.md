# Mi Biblioteca · ManhwaWeb

Dashboard personal para ver **qué estás leyendo, qué tenés planeado y qué terminaste** en [manhwaweb.com](https://manhwaweb.com), con portadas, progreso por capítulo, notas e historial.

- **Sin backend, sin base de datos, sin build.** Son archivos estáticos.
- La API de ManhwaWeb se consulta **desde tu navegador** con tu propio token.
- Se actualiza sola cada 15 segundos mientras la pestaña está abierta.

```
manhwa-tracker/
├─ index.html
├─ assets/
│  ├─ styles.css
│  ├─ app.js        orquestación + polling
│  ├─ api.js        cliente de api.manhwaweb.com
│  ├─ store.js      localStorage (token, snapshot, notas, historial)
│  ├─ ui.js         render de tabs, hero, grilla, modal
│  └─ charts.js     racha y actividad
├─ userscript/
│  └─ manhwaweb-tracker.user.js
└─ README.md
```

---

## 1. Instalar el userscript

1. Instalá [Violentmonkey](https://violentmonkey.github.io/get-it/) en tu navegador (Chrome, Edge, Firefox, Brave).
2. Abrí el panel de Violentmonkey → **+** → **Instalar desde archivo** (o arrastrá `userscript/manhwaweb-tracker.user.js`).
3. Entrá a `https://manhwaweb.com` con tu sesión iniciada.
4. Vas a ver un botón flotante **“Mis lecturas”** abajo a la derecha.
5. La primera vez te pide la **URL de tu dashboard** (la de Vercel). También podés fijarla en el código:

```js
const DASHBOARD_URL = "https://tu-app.vercel.app";
```

Cada clic abre el dashboard con tu token ya conectado. El token viaja en el `#hash` de la URL (no se envía a ningún servidor) y el dashboard lo borra de la barra de direcciones al guardarlo.

### Menú del userscript

- **Abrir Mis lecturas**
- **Configurar URL del dashboard**
- **Copiar token de sesión** (para conectar el celular)
- **Olvidar token guardado**

---

## 2. Conectar sin userscript

Si preferís no instalar nada:

1. Abrí ManhwaWeb con tu sesión iniciada.
2. `F12` → **Application / Almacenamiento** → **Local Storage** → `https://manhwaweb.com`.
3. Copiá el valor de **`tokenCommers`**.
4. Pegalo en la pantalla de conexión del dashboard.

> El token equivale a tu sesión. No lo compartas ni lo subas a ningún lado.

---

## 3. Subir a Vercel

El proyecto es estático: no necesita comando de build.

### Opción rápida (arrastrar)

1. Entrá a [vercel.com/new](https://vercel.com/new).
2. Arrastrá la carpeta `manhwa-tracker` completa.
3. Deploy. Listo.

### Opción Git

```bash
cd manhwa-tracker
git init
git add .
git commit -m "Mi Biblioteca ManhwaWeb"
git remote add origin <tu-repo>
git push -u origin main
```

En Vercel importás el repo y dejás:

| Ajuste | Valor |
|---|---|
| Framework Preset | **Other** |
| Build Command | *(vacío)* |
| Output Directory | *(vacío o `.`)* |
| Install Command | *(vacío)* |

También funciona en Netlify, Cloudflare Pages o GitHub Pages.

---

## 4. Qué hace el dashboard

### Secciones separadas

| Tab | Origen en ManhwaWeb | Qué muestra |
|---|---|---|
| **Leyendo** | `siguiendo` | Hero “Leyendo ahora”, progreso, botón **Continuar** |
| **Planeado** | `pendiente` | Lista de pendientes, CTA al capítulo 1 |
| **Finalizados** | `finalizado` | Obras terminadas al 100% |

Cada pestaña guarda su propio orden y filtro de género. La URL cambia a `#/leyendo`, `#/planeado` o `#/finalizado`.

### Datos por obra

- Portada, título real y título alternativo.
- Capítulos leídos / totales y barra de porcentaje.
- Géneros, demografía, estado, plataforma, autor/artista.
- Badge **“+N nuevos”** cuando la obra sumó capítulos desde tu última visita.
- Botón directo al capítulo exacto (usa los links reales de la API).

### Extras

- **Búsqueda** dentro de la sección activa.
- **Notas personales** por obra (se guardan solas).
- **Historial** de cambios de capítulo detectados automáticamente.
- **Racha** de días leyendo y gráfico de los últimos 14 días.
- **Exportar** toda la biblioteca a JSON.
- Vista **grilla** o **lista**.

---

## 5. Cómo se sincroniza

| Momento | Acción |
|---|---|
| Al abrir | Lee la biblioteca (3 estados, paginado) |
| Cada 15 s | Vuelve a consultar si la pestaña está visible |
| Al volver a la pestaña | Sincroniza si pasaron más de 5 s |
| Al abrir una obra | Trae el detalle completo y los links de capítulos |

El progreso lo guarda ManhwaWeb cuando abrís un capítulo; el dashboard lo detecta en la siguiente consulta y te avisa con un toast.

Detalles de obra se refrescan cada **12 horas** y la biblioteca se guarda como snapshot para que el dashboard abra al instante, incluso sin internet.

---

## 6. Límites conocidos

- Solo aparecen obras que estén en **Mis Manhwas**. Lo leído sin agregarlo a la biblioteca no existe en la API.
- ManhwaWeb guarda **un solo capítulo actual por obra**, no un historial. El historial del dashboard se construye desde la primera sincronización.
- El sitio **no tiene estrellas**; por eso el dashboard no las inventa.
- Si cambiás la contraseña o cerrás sesión, el token se invalida: reconectá.
- El scraping de la API puede romperse si ManhwaWeb cambia sus endpoints.

---

## 7. Problemas frecuentes

| Síntoma | Solución |
|---|---|
| “Tu sesión expiró” | Volvé a abrir el dashboard desde el userscript o pegá un token nuevo |
| “sin conexión” | Revisá que `api.manhwaweb.com` responda; puede haber bloqueo de red |
| No aparecen obras nuevas | Esperá 15 s o tocá el botón ↻ |
| Las portadas no cargan | `img1mw.xyz` / `img2mw.xyz` bloqueados por el navegador o por un adblock |
| El botón del userscript no aparece | Verificá que el script esté habilitado para `manhwaweb.com` |

---

Hecho para uso personal. No afiliado a ManhwaWeb.

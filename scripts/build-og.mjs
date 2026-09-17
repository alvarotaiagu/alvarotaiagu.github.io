/**
 * build-og.mjs — compone assets/og.jpg (1200×630): un trozo de la calle con
 * los escaparates encendidos, que es lo que se ve al compartir el enlace.
 *
 * Se monta como una página aparte y se fotografía, para que use el mismo CSS
 * (misma noche, mismas farolas, mismos colores de cada proyecto) sin tener que
 * duplicar nada a mano.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { writeFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const datos = JSON.parse(await readFile(join(ROOT, 'data/projects.json'), 'utf8'));

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
};

/* doce escaparates repartidos por sectores, para que la imagen sea multicolor */
const muestra = [];
for (const s of datos.sectores) {
  const suyos = datos.proyectos.filter((p) => p.sector === s.id);
  const cuantos = s.id === 'plantillas' ? 1 : Math.min(3, suyos.length);
  const paso = Math.max(1, Math.floor(suyos.length / cuantos));
  for (let i = 0, n = 0; i < suyos.length && n < cuantos; i += paso, n++) muestra.push(suyos[i]);
}

const tarjeta = (p) => `
<article class="fachada esta-encendida" data-lado="izq" style="--f:${p.color}; --f-rotulo:${p.colorRotulo}">
  <div class="fachada__interior">
    <header class="fachada__rotulo">
      <h3 class="fachada__nombre" style="font-family:${p.fuente.stack}, ${p.fuente.generica}; font-weight:${p.fuente.peso}; font-style:${p.fuente.estilo}">${p.nombre}</h3>
    </header>
    <div class="fachada__escaparate">
      <img class="fachada__captura" src="${p.capturas.desktop}" alt="">
    </div>
  </div>
  <span class="fachada__acera"></span>
</article>`;

const pagina = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="css/rua.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..600;1,6..96,400..500&family=IBM+Plex+Mono:wght@400;500&display=swap">
${[...new Set(muestra.map((p) => datos.fuentes[p.fuente.id]?.css).filter(Boolean))]
  .map((u) => `<link rel="stylesheet" href="${u}">`).join('\n')}
<style>
  body { width: 1200px; height: 630px; overflow: hidden; position: relative;
         background: var(--noche); display: grid; grid-template-rows: auto 1fr; gap: 30px;
         padding: 44px 46px 0; }
  .luz { position: absolute; inset: 0; pointer-events: none; z-index: 2;
         background:
           radial-gradient(34rem 22rem at 6% -14%, rgba(242,200,121,.18), transparent 62%),
           linear-gradient(180deg, transparent 72%, rgba(11,13,18,.9) 100%); }
  .cabeza { position: relative; z-index: 3; display: flex; align-items: baseline; gap: 18px; }
  .cabeza h1 { font-family: var(--serif); font-weight: 400; font-size: 78px; line-height: .9;
               letter-spacing: -.03em; color: var(--papel); }
  .cabeza p { font-family: var(--mono); font-size: 15px; letter-spacing: .08em;
              text-transform: uppercase; color: var(--papel-38); }
  .rejilla { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; align-items: start; }
  /* la calle manda las fachadas a la columna 1 o a la 2; aquí la rejilla es otra */
  .fachada { padding: 0 !important; grid-column: auto !important; }
  .rejilla .fachada:nth-child(even) { margin-top: 26px; }
  .fachada__rotulo { padding: 10px 12px 8px; border-block-end: 1px solid var(--papel-06); }
  .fachada__nombre { font-size: 20px !important; line-height: 1.1; white-space: nowrap;
                     overflow: hidden; text-overflow: ellipsis; color: var(--f-rotulo) !important; }
  .fachada__captura { filter: saturate(.95) brightness(.9); }
</style></head>
<body>
  <div class="luz"></div>
  <div class="cabeza">
    <h1>Álvaro</h1>
    <p>39 webs · Carballo, Bergantiños</p>
  </div>
  <div class="rejilla">${muestra.slice(0, 8).map(tarjeta).join('')}</div>
</body></html>`;

writeFileSync(join(ROOT, 'scripts/.og.html'), pagina);

const servidor = createServer(async (req, res) => {
  const limpio = decodeURIComponent(req.url.split('?')[0]);
  let ruta = join(ROOT, normalize(limpio === '/' ? '/scripts/.og.html' : limpio).replace(/^(\.\.[/\\])+/, ''));
  try { if ((await stat(ruta)).isDirectory()) ruta = join(ruta, 'index.html'); }
  catch { res.writeHead(404).end('no'); return; }
  res.writeHead(200, { 'content-type': TIPOS[extname(ruta)] || 'application/octet-stream' });
  createReadStream(ruta).pipe(res);
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts?.ready).catch(() => {});
await page.waitForTimeout(900);
const png = await page.screenshot({ type: 'png' });
await b.close();
servidor.close();

const jpg = await sharp(png).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
writeFileSync(join(ROOT, 'assets/og.jpg'), jpg);
console.log(`assets/og.jpg — ${(jpg.length / 1024).toFixed(1)} KB · ${muestra.slice(0, 8).map((p) => p.nombre).join(', ')}`);
console.log(`(previsualízalo en ${pathToFileURL(join(ROOT, 'scripts/.og.html'))})`);

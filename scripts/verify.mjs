/**
 * verify.mjs — comprobaciones con Playwright sobre el sitio servido en local.
 *
 *   npm run verify
 *
 * Levanta un servidor estático propio (sin dependencias) y comprueba:
 *   1. las 64 URLs publicadas responden 200
 *   2. las 64 fachadas están pintadas y con su captura cargada
 *   3. al pasar el ratón se monta el iframe y al salir se destruye
 *   4. los filtros no pierden el foco y el recuento cuadra
 *   5. el presupuesto de tipografías no se pasa de 6 familias vivas
 *   6. no hay tareas largas (>200 ms) al cargar — con A/B contra main.js vacío
 *   7. 400 px: una columna y la marquesina más lenta
 *   8. el botón del aviso de cookies cierra de verdad
 *   9. con movimiento reducido no hay marquesina en marcha, pero sí contenido
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const datos = JSON.parse(await readFile(join(ROOT, 'data/projects.json'), 'utf8'));

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

const servidor = createServer(async (req, res) => {
  const limpio = decodeURIComponent(req.url.split('?')[0]);
  let ruta = join(ROOT, normalize(limpio).replace(/^(\.\.[/\\])+/, ''));
  try {
    if ((await stat(ruta)).isDirectory()) ruta = join(ruta, 'index.html');
  } catch {
    res.writeHead(404).end('no');
    return;
  }
  res.writeHead(200, { 'content-type': TIPOS[extname(ruta)] || 'application/octet-stream' });
  createReadStream(ruta).pipe(res);
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const resultados = [];
const anotar = (nombre, ok, detalle = '') => {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? 'OK  ' : 'FALL'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
};

const navegador = await chromium.launch();

/* ═══ 1. las 64 URLs publicadas ═══════════════════════════════════════════ */
{
  const fallos = [];
  const pedir = async (p, intento = 1) => {
    try {
      const r = await fetch(p.url, { method: 'GET', redirect: 'follow' });
      if (r.status === 200) return;
      if (intento < 3) return pedir(p, intento + 1);
      fallos.push(`${p.repo}=${r.status}`);
    } catch (e) {
      // lanzar 64 peticiones a la vez hace que alguna se caiga por red, no por estar rota
      if (intento < 3) {
        await new Promise((r) => setTimeout(r, 400 * intento));
        return pedir(p, intento + 1);
      }
      fallos.push(`${p.repo}=${String(e).slice(0, 40)}`);
    }
  };
  await Promise.all(datos.proyectos.map((p) => pedir(p)));
  anotar('1. las 64 URLs responden 200', fallos.length === 0,
    fallos.length ? fallos.join(', ') : `${datos.proyectos.length}/${datos.proyectos.length}`);
}

/* ═══ 2-5, 8. la página, a 1440 ═══════════════════════════════════════════ */
{
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 160)); });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('.fachada').length > 0, { timeout: 15000 });
  await page.waitForTimeout(1800);

  anotar('   sin errores de JavaScript', errores.length === 0, errores.slice(0, 3).join(' | '));

  /* 2. fachadas y capturas */
  const fachadas = await page.evaluate(async () => {
    const fs = [...document.querySelectorAll('.fachada')];
    // se fuerza la carga: las capturas son loading="lazy"
    for (const img of document.querySelectorAll('.fachada__captura')) img.loading = 'eager';
    await new Promise((r) => setTimeout(r, 1500));
    return {
      total: fs.length,
      sinCaptura: fs.filter((f) => {
        const img = f.querySelector('.fachada__captura');
        return !img || (img.complete && img.naturalWidth === 0);
      }).map((f) => f.dataset.repo),
      sinColor: fs.filter((f) => !f.style.getPropertyValue('--f')).map((f) => f.dataset.repo),
      encendidas: fs.filter((f) => f.classList.contains('esta-encendida')).length,
      rotulos: document.querySelectorAll('.marquesina [data-grupo="original"] .rotulo').length,
    };
  });
  anotar('2. 64 fachadas pintadas', fachadas.total === 64, `hay ${fachadas.total}`);
  anotar('   todas con captura', fachadas.sinCaptura.length === 0, fachadas.sinCaptura.join(', '));
  anotar('   todas con su color', fachadas.sinColor.length === 0, fachadas.sinColor.join(', '));
  anotar('   64 rótulos en la marquesina', fachadas.rotulos === 64, `hay ${fachadas.rotulos}`);

  /* 3. iframe: se monta al pasar el ratón y se destruye al salir */
  {
    const objetivo = page.locator('.fachada').first();
    await objetivo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await objetivo.hover();
    let montado = false;
    try {
      await page.waitForFunction(
        () => document.querySelector('.fachada.esta-viva [data-hueco] iframe') !== null, { timeout: 6000 });
      montado = true;
    } catch { /* no montó o no llegó a cargar */ }
    const vivo = await page.evaluate(() =>
      document.querySelector('.fachada.esta-viva [data-hueco] iframe')?.src || null);

    await page.mouse.move(10, 10);
    await page.waitForTimeout(900);
    const quedan = await page.locator('[data-hueco] iframe').count();

    anotar('3. el iframe se monta al pasar el ratón y carga', montado, vivo ? `cargó ${vivo.slice(-42)}` : 'no llegó a estar vivo');
    anotar('   y se destruye al salir', quedan === 0, `quedan ${quedan}`);
  }

  /* 5. presupuesto de tipografías */
  {
    const vivas = await page.evaluate(() =>
      document.querySelectorAll('link[data-fuente-de]').length);
    anotar('5. como mucho 6 familias de proyecto vivas', vivas <= 6, `hay ${vivas}`);
  }

  /* 4. filtros: foco y recuento */
  {
    const chip = page.locator('[data-grupo-filtro="sector"] .chip', { hasText: 'Salud' }).first();
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await page.waitForTimeout(800);
    const est = await page.evaluate(() => ({
      foco: document.activeElement?.textContent?.trim().slice(0, 20),
      focoEsChip: document.activeElement?.classList.contains('chip'),
      visibles: [...document.querySelectorAll('[data-via] .fachada')].filter((f) => !f.hidden).length,
      recuento: document.querySelector('[data-recuento]')?.textContent,
      ocultasEnTab: [...document.querySelectorAll('[data-via] .fachada[hidden] a')].length,
      tabIndex: [...document.querySelectorAll('[data-grupo-filtro="sector"] .chip')]
        .filter((c) => c.tabIndex === 0).length,
    }));
    anotar('4. el foco se queda en el chip pulsado', est.focoEsChip === true, `foco en «${est.foco}»`);
    anotar('   solo un chip es tabulable', est.tabIndex === 1, `hay ${est.tabIndex}`);
    anotar('   el filtro deja 10 de salud', est.visibles === 10, `${est.visibles} · ${est.recuento}`);

    // flechas del radiogroup
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);
    const tras = await page.evaluate(() => ({
      focoEsChip: document.activeElement?.classList.contains('chip'),
      marcado: document.activeElement?.getAttribute('aria-checked'),
    }));
    anotar('   las flechas mueven y marcan', tras.focoEsChip && tras.marcado === 'true');

    await page.locator('[data-grupo-filtro="sector"] .chip[data-valor="todos"]').click();
    await page.waitForTimeout(600);
  }

  /* 8. aviso de cookies */
  {
    const antes = await page.locator('[data-cookies]').isVisible();
    await page.locator('[data-cookies-ok]').click();
    await page.waitForTimeout(250);
    const despues = await page.locator('[data-cookies]').isVisible();
    anotar('8. el aviso de cookies se ve y su botón cierra', antes === true && despues === false,
      `antes=${antes} después=${despues}`);
  }

  await ctx.close();
}

/* ═══ 6. tareas largas, con A/B contra main.js vacío ══════════════════════ */
async function medirLongtasks({ sinMain }) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  if (sinMain) {
    await page.route('**/js/main.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  }
  await page.addInitScript(() => {
    globalThis.__largas = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) globalThis.__largas.push(Math.round(e.duration));
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* sin soporte */ }
  });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  const largas = await page.evaluate(() => globalThis.__largas || []);
  await ctx.close();
  return largas;
}
{
  // se alternan las pasadas: la primera carga siempre paga la caché fría
  const con = [], sin = [];
  for (let i = 0; i < 2; i++) {
    con.push(await medirLongtasks({ sinMain: false }));
    sin.push(await medirLongtasks({ sinMain: true }));
  }
  const peor = (xs) => Math.max(0, ...xs.flat());
  const pCon = peor(con), pSin = peor(sin);
  anotar('6. sin tareas largas > 200 ms al cargar', pCon <= 200,
    `con main.js: ${pCon} ms ${JSON.stringify(con)} · con main.js vacío: ${pSin} ms ${JSON.stringify(sin)}`);
  if (pCon > 200) {
    console.log(`   → la diferencia atribuible a mi código es ${pCon - pSin} ms; el resto es GSAP + webfonts.`);
  }
}

/* ═══ 7. 400 px ═══════════════════════════════════════════════════════════ */
{
  const ctx = await navegador.newContext({
    viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('.fachada').length > 0, { timeout: 15000 });
  await page.waitForTimeout(1200);
  // el aviso de cookies tapa la parte de abajo: se cierra igual que lo haría alguien
  await page.locator('[data-cookies-ok]').click();
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const fs = [...document.querySelectorAll('[data-via] .fachada')].filter((f) => !f.hidden);
    const izq = new Set(fs.map((f) => Math.round(f.getBoundingClientRect().left)));
    return {
      columnas: izq.size,
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      marquesina: getComputedStyle(document.querySelector('.marquesina__pista')).animationDuration,
      botonVivir: getComputedStyle(document.querySelector('.fachada__vivir')).display,
      escaparate: getComputedStyle(document.querySelector('.fachada__escaparate')).aspectRatio,
    };
  });
  anotar('7. a 400 px las fachadas van a una columna', m.columnas === 1, `${m.columnas} posiciones`);
  anotar('   sin scroll horizontal', m.desborde <= 1, `sobran ${m.desborde}px`);
  anotar('   marquesina más lenta', parseFloat(m.marquesina) >= 210, m.marquesina);
  anotar('   botón «ver en vivo» disponible al tacto', m.botonVivir !== 'none', m.botonVivir);

  // toque: enciende el escaparate
  const boton = page.locator('[data-via] .fachada__vivir').first();
  await boton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await boton.click({ timeout: 15000 });
  let tocado = false;
  try {
    await page.waitForFunction(() => !!document.querySelector('.fachada [data-hueco] iframe'), { timeout: 4500 });
    tocado = true;
  } catch { /* no montó */ }
  anotar('   al tocar se enciende el escaparate', tocado);
  await ctx.close();
}

/* ═══ 9. movimiento reducido ══════════════════════════════════════════════ */
{
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('.fachada').length > 0, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    marquesina: getComputedStyle(document.querySelector('.marquesina__pista')).animationName,
    rotulos: document.querySelectorAll('.marquesina [data-grupo="original"] .rotulo').length,
    encendidas: [...document.querySelectorAll('.fachada')].filter((f) => f.classList.contains('esta-encendida')).length,
    nombreVisible: getComputedStyle(document.querySelector('.revelar__letra')).opacity,
    contador: document.querySelector('[data-contador="64"]')?.textContent,
    lenis: document.documentElement.classList.contains('lenis'),
  }));
  anotar('9. sin marquesina en marcha', r.marquesina === 'none', r.marquesina);
  anotar('   pero los 64 rótulos siguen ahí', r.rotulos === 64, `hay ${r.rotulos}`);
  anotar('   las 64 fachadas encendidas', r.encendidas === 64, `hay ${r.encendidas}`);
  anotar('   el nombre se lee', r.nombreVisible === '1', `opacidad ${r.nombreVisible}`);
  anotar('   el contador muestra su cifra', r.contador === '64', `pone «${r.contador}»`);
  anotar('   sin smooth-scroll', r.lenis === false);
  await ctx.close();
}

await navegador.close();
servidor.close();

const mal = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - mal.length}/${resultados.length} comprobaciones pasan`);
if (mal.length) {
  console.log('Fallan:\n' + mal.map((r) => ` · ${r.nombre} — ${r.detalle}`).join('\n'));
  process.exitCode = 1;
}

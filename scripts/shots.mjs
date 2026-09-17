/**
 * shots.mjs — regenera las capturas de los escaparates.
 *
 * Lee data/projects.json y, para cada proyecto, captura el hero a 1440×900 y a
 * 390×844, y las guarda optimizadas en assets/shots/<repo>-{desktop,mobile}.webp
 * con un tope duro de 150 KB por fichero.
 *
 *   npm run shots                 → todos
 *   npm run shots -- <repo> ...   → solo esos
 *   npm run shots -- --missing    → solo los que falten
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'assets/shots');
mkdirSync(SHOTS, { recursive: true });

const MAX_BYTES = 150 * 1024;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const projects = JSON.parse(readFileSync(join(ROOT, 'data/projects.json'), 'utf8')).proyectos;
const args = process.argv.slice(2);
const onlyMissing = args.includes('--missing');
const names = args.filter((a) => !a.startsWith('--'));
let targets = names.length ? projects.filter((p) => names.includes(p.repo)) : projects;
if (onlyMissing) {
  targets = targets.filter((p) =>
    Object.keys(VIEWPORTS).some((k) => !existsSync(join(SHOTS, `${p.repo}-${k}.webp`)))
  );
}

/** Baja la calidad hasta entrar en el presupuesto; nunca por debajo de 40. */
async function toWebp(png, outPath, width) {
  let quality = 78;
  let out = null;
  for (; quality >= 40; quality -= 8) {
    out = await sharp(png)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer();
    if (out.length <= MAX_BYTES) break;
  }
  writeFileSync(outPath, out);
  return { bytes: out.length, quality };
}

const browser = await chromium.launch();
const report = [];

for (const p of targets) {
  for (const [kind, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor ?? 1,
      isMobile: !!vp.isMobile,
      hasTouch: !!vp.hasTouch,
      userAgent: vp.isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    const out = join(SHOTS, `${p.repo}-${kind}.webp`);
    try {
      await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.evaluate(() => document.fonts?.ready).catch(() => {});
      // margen para que el intro del hero termine antes de disparar
      await page.waitForTimeout(3800);
      // fuera cualquier aviso de cookies: tapa el escaparate
      await page.evaluate(() => {
        // Cada web hermana llama a su aviso de una forma (.cookie-banner, .ck,
        // #cookies…), así que no vale un selector de clases: se busca por lo
        // que es — una caja fija, pequeña y con la palabra "cookie" dentro.
        // Ojo con <body class="has-cookie-banner">: con un [class*="cookie"]
        // suelto se oculta la página entera y la captura sale en blanco.
        for (const el of document.body.querySelectorAll('div, aside, section, dialog, footer')) {
          if (el === document.body) continue;
          const cs = getComputedStyle(el);
          if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
          const r = el.getBoundingClientRect();
          if (r.height > innerHeight * 0.6 || r.height < 24) continue;
          if (!/cookie/i.test(el.textContent || '')) continue;
          el.style.setProperty('display', 'none', 'important');
        }
      });
      await page.waitForTimeout(250);
      const png = await page.screenshot({ type: 'png' });

      // Guardia contra capturas en blanco: una web de verdad nunca sale lisa.
      // (Aquí se coló una vez un selector de cookies que ocultaba el <body>.)
      const stats = await sharp(png).stats();
      const variacion = Math.max(...stats.channels.map((c) => c.stdev));
      if (variacion < 6) {
        report.push({ repo: p.repo, kind, ok: false, error: `captura lisa (stdev ${variacion.toFixed(1)})` });
        console.log(`FAIL ${p.repo.padEnd(48)} ${kind.padEnd(8)} captura lisa — stdev ${variacion.toFixed(1)}`);
        await ctx.close();
        continue;
      }

      const { bytes, quality } = await toWebp(png, out, vp.width * (vp.deviceScaleFactor ?? 1) > 1440 ? 1440 : vp.width * (vp.deviceScaleFactor ?? 1));
      report.push({ repo: p.repo, kind, ok: true, kb: +(bytes / 1024).toFixed(1), quality });
      console.log(`ok   ${p.repo.padEnd(48)} ${kind.padEnd(8)} ${(bytes / 1024).toFixed(1)} KB  q${quality}`);
    } catch (e) {
      report.push({ repo: p.repo, kind, ok: false, error: String(e).slice(0, 120) });
      console.log(`FAIL ${p.repo} ${kind} — ${String(e).slice(0, 120)}`);
    }
    await ctx.close();
  }
}

await browser.close();

const bad = report.filter((r) => !r.ok);
const heavy = report.filter((r) => r.ok && r.kb > 150);
console.log(`\n${report.filter((r) => r.ok).length}/${report.length} capturas`);
if (heavy.length) console.log(`pesadas: ${heavy.map((r) => `${r.repo}-${r.kind} ${r.kb}KB`).join(', ')}`);
if (bad.length) {
  console.log(`fallos: ${bad.map((r) => `${r.repo}-${r.kind}`).join(', ')}`);
  process.exitCode = 1;
}
// inventario para que verify.mjs no tenga que adivinar
writeFileSync(join(ROOT, 'scripts/shots-report.json'), JSON.stringify(report, null, 2));

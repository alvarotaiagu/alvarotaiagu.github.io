/**
 * extract.mjs — visita cada web publicada y saca los datos que luego pinta el
 * portfolio: <title>, meta description, color principal, tipografía de
 * titulares y su origen (Google Fonts / self-hosted), y si permite embeberse
 * en un iframe.
 *
 * Los datos se escriben en scripts/extracted.json. El catálogo final
 * (data/projects.json) lo genera build-projects.mjs mezclando seed + extracted
 * + las correcciones a mano de scripts/overrides.json.
 *
 *   node scripts/extract.mjs [repo ...]
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://alvarotaiagu.github.io';
const seed = JSON.parse(readFileSync(join(ROOT, 'scripts/seed.json'), 'utf8'));
const only = process.argv.slice(2);
const targets = only.length ? seed.filter((p) => only.includes(p.repo)) : seed;

const OUT = join(ROOT, 'scripts/extracted.json');
const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

// Lo que corre dentro de la página. Devuelve candidatos, no veredictos:
// el color definitivo se confirma mirando la captura.
const probe = () => {
  const px = (v) => parseFloat(v) || 0;
  const toRgb = (s) => {
    if (!s) return null;
    const m = String(s).trim().match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && (p[3] === undefined || p[3] > 0.5)) return { r: p[0], g: p[1], b: p[2] };
      return null;
    }
    const h = String(s).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (h) {
      let x = h[1];
      if (x.length === 3) x = x.split('').map((c) => c + c).join('');
      return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16) };
    }
    return null;
  };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const hsl = (c) => {
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const l = (mx + mn) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
    }
    return { h: ((h * 60) + 360) % 360, s, l };
  };
  // "Cromático y usable sobre fondo oscuro": ni gris, ni casi negro, ni papel.
  const chroma = (c) => {
    const { s, l } = hsl(c);
    if (s < 0.22) return 0;
    if (l < 0.12 || l > 0.92) return 0;
    return s * (1 - Math.abs(l - 0.55) * 0.8);
  };

  const H = innerHeight, W = innerWidth;

  // 1) Variables CSS con pinta de acento en :root / :root oscuro.
  const vars = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules || [])) {
      if (!rule.style || !rule.selectorText) continue;
      if (!/^(:root|html|body)\b/.test(rule.selectorText)) continue;
      for (const prop of Array.from(rule.style)) {
        if (!prop.startsWith('--')) continue;
        const raw = rule.style.getPropertyValue(prop).trim();
        const c = toRgb(raw) || toRgb(getComputedStyle(document.documentElement).getPropertyValue(prop).trim());
        if (c && chroma(c) > 0) vars.push({ prop, value: hex(c), chroma: +chroma(c).toFixed(3) });
      }
    }
  }
  const NAMED = /acento|accent|brand|primary|principal|dorado|oro|gold|cobre|copper|ambar|amber|neon|highlight|destac|marca/i;
  vars.sort((a, b) => (NAMED.test(b.prop) - NAMED.test(a.prop)) || b.chroma - a.chroma);

  // 2) Barrido por área del primer viewport: fondos y texto.
  const tally = new Map();
  const add = (c, weight) => {
    const k = chroma(c);
    if (!k) return;
    const key = hex(c);
    tally.set(key, (tally.get(key) || 0) + weight * k);
  };
  for (const el of Array.from(document.body.querySelectorAll('*')).slice(0, 4000)) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || r.width < 4 || r.height < 4) continue;
    const vis = Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0)) * Math.min(r.width, W);
    if (vis < 200) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const bg = toRgb(cs.backgroundColor);
    if (bg) add(bg, vis / (W * H));
    const bgi = cs.backgroundImage;
    if (bgi && bgi !== 'none') {
      for (const m of bgi.matchAll(/rgba?\([^)]+\)|#[0-9a-f]{6}\b/gi)) {
        const c = toRgb(m[0]);
        if (c) add(c, (vis / (W * H)) * 0.5);
      }
    }
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      const c = toRgb(cs.color);
      // el texto pesa por tinta, no por caja
      if (c) add(c, Math.min(vis, px(cs.fontSize) * 14 * el.textContent.trim().length * 0.35) / (W * H) * 2.2);
    }
    if (el instanceof SVGElement) {
      for (const k of ['fill', 'stroke']) {
        const c = toRgb(cs[k]);
        if (c) add(c, (vis / (W * H)) * 0.7);
      }
    }
    const bc = toRgb(cs.borderTopColor);
    if (bc && px(cs.borderTopWidth) > 0) add(bc, (vis / (W * H)) * 0.3);
  }
  const scan = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([value, score]) => ({ value, score: +score.toFixed(4) }));

  // 3) Tipografía de titulares: el h1 manda; si no, el texto más grande del hero.
  const headingEl = (() => {
    const h1 = document.querySelector('h1');
    if (h1 && h1.getBoundingClientRect().height > 0) return h1;
    let best = null, bestSize = 0;
    for (const el of document.body.querySelectorAll('h1,h2,.hero *,header *')) {
      const r = el.getBoundingClientRect();
      if (r.top > H || r.height < 8) continue;
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const size = px(getComputedStyle(el).fontSize);
      if (size > bestSize) { bestSize = size; best = el; }
    }
    return best;
  })();
  const headCS = headingEl ? getComputedStyle(headingEl) : null;
  const firstFamily = (ff) => (ff || '').split(',')[0].trim().replace(/^["']|["']$/g, '');

  // 4) De dónde salen las fuentes.
  const googleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((l) => l.href).filter((h) => /fonts\.googleapis\.com/.test(h));
  const faces = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules || [])) {
      if (rule.constructor.name === 'CSSFontFaceRule' || rule.type === 5) {
        faces.push({
          family: firstFamily(rule.style.getPropertyValue('font-family')),
          src: (rule.style.getPropertyValue('src') || '').slice(0, 300),
          sheet: sheet.href || 'inline',
        });
      }
    }
  }

  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || '',
    lang: document.documentElement.lang || '',
    themeColor: document.querySelector('meta[name="theme-color"]')?.content || '',
    ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    heading: headCS ? {
      tag: headingEl.tagName.toLowerCase(),
      text: headingEl.textContent.trim().replace(/\s+/g, ' ').slice(0, 80),
      family: firstFamily(headCS.fontFamily),
      stack: headCS.fontFamily,
      weight: headCS.fontWeight,
      style: headCS.fontStyle,
      size: Math.round(px(headCS.fontSize)),
      letterSpacing: headCS.letterSpacing,
      transform: headCS.textTransform,
      color: headCS.color,
    } : null,
    vars: vars.slice(0, 8),
    scan,
    googleLinks,
    faces: faces.slice(0, 12),
    h1Count: document.querySelectorAll('h1').length,
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});

for (const p of targets) {
  const url = `${BASE}/${p.repo}/`;
  const page = await ctx.newPage();
  const rec = { repo: p.repo, url, checkedAt: new Date().toISOString() };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    rec.status = res?.status() ?? 0;
    rec.headers = {
      'x-frame-options': res?.headers()['x-frame-options'] || null,
      'content-security-policy': res?.headers()['content-security-policy'] || null,
    };
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(3500); // que termine el intro del hero
    Object.assign(rec, await page.evaluate(probe));
    rec.pageErrors = errors.slice(0, 4);
    console.log(
      `${String(rec.status).padEnd(4)} ${p.repo.padEnd(48)} ${(rec.heading?.family || '—').padEnd(22)} ` +
      `theme=${(rec.themeColor || '—').padEnd(9)} var=${(rec.vars[0]?.value || '—').padEnd(8)} scan=${rec.scan[0]?.value || '—'}`
    );
  } catch (e) {
    rec.error = String(e).slice(0, 200);
    console.log(`ERR  ${p.repo}  ${rec.error}`);
  }
  store[p.repo] = rec;
  await page.close();
  writeFileSync(OUT, JSON.stringify(store, null, 2));
}

await browser.close();
console.log(`\n→ ${OUT}  (${Object.keys(store).length} webs)`);

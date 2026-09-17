/**
 * build-projects.mjs — compone data/projects.json a partir de:
 *   scripts/seed.json       (sector, tipo, concepto: a mano)
 *   scripts/extracted.json  (title, description, color, tipografía: de la web real)
 *   scripts/overrides.json  (correcciones mías tras mirar las capturas)
 *
 * Además calcula, para cada proyecto, el color del rótulo: el color real de la
 * web casi nunca se lee sobre #0B0D12, así que se sube su luminosidad en OKLCH
 * conservando tono y croma hasta llegar a 4,5:1. El color original se mantiene
 * intacto para el halo del escaparate.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOCHE = '#0B0D12';

const seed = JSON.parse(readFileSync(join(ROOT, 'scripts/seed.json'), 'utf8'));
const ext = JSON.parse(readFileSync(join(ROOT, 'scripts/extracted.json'), 'utf8'));
const ov = existsSync(join(ROOT, 'scripts/overrides.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'scripts/overrides.json'), 'utf8'))
  : {};

/* ---------- color ---------- */
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const hexToRgb = (h) => {
  let x = h.replace('#', '');
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
};
const rgbToHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

function rgbToOklab([r, g, b]) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToRgb([L, a, bb]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  return [
    linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
const inGamut = (rgb) => rgb.every((v) => v >= -0.001 && v <= 1.001);
const relLum = ([r, g, b]) => 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
const contrast = (a, b) => {
  const [x, y] = [relLum(a) + 0.05, relLum(b) + 0.05].sort((p, q) => q - p);
  return x / y;
};

/**
 * Sube el color por la rampa de luminosidad OKLCH (tono y croma fijos, croma
 * recortado si se sale de gama) hasta que contrasta >= ratio sobre el fondo.
 *
 * El objetivo es 3:1, que es el umbral WCAG para texto grande, y los rótulos
 * de fachada van entre 24 y 38 px. Con 4,5:1 los granates y los rojos oscuros
 * (Ceibo, Castro Pombo, Jayce) acababan en malvas lavados: al subir la
 * luminosidad, el croma que cabe en gama baja, así que forzar más contraste es
 * literalmente quitarles el color.
 */
function lift(hex, bg = NOCHE, ratio = 3) {
  const base = hexToRgb(hex);
  const bgRgb = hexToRgb(bg);
  const r0 = contrast(base, bgRgb);
  if (r0 >= ratio) return { hex: hex.toUpperCase(), ratio: +r0.toFixed(2), subido: false };

  const [, a, b] = rgbToOklab(base);
  const C0 = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const enC = (L, c) => oklabToRgb([L, Math.cos(h) * c, Math.sin(h) * c]);

  /** Croma máximo que cabe en sRGB para ese tono y esa luminosidad. */
  const tope = (L) => {
    let lo = 0, hi = 0.42;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(enC(L, mid))) lo = mid; else hi = mid;
    }
    return lo;
  };

  for (let L = 0.38; L <= 0.98; L += 0.004) {
    // Al subir por la rampa, el croma que cabe en gama baja: si se conserva el
    // croma original el rojo acaba en malva. Un rótulo encendido puede
    // saturar más que la marca impresa, así que se pega al borde de gama —
    // sin pasar de 1,3× el croma original, para no volver neón un verde salvia.
    const c = Math.min(tope(L), Math.max(C0, C0 * 1.3));
    const rgb = enC(L, c);
    if (!inGamut(rgb)) continue;
    const r = contrast(rgb, bgRgb);
    if (r >= ratio) return { hex: rgbToHex(rgb), ratio: +r.toFixed(2), subido: true };
  }
  return { hex: '#F3EFE6', ratio: +contrast(hexToRgb('#F3EFE6'), bgRgb).toFixed(2), subido: true };
}

const chromaOf = (hex) => {
  const [, a, b] = rgbToOklab(hexToRgb(hex));
  return Math.hypot(a, b);
};

/* ---------- elección del color principal ---------- */
const okL = (hex) => rgbToOklab(hexToRgb(hex))[0];

/**
 * Orden de confianza, de más a menos:
 *   1. una variable CSS que el propio sitio llama "acento", "brand", etc.
 *   2. meta theme-color, si es cromático y ni casi blanco ni casi negro
 *      (en las webs claras theme-color suele ser el papel, no la marca)
 *   3. el color con más presencia en el primer viewport
 *   4. la primera variable cromática que haya
 * Lo que salga se confirma mirando la captura y, si falla, se corrige en
 * scripts/overrides.json.
 */
const NAMED = /acento|accent|brand|primary|principal|marca|destac|highlight|senal|se(ñ|n)al/i;

function pickColor(rec) {
  const util = (hex) => chromaOf(hex) > 0.045 && okL(hex) > 0.22 && okL(hex) < 0.93;

  const named = (rec.vars || []).find((v) => NAMED.test(v.prop) && util(v.value));
  if (named) return { color: named.value, fuenteColor: `var(${named.prop})` };

  const theme = (rec.themeColor || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(theme) && util(theme.toUpperCase())) {
    return { color: theme.toUpperCase(), fuenteColor: 'theme-color' };
  }

  const scan = (rec.scan || []).find((s) => util(s.value));
  if (scan) return { color: scan.value, fuenteColor: 'barrido del hero' };

  const anyVar = (rec.vars || []).find((v) => util(v.value));
  if (anyVar) return { color: anyVar.value, fuenteColor: `var(${anyVar.prop})` };

  return { color: '#F3EFE6', fuenteColor: 'sin color propio detectado' };
}

/* ---------- tipografía ---------- */
/** Reconstruye una URL de Google Fonts mínima: solo la familia del titular, su peso y su texto. */
function fontSpec(rec, familia) {
  const plus = familia.replace(/ /g, '+');
  for (const link of rec.googleLinks || []) {
    const spec = new URL(link).searchParams.getAll('family')
      .find((f) => f.split(':')[0] === plus || f.split(':')[0] === familia);
    if (spec) return spec;
  }
  return null;
}

const GENERIC = (stack) =>
  /monospace/.test(stack) ? 'monospace' : /serif/.test(stack) && !/sans-serif/.test(stack) ? 'serif' : 'sans-serif';

/* ---------- fecha real de cada proyecto ---------- */
function anioDe(repo) {
  const dir = join(ROOT, '..', repo);
  try {
    const out = execFileSync('git', ['-C', dir, 'log', '--reverse', '--format=%ad', '--date=format:%Y'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    const y = out.trim().split('\n')[0];
    if (/^\d{4}$/.test(y)) return y;
  } catch { /* repo sin clonar aquí */ }
  // el repo puede no estar clonado en esta máquina: se pregunta a GitHub
  try {
    const j = JSON.parse(execFileSync('gh', ['api', `repos/alvarotaiagu/${repo}`, '--jq', '{createdAt:.created_at}'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }));
    const y = String(j.createdAt).slice(0, 4);
    if (/^\d{4}$/.test(y)) return y;
  } catch { /* sin gh o sin red */ }
  return null;
}

/* ---------- montaje ---------- */
const SECTORES = [
  { id: 'hosteleria', nombre: 'Hostelería', rotulo: 'HOSTELERÍA' },
  { id: 'salud', nombre: 'Salud', rotulo: 'SALUD' },
  { id: 'legal', nombre: 'Asesorías y legal', rotulo: 'ASESORÍAS Y LEGAL' },
  { id: 'comercio', nombre: 'Comercio, educación y servicios', rotulo: 'COMERCIO, EDUCACIÓN Y SERVICIOS' },
  { id: 'plantillas', nombre: 'Plantillas por sector', rotulo: 'PLANTILLAS POR SECTOR' },
];

const avisos = [];
const proyectos = seed.map((p) => {
  const rec = ext[p.repo] || {};
  const o = ov[p.repo] || {};
  if (rec.status !== 200) avisos.push(`${p.repo}: status ${rec.status ?? 'sin datos'}`);

  const picked = pickColor(rec);
  const color = (o.color || picked.color).toUpperCase();
  const rot = lift(color);

  const h = rec.heading || {};
  const familia = o.fuente?.familia || h.family || null;
  const stack = o.fuente?.stack || h.stack || null;
  const peso = o.fuente?.peso || (h.weight && h.weight !== 'normal' ? Number(h.weight) : 400);
  const estilo = o.fuente?.estilo || h.style || 'normal';
  const nombre = o.nombre || p.nombre;
  const spec = familia ? fontSpec(rec, familia) : null;
  if (familia && !spec) {
    avisos.push(`${p.repo}: "${familia}" no viene de Google Fonts — el rótulo se queda en la pila de respaldo`);
  }

  const anio = o.anio || anioDe(p.repo);
  if (!anio) avisos.push(`${p.repo}: sin repo local, año sin determinar`);

  return {
    repo: p.repo,
    nombre,
    sector: o.sector || p.sector,
    tipo: o.tipo || p.tipo,
    concepto: o.concepto || p.concepto,
    estado: o.estado || 'propuesta',
    anio: anio || 'PENDIENTE',
    url: `https://alvarotaiagu.github.io/${p.repo}/`,
    codigo: `https://github.com/alvarotaiagu/${p.repo}`,
    titulo: o.titulo || rec.title || '',
    descripcion: o.descripcion || rec.description || '',
    idioma: rec.lang || '',
    color,
    colorRotulo: rot.hex,
    colorContraste: rot.ratio,
    colorOrigen: o.color ? 'corregido a mano' : picked.fuenteColor,
    fuente: {
      familia: familia || 'PENDIENTE',
      // la pila completa de la web original: hasta que llega la webfont el
      // rótulo ya se ve con un respaldo del mismo género, no con mi serif
      stack: stack || 'Georgia, serif',
      generica: GENERIC(stack || 'serif'),
      peso,
      estilo,
      spec,
      id: spec ? `${familia}|${peso}|${estilo}` : null,
    },
    capturas: {
      desktop: `assets/shots/${p.repo}-desktop.webp`,
      mobile: `assets/shots/${p.repo}-mobile.webp`,
    },
  };
});

/* ---------- las familias, agrupadas ---------- */
/**
 * Varios proyectos comparten familia (Fraunces sale en ocho). Si cada uno
 * pidiera su propia hoja con &text=, dos @font-face con los mismos
 * descriptores se pisarían y el segundo se quedaría sin glifos. Así que se
 * agrupan por familia+peso+estilo y se pide UNA hoja subsetada a la unión de
 * los caracteres de todos sus rótulos. El presupuesto de "6 familias vivas"
 * del cargador cuenta estas entradas, no los proyectos.
 */
const fuentes = {};
for (const p of proyectos) {
  const id = p.fuente.id;
  if (!id) continue;
  (fuentes[id] ??= {
    familia: p.fuente.familia, peso: p.fuente.peso, estilo: p.fuente.estilo,
    spec: p.fuente.spec, repos: [], texto: '',
  }).repos.push(p.repo);
  fuentes[id].texto += p.nombre;
}
for (const [id, f] of Object.entries(fuentes)) {
  // unión de caracteres, sin repetir, más los signos que pueda meter el HTML
  const chars = [...new Set((f.texto + ' ·&.').split(''))].sort().join('');
  const u = new URL('https://fonts.googleapis.com/css2');
  u.searchParams.set('family', f.spec);
  u.searchParams.set('display', 'swap');
  u.searchParams.set('text', chars);
  f.css = u.toString();
  f.texto = chars;
  delete f.spec;
}
for (const p of proyectos) delete p.fuente.spec;

const out = {
  generado: new Date().toISOString().slice(0, 10),
  nota: 'Estado "propuesta" = rediseño hecho por iniciativa propia, no encargo. Solo se marca "entregada" donde Álvaro lo confirma.',
  base: { sitio: 'https://alvarotaiagu.github.io', codigo: 'https://github.com/alvarotaiagu' },
  sectores: SECTORES.map((s) => ({ ...s, total: proyectos.filter((p) => p.sector === s.id).length })),
  fuentes,
  proyectos,
};

writeFileSync(join(ROOT, 'data/projects.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`data/projects.json — ${proyectos.length} proyectos`);
console.table(
  proyectos.map((p) => ({
    repo: p.repo.slice(0, 40), color: p.color, rotulo: p.colorRotulo, ratio: p.colorContraste,
    origen: p.colorOrigen, fuente: p.fuente.familia, gf: p.fuente.id ? 'sí' : 'NO',
  }))
);
if (avisos.length) console.log('\nAvisos:\n' + avisos.map((a) => ' · ' + a).join('\n'));

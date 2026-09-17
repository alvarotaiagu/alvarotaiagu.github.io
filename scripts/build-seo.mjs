/**
 * build-seo.mjs — escribe en el HTML estático lo que los buscadores tienen que
 * ver sin ejecutar JavaScript:
 *   · el JSON-LD ItemList con un CreativeWork por proyecto
 *   · sitemap.xml
 *
 * El texto de cada CreativeWork dice que es una propuesta salvo donde
 * projects.json marque "entregada": la honestidad tiene que estar también en
 * los datos estructurados, no solo en la página.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const datos = JSON.parse(readFileSync(join(ROOT, 'data/projects.json'), 'utf8'));
const SITIO = datos.base.sitio.replace(/\/$/, '');

const obras = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Rúa — 39 webs para negocios de Carballo y Bergantiños',
  numberOfItems: datos.proyectos.length,
  itemListElement: datos.proyectos.map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'CreativeWork',
      '@id': `${SITIO}/#${p.repo}`,
      name: `${p.nombre} — ${p.tipo}`,
      headline: p.titulo || undefined,
      description: p.estado === 'entregada'
        ? `Web entregada a ${p.nombre} (${p.tipo}). Concepto: ${p.concepto}.`
        : `Propuesta de rediseño hecha por iniciativa propia para ${p.nombre} (${p.tipo}), sin encargo del negocio. Concepto: ${p.concepto}.`,
      url: p.url,
      image: `${SITIO}/${p.capturas.desktop}`,
      inLanguage: p.idioma || 'es',
      genre: datos.sectores.find((s) => s.id === p.sector)?.nombre,
      creativeWorkStatus: p.estado === 'entregada' ? 'Published' : 'Unsolicited redesign proposal',
      author: { '@id': `${SITIO}/#alvaro` },
      codeRepository: p.codigo,
    },
  })),
};

/* ── JSON-LD dentro del HTML ── */
const htmlPath = join(ROOT, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
const marca = /(<script type="application\/ld\+json" data-jsonld-obras>)[\s\S]*?(<\/script>)/;
if (!marca.test(html)) throw new Error('no encuentro el hueco data-jsonld-obras en index.html');
html = html.replace(marca, `$1\n${JSON.stringify(obras, null, 1)}\n$2`);
writeFileSync(htmlPath, html);

/* ── sitemap ── */
const hoy = datos.generado;
const urls = [
  { loc: `${SITIO}/`, prioridad: '1.0' },
  { loc: `${SITIO}/data/projects.json`, prioridad: '0.2' },
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${hoy}</lastmod>
    <priority>${u.prioridad}</priority>
  </url>`).join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

console.log(`JSON-LD: ${obras.numberOfItems} CreativeWork · sitemap: ${urls.length} URL`);
console.log(`(las 39 webs viven en sus propios repositorios y tienen su propio sitio; aquí se enlazan, no se reclaman)`);

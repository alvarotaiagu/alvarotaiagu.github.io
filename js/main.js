/* ════════════════════════════════════════════════════════════════════════
   Rúa — orquestador.

   Orden a propósito: primero lo que se ve (calle, marquesina), luego el
   movimiento. Todo arranca en DOMContentLoaded, que es cuando ya han corrido
   los scripts diferidos de GSAP, ScrollTrigger y Lenis.
   ════════════════════════════════════════════════════════════════════════ */

import { PERFIL, MAX_FUENTES } from './config.js';
import { crearCargador, vigilarFuentes } from './fuentes.js';
import { pintarCalle, montarFiltros } from './calle.js';
import { montarMarquesina } from './marquesina.js';
import { montarFormulario, usaTerceros } from './formulario.js';
import {
  montarCortina, montarScroll, animarRevelados, montarParallax,
  montarMagneticos, montarContadores, montarBarra,
} from './motion.js';

const listo = () => new Promise((r) => {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', r, { once: true });
  else r();
});

/* ── datos del perfil que ya estén rellenos ────────────────────────────── */
function aplicarPerfil() {
  const poner = (selector, valor, comoEnlace) => {
    if (!valor) return;
    for (const el of document.querySelectorAll(selector)) {
      const hueco = el.closest('li, dd, p') || el;
      if (comoEnlace) {
        const a = document.createElement('a');
        a.className = 'enlace';
        a.href = comoEnlace(valor);
        a.textContent = valor;
        a.rel = 'noopener';
        el.replaceWith(a);
      } else {
        el.replaceWith(document.createTextNode(valor));
      }
      hueco.classList.add('ya-relleno');
    }
  };
  poner('.hero__apellidos', PERFIL.apellidos);
  poner('[title*="apellidos"]', PERFIL.apellidos);
}

/* ── aviso de cookies ──────────────────────────────────────────────────── */
/**
 * La web no pone cookies propias ni analítica. Aun así carga tipografías de
 * Google Fonts y, si se configura Formspree, manda datos a un tercero: eso se
 * avisa. El botón cierra de verdad — `[hidden]` gana porque en el CSS está
 * escrito `.aviso-cookies[hidden] { display: none }`.
 */
function montarCookies() {
  const caja = document.querySelector('[data-cookies]');
  if (!caja) return;
  const LLAVE = 'rua:aviso-visto';

  let visto = false;
  try { visto = localStorage.getItem(LLAVE) === '1'; } catch { /* modo privado */ }
  if (visto) return;

  caja.hidden = false;
  if (usaTerceros()) {
    const t = caja.querySelector('.aviso-cookies__texto');
    if (t) t.insertAdjacentHTML('beforeend',
      ' El formulario de contacto se envía a través de Formspree, que recibe lo que escribas en él.');
  }

  caja.querySelector('[data-cookies-ok]')?.addEventListener('click', () => {
    caja.hidden = true;
    try { localStorage.setItem(LLAVE, '1'); } catch { /* da igual: se volverá a ver */ }
  });
}

/* ── arranque ──────────────────────────────────────────────────────────── */
async function arrancar() {
  // la cortina, lo primero: tiene que estar puesta antes de pintar nada
  const cortina = montarCortina();
  aplicarPerfil();
  montarCookies();

  let datos;
  try {
    const res = await fetch('data/projects.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    datos = await res.json();
  } catch (e) {
    const cargando = document.querySelector('[data-cargando]');
    if (cargando) {
      cargando.innerHTML = 'No he podido cargar <a class="enlace" href="data/projects.json">data/projects.json</a>. '
        + 'La lista completa de las 39 webs está ahí.';
    }
    console.error('[rúa] projects.json no ha cargado:', e);
    return;
  }

  const cargador = crearCargador(datos.fuentes || {}, MAX_FUENTES);
  const vigilanteCalle = vigilarFuentes(cargador, { margen: '100% 0px' });

  const calle = await pintarCalle(datos, { vigilante: vigilanteCalle });

  const irAFachada = (repo) => {
    let f = document.querySelector(`.fachada[data-repo="${CSS.escape(repo)}"]`);
    if (!f) return;
    if (f.hidden) {
      // estaba filtrada fuera: se quitan los filtros para poder enseñarla
      for (const caja of document.querySelectorAll('[data-grupo-filtro]')) {
        caja.querySelector('.chip[data-valor="todos"]')?.click();
      }
      f = document.querySelector(`.fachada[data-repo="${CSS.escape(repo)}"]`);
    }
    f.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    f.classList.add('esta-encendida', 'se-ilumina');
    setTimeout(() => f.classList.remove('se-ilumina'), 1400);
    f.querySelector('.fachada__abrir')?.focus({ preventScroll: true });
  };

  // la marquesina tiene su propio observador: dentro de ella lo que se mueve
  // es el contenido, no el scroll, así que su `root` es la propia marquesina
  const caja = document.querySelector('[data-marquesina]');
  const vigilanteMarquesina = vigilarFuentes(cargador, { root: caja, margen: '5% 0px', retraso: 5000 });
  montarMarquesina(datos, { vigilante: vigilanteMarquesina, irAFachada });

  montarFiltros(datos, { via: calle?.via, alFiltrar: () => globalThis.ScrollTrigger?.refresh() });
  montarFormulario(datos);

  // el movimiento, al final y con las fuentes ya resueltas: así el reveal no
  // se anima sobre métricas que van a cambiar
  const rematar = () => {
    montarScroll();
    /* el rótulo no se revela hasta que la luz empieza a recorrer la calle:
       lo primero que se ve al encenderse ya está en movimiento */
    cortina.alAbrirse(animarRevelados);
    montarMagneticos();
    montarContadores();
    montarBarra();
    // el parallax monta 39 ScrollTriggers y mide la calle entera: fuera del arranque
    if (globalThis.requestIdleCallback) requestIdleCallback(montarParallax, { timeout: 1500 });
    else setTimeout(montarParallax, 400);
  };

  if (document.fonts?.ready) document.fonts.ready.then(rematar);
  else rematar();

  // para la verificación con Playwright
  globalThis.__rua = { datos, cargador, irAFachada };
}

listo().then(arrancar);

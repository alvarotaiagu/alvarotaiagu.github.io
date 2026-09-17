/* ════════════════════════════════════════════════════════════════════════
   Escaparates vivos.

   Al pasar el ratón por una fachada (o al pulsar «ver en vivo» en táctil) se
   mete la web real en un iframe escalado dentro del marco. Reglas:
     · uno solo encendido a la vez;
     · se crea con retardo, para que pasar de largo no cargue nada;
     · si en LIMITE ms no ha cargado, se queda la captura y la fachada se
       marca como «sin vista en vivo»;
     · al salir, el iframe se destruye — no se esconde.

   El iframe no recibe puntero: la fachada entera sigue siendo un enlace.
   ════════════════════════════════════════════════════════════════════════ */

import { ESPERA_HOVER, LIMITE_IFRAME } from './config.js';

/* El iframe se monta con la medida del dispositivo que toque: meter un
   layout de 1440 px en un marco vertical de móvil no enseña la web, enseña
   una maqueta encogida. */
const ESTRECHO = '(max-width: 52rem)';
const base = () => (matchMedia(ESTRECHO).matches
  ? { ancho: 390, alto: 844 }
  : { ancho: 1440, alto: 900 });

let activa = null;      // la .fachada encendida
let temporizador = null;

const puedeFlotar = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

function escalar(fachada) {
  const hueco = fachada.querySelector('.fachada__escaparate');
  if (!hueco) return;
  const { width, height } = hueco.getBoundingClientRect();
  if (!width) return;
  const { ancho, alto } = base();
  // se escala por el lado que más falte, para que no queden franjas
  const escala = Math.max(width / ancho, height / alto);
  fachada.style.setProperty('--escala', escala.toFixed(4));
  fachada.style.setProperty('--iframe-ancho', `${ancho}px`);
  fachada.style.setProperty('--iframe-alto', `${alto}px`);
}

/** Las webs de la calle son del mismo origen: se les puede quitar su propio
 *  aviso de cookies, que si no tapa medio escaparate. */
function limpiarAviso(iframe) {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;
    // cuidado con el selector: <body class="has-cookie-banner"> existe en
    // varias de estas webs y un [class*="cookie"] suelto ocultaría el body
    const SEL = '.cookie-banner, .cookies-banner, .banner-cookies, .aviso-cookies, .cookie-consent,'
      + ' #cookie-banner, #cookies, [data-cookies], [data-cookie-banner], [class^="cookie"], [class*=" cookie"]';
    for (const el of doc.querySelectorAll(SEL)) {
      if (el === doc.body || el === doc.documentElement) continue;
      el.style.setProperty('display', 'none', 'important');
    }
  } catch {
    /* otro origen o documento aún sin montar: se deja tal cual */
  }
}

export function apagar() {
  clearTimeout(temporizador);
  temporizador = null;
  if (!activa) return;
  const fachada = activa;
  activa = null;
  fachada.classList.remove('esta-viva', 'esta-cargando');
  const hueco = fachada.querySelector('[data-hueco]');
  if (hueco) hueco.replaceChildren();
  const senal = fachada.querySelector('[data-senal]');
  if (senal && !fachada.classList.contains('no-embebe')) senal.textContent = '';
  const boton = fachada.querySelector('[data-vivir]');
  if (boton) {
    boton.textContent = 'Ver en vivo';
    boton.setAttribute('aria-pressed', 'false');
  }
}

export function encender(fachada, { inmediato = false } = {}) {
  if (!fachada || fachada === activa) return;
  if (fachada.classList.contains('no-embebe')) return;

  apagar();
  activa = fachada;

  const arrancar = () => {
    if (activa !== fachada) return;
    const hueco = fachada.querySelector('[data-hueco]');
    const senal = fachada.querySelector('[data-senal]');
    if (!hueco) return;

    escalar(fachada);
    fachada.classList.add('esta-cargando');
    if (senal) senal.textContent = 'cargando…';

    const iframe = document.createElement('iframe');
    iframe.src = fachada.dataset.url;
    iframe.loading = 'lazy';
    iframe.title = `Vista en vivo de la web de ${fachada.dataset.nombre}`;
    iframe.setAttribute('tabindex', '-1');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.setAttribute('referrerpolicy', 'no-referrer');

    const rendirse = () => {
      if (activa !== fachada) return;
      // no embebe o tarda demasiado: la captura se queda y no se reintenta
      fachada.classList.add('no-embebe');
      fachada.classList.remove('esta-cargando', 'esta-viva');
      if (senal) senal.textContent = 'sin vista en vivo';
      hueco.replaceChildren();
      activa = null;
    };

    const reloj = setTimeout(rendirse, LIMITE_IFRAME);

    iframe.addEventListener('load', () => {
      clearTimeout(reloj);
      if (activa !== fachada) return;
      limpiarAviso(iframe);
      fachada.classList.remove('esta-cargando');
      fachada.classList.add('esta-viva');
      if (senal) senal.textContent = 'en vivo';
      const boton = fachada.querySelector('[data-vivir]');
      if (boton) {
        boton.textContent = 'Apagar';
        boton.setAttribute('aria-pressed', 'true');
      }
    }, { once: true });

    iframe.addEventListener('error', () => { clearTimeout(reloj); rendirse(); }, { once: true });

    hueco.replaceChildren(iframe);
  };

  if (inmediato) arrancar();
  else temporizador = setTimeout(arrancar, ESPERA_HOVER);
}

/** Engancha una fachada recién pintada. */
export function vigilarFachada(fachada) {
  if (puedeFlotar()) {
    fachada.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      encender(fachada);
    });
    fachada.addEventListener('pointerleave', () => {
      if (activa === fachada) apagar();
    });
    // con teclado el escaparate también se enciende, pero sin retardo
    fachada.addEventListener('focusin', () => encender(fachada, { inmediato: true }));
    fachada.addEventListener('focusout', (e) => {
      if (!fachada.contains(e.relatedTarget) && activa === fachada) apagar();
    });
  }

  const boton = fachada.querySelector('[data-vivir]');
  if (boton) {
    boton.addEventListener('click', (e) => {
      e.preventDefault();
      if (activa === fachada) apagar();
      else encender(fachada, { inmediato: true });
    });
  }
}

/** Si la fachada encendida desaparece (por un filtro), se apaga. */
export function apagarSiEs(fachada) {
  if (activa === fachada) apagar();
}

export const encendida = () => activa;

addEventListener('resize', () => { if (activa) escalar(activa); }, { passive: true });
// salir de la pestaña con un iframe animado detrás no tiene sentido
addEventListener('pagehide', apagar);
document.addEventListener('visibilitychange', () => { if (document.hidden) apagar(); });

/* ════════════════════════════════════════════════════════════════════════
   La calle: tramos, fachadas y filtros.

   Todo lo que se ve aquí sale de data/projects.json. Para añadir un proyecto
   nuevo basta con meterlo en ese fichero y correr `npm run shots`.
   ════════════════════════════════════════════════════════════════════════ */

import { vigilarFachada, apagarSiEs, apagar } from './escaparate.js';

const SUAVE = 'cubic-bezier(.16, 1, .3, 1)';
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const FLECHA = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3h7v7M13 3 3.5 12.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const OCTO = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 .8a7.2 7.2 0 0 0-2.28 14.03c.36.07.49-.16.49-.35v-1.2c-2 .44-2.43-.97-2.43-.97-.33-.83-.8-1.06-.8-1.06-.66-.45.05-.44.05-.44.73.05 1.11.75 1.11.75.65 1.1 1.7.79 2.11.6.07-.47.25-.79.46-.97-1.6-.18-3.28-.8-3.28-3.56 0-.79.28-1.43.74-1.93-.07-.19-.32-.92.07-1.91 0 0 .6-.2 1.98.73a6.8 6.8 0 0 1 3.6 0c1.37-.93 1.97-.73 1.97-.73.4.99.15 1.72.07 1.9.47.51.74 1.15.74 1.94 0 2.77-1.68 3.38-3.28 3.56.26.22.49.66.49 1.33v1.97c0 .19.13.42.5.35A7.2 7.2 0 0 0 8 .8Z" fill="currentColor"/></svg>';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ESTADOS = {
  propuesta: 'Propuesta',
  entregada: 'Entregada',
};

/* ── una fachada ───────────────────────────────────────────────────────── */
function fachadaHTML(p) {
  const apagada = p.ambito === 'plantilla';
  const esPendiente = (v) => !v || /^PENDIENTE$/i.test(v);
  const concepto = esPendiente(p.concepto)
    ? '<span class="pendiente">concepto pendiente</span>'
    : esc(p.concepto);
  const anio = esPendiente(p.anio)
    ? '<span class="pendiente">año pendiente</span>'
    : `<span class="fachada__anio">${esc(p.anio)}</span>`;
  const estado = p.estado === 'entregada' ? 'entregada' : 'propuesta';

  // la pila de la web original: hasta que llega su webfont el rótulo ya se ve
  // con un respaldo del mismo género
  const pila = `${esc(p.fuente.stack)}, ${esc(p.fuente.generica)}`;

  return `
<article class="fachada"
  data-repo="${esc(p.repo)}"
  data-url="${esc(p.url)}"
  data-nombre="${esc(p.nombre)}"
  data-sector="${esc(p.sector)}"
  data-estado="${estado}"
  data-ambito="${esc(p.ambito || 'real')}"
  style="--f:${esc(p.color)}; --f-rotulo:${esc(p.colorRotulo)}">
  <div class="fachada__interior">
    <header class="fachada__rotulo">
      <h3 class="fachada__nombre"
          data-fuente="${esc(p.fuente.id || '')}"
          style="font-family:${pila}; font-weight:${esc(p.fuente.peso)}; font-style:${esc(p.fuente.estilo)}">${esc(p.nombre)}</h3>
      <p class="fachada__tipo etq">${esc(p.tipo)}</p>
    </header>

    <div class="fachada__escaparate">
      <picture>
        <source media="(max-width: 52rem)" srcset="${esc(p.capturas.mobile)}" width="780" height="1688">
        <img class="fachada__captura" src="${esc(p.capturas.desktop)}"
             alt="Captura del inicio de la web de ${esc(p.nombre)}"
             loading="lazy" decoding="async" width="1440" height="900">
      </picture>
      <div class="fachada__vivo" data-hueco></div>
      <a class="fachada__cristal" href="${esc(p.url)}" target="_blank" rel="noopener"
         tabindex="-1" aria-hidden="true"></a>
      <span class="fachada__senal" data-senal></span>
      <button class="fachada__vivir" type="button" data-vivir aria-pressed="false">Ver en vivo</button>
    </div>

    <footer class="fachada__pie">
      <p class="fachada__dato"><span class="etq">Concepto</span><span>${concepto}</span></p>
      <p class="fachada__meta">
        <span class="estado" data-estado="${estado}">${ESTADOS[estado]}</span>
        ${anio}
        ${apagada ? '<span class="fachada__disponible">disponible para tu negocio</span>' : ''}
      </p>
      <p class="fachada__acciones">
        <a class="fachada__abrir" href="${esc(p.url)}" target="_blank" rel="noopener">
          Ver la web<span class="visualmente-oculto"> de ${esc(p.nombre)}</span> ${FLECHA}
        </a>
        <a class="fachada__codigo" href="${esc(p.codigo)}" target="_blank" rel="noopener">
          ${OCTO} Código<span class="visualmente-oculto"> de ${esc(p.nombre)} en GitHub</span>
        </a>
      </p>
    </footer>
  </div>
  <span class="fachada__acera" aria-hidden="true"></span>
</article>`;
}

/* ── un tramo ──────────────────────────────────────────────────────────── */
function tramoHTML(sector, proyectos) {
  return `
<section class="tramo" data-tramo="${esc(sector.id)}" aria-labelledby="tramo-${esc(sector.id)}">
  <h3 class="tramo__cartel" id="tramo-${esc(sector.id)}">
    <span class="tramo__nombre">${esc(sector.rotulo)} <span class="tramo__n" data-contador="${proyectos.length}">${proyectos.length}</span></span>
  </h3>
  <div class="tramo__fachadas">
    ${proyectos.map((p) => fachadaHTML(p)).join('')}
  </div>
</section>
<div class="farola" aria-hidden="true"></div>`;
}

/**
 * Recoloca las fachadas visibles a izquierda y derecha de la calle.
 * No se puede dejar en manos de :nth-child porque los elementos ocultos
 * siguen contando y, al filtrar, la alternancia se descuadraría.
 */
function repartirLados(raiz) {
  for (const rejilla of raiz.querySelectorAll('.tramo__fachadas')) {
    const visibles = [...rejilla.querySelectorAll('.fachada')].filter((f) => !f.hidden);
    visibles.forEach((f, i) => { f.dataset.lado = i % 2 ? 'der' : 'izq'; });
  }
}

/* ── FLIP a mano ───────────────────────────────────────────────────────── */
/** Mide, deja que `mutar` cambie el DOM, y anima la diferencia. */
function conFlip(raiz, mutar) {
  if (reducido() || !('animate' in Element.prototype)) { mutar(); return; }

  const antes = new Map();
  for (const f of raiz.querySelectorAll('.fachada')) {
    if (f.hidden) continue;
    const r = f.getBoundingClientRect();
    antes.set(f, { x: r.left, y: r.top });
  }

  mutar();

  for (const f of raiz.querySelectorAll('.fachada')) {
    if (f.hidden) continue;
    const r = f.getBoundingClientRect();
    if (r.width === 0) continue;
    const prev = antes.get(f);

    if (!prev) {
      f.animate(
        [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
        { duration: 500, easing: SUAVE }
      );
      continue;
    }
    const dx = prev.x - r.left;
    const dy = prev.y - r.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    f.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: 500, easing: SUAVE }
    );
  }
}

/* ── encendido al entrar en viewport ───────────────────────────────────── */
function encenderAlEntrar(fachadas) {
  if (reducido() || !('IntersectionObserver' in window)) {
    for (const f of fachadas) f.classList.add('esta-encendida');
    return null;
  }
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('esta-encendida');
      io.unobserve(e.target); // una vez encendida, se queda encendida
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.18 });
  for (const f of fachadas) io.observe(f);
  return io;
}

/**
 * Suelta el hilo principal. Pintar los cinco tramos de una tacada era una
 * tarea larga de ~190 ms; troceado, ninguna pasa de ~60 ms y el hero responde
 * mientras la calle se va montando por debajo.
 */
const ceder = () => (globalThis.scheduler?.yield
  ? scheduler.yield()
  : new Promise((r) => setTimeout(r, 0)));

/* ── pintado ───────────────────────────────────────────────────────────── */
export async function pintarCalle(datos, { vigilante } = {}) {
  const via = document.querySelector('[data-via]');
  if (!via) return null;

  const por = (id) => datos.proyectos.filter((p) => p.sector === id);

  via.replaceChildren();

  const enganchar = (raiz) => {
    const nuevas = [...raiz.querySelectorAll('.fachada:not([data-enganchada])')];
    for (const f of nuevas) {
      f.dataset.enganchada = '1';
      vigilarFachada(f);
      const nombre = f.querySelector('[data-fuente]');
      if (vigilante && nombre?.dataset.fuente) vigilante.observar(nombre);
    }
    repartirLados(raiz);
    encenderAlEntrar(nuevas);
    return nuevas;
  };

  const todas = [];
  for (const s of datos.sectores) {
    via.insertAdjacentHTML('beforeend', tramoHTML(s, por(s.id)));
    todas.push(...enganchar(via));
    await ceder();
  }

  return { via, todas };
}

/* ── filtros ───────────────────────────────────────────────────────────── */
export function montarFiltros(datos, { via, alFiltrar } = {}) {
  const cajaSector = document.querySelector('[data-grupo-filtro="sector"]');
  const cajaEstado = document.querySelector('[data-grupo-filtro="estado"]');
  const cajaAmbito = document.querySelector('[data-grupo-filtro="ambito"]');
  const recuento = document.querySelector('[data-recuento]');
  const vacia = document.querySelector('[data-vacia]');
  if (!cajaSector || !via) return;

  const deCalle = datos.sectores;
  const enCalle = datos.proyectos;

  const chip = (valor, texto, n, marcado) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(marcado));
    b.tabIndex = marcado ? 0 : -1;
    b.dataset.valor = valor;
    b.innerHTML = `${esc(texto)}${n == null ? '' : ` <span class="chip__n">${n}</span>`}`;
    return b;
  };

  cajaSector.append(
    chip('todos', 'Todos', enCalle.length, true),
    ...deCalle.map((s) => chip(s.id, s.nombre, s.total, false))
  );
  cajaEstado.append(
    chip('todos', 'Todos', enCalle.length, true),
    ...Object.entries(ESTADOS).map(([id, txt]) =>
      chip(id, txt, enCalle.filter((p) => (p.estado || 'propuesta') === id).length, false))
  );
  if (cajaAmbito) {
    const AMBITOS = { real: 'Reales', plantilla: 'Plantillas' };
    cajaAmbito.append(
      chip('todos', 'Todos', enCalle.length, true),
      ...Object.entries(AMBITOS).map(([id, txt]) =>
        chip(id, txt, enCalle.filter((p) => (p.ambito || 'real') === id).length, false))
    );
  }

  const estado = { sector: 'todos', estado: 'todos', ambito: 'todos' };

  /**
   * `animar: false` en el montaje inicial: ni FLIP ni avisar a ScrollTrigger.
   * Las dos cosas fuerzan una medición completa de la calle (64 escaparates)
   * y juntas eran 190 ms de tarea larga justo al cargar — para animar un
   * movimiento que no existe, porque todo está ya en su sitio.
   */
  function aplicar({ animar = true } = {}) {
    const fachadas = [...via.querySelectorAll('.fachada')];
    let visibles = 0;
    const envolver = animar ? conFlip : (_raiz, mutar) => mutar();

    envolver(via, () => {
      for (const f of fachadas) {
        const ok = (estado.sector === 'todos' || f.dataset.sector === estado.sector)
          && (estado.estado === 'todos' || f.dataset.estado === estado.estado)
          && (estado.ambito === 'todos' || f.dataset.ambito === estado.ambito);
        if (!ok) apagarSiEs(f);          // si estaba en vivo, se apaga antes de ocultarse
        f.hidden = !ok;
        if (ok) visibles++;
      }
      // un tramo sin fachadas visibles desaparece con su cartel y su farola
      for (const tramo of via.querySelectorAll('.tramo')) {
        const algo = [...tramo.querySelectorAll('.fachada')].some((f) => !f.hidden);
        tramo.hidden = !algo;
        const farola = tramo.nextElementSibling;
        if (farola?.classList.contains('farola')) farola.hidden = !algo;
      }
      repartirLados(via);
    });

    if (recuento) {
      recuento.textContent = visibles === enCalle.length
        ? `${enCalle.length} escaparates en la calle`
        : `${visibles} de ${enCalle.length} escaparates`;
    }
    if (vacia) vacia.hidden = visibles > 0;
    if (animar) alFiltrar?.();
  }

  function manejar(caja, clave) {
    caja.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b || b.getAttribute('aria-checked') === 'true') return;
      for (const otro of caja.querySelectorAll('.chip')) {
        const es = otro === b;
        otro.setAttribute('aria-checked', String(es));
        otro.tabIndex = es ? 0 : -1;
      }
      estado[clave] = b.dataset.valor;
      b.focus();                 // el foco no se pierde al reordenar
      aplicar();
    });

    // flechas: navegación de radiogroup, como espera un lector de pantalla
    caja.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const chips = [...caja.querySelectorAll('.chip')];
      const i = chips.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const salto = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1;
      const destino = e.key === 'Home' ? 0
        : e.key === 'End' ? chips.length - 1
        : (i + salto + chips.length) % chips.length;
      chips[destino].click();
    });
  }

  manejar(cajaSector, 'sector');
  manejar(cajaEstado, 'estado');
  if (cajaAmbito) manejar(cajaAmbito, 'ambito');
  aplicar({ animar: false });
}

export { apagar as apagarEscaparate, reducido };

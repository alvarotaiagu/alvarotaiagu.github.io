/* ════════════════════════════════════════════════════════════════════════
   La marquesina de rótulos.

   Los 39 nombres desfilando como los letreros de una calle: cada uno en su
   color y, cuando su tipografía cabe en el presupuesto, en su tipografía.
   Se mueve con una animación CSS (compositor, cero trabajo por fotograma),
   se para al pasar el ratón y tiene un botón para pararla del todo.
   ════════════════════════════════════════════════════════════════════════ */

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rotuloHTML(p, { eco = false } = {}) {
  const pila = `${esc(p.fuente.stack)}, ${esc(p.fuente.generica)}`;
  return `
<li>
  <button class="rotulo" type="button"
    ${eco ? 'tabindex="-1" aria-hidden="true"' : ''}
    data-repo="${esc(p.repo)}"
    ${eco ? '' : `data-fuente="${esc(p.fuente.id || '')}"`}
    data-captura="${esc(p.capturas.desktop)}"
    data-tipo="${esc(p.tipo)}"
    style="--f:${esc(p.color)}; --f-rotulo:${esc(p.colorRotulo)};
           font-family:${pila}; font-weight:${esc(p.fuente.peso)}; font-style:${esc(p.fuente.estilo)}">
    <span class="rotulo__punto" aria-hidden="true"></span>${esc(p.nombre)}
  </button>
</li>`;
}

export function montarMarquesina(datos, { vigilante, irAFachada } = {}) {
  const caja = document.querySelector('[data-marquesina]');
  if (!caja) return;

  const original = caja.querySelector('[data-grupo="original"]');
  const eco = caja.querySelector('[data-grupo="eco"]');
  const vista = caja.querySelector('[data-vista]');
  const vistaImg = caja.querySelector('[data-vista-img]');
  const vistaPie = caja.querySelector('[data-vista-pie]');
  const pausa = caja.querySelector('[data-pausa]');
  const pausaTxt = caja.querySelector('[data-pausa-txt]');

  original.innerHTML = datos.proyectos.map((p) => rotuloHTML(p)).join('');
  // el eco es la copia que hace que el bucle no tenga costura
  if (eco && !reducido()) eco.innerHTML = datos.proyectos.map((p) => rotuloHTML(p, { eco: true })).join('');

  // las tipografías de la marquesina salen del mismo presupuesto que las
  // fachadas: se piden cuando el rótulo entra por un lado y se sueltan al salir
  if (vigilante) {
    for (const b of original.querySelectorAll('[data-fuente]')) vigilante.observar(b);
  }

  /* ── miniatura al pasar por encima ── */
  let dentro = null;
  const mostrar = (btn) => {
    if (!vista || !vistaImg || reducido()) return;
    dentro = btn;
    const r = btn.getBoundingClientRect();
    const c = caja.getBoundingClientRect();
    vistaImg.src = btn.dataset.captura;
    vistaImg.alt = '';
    vistaPie.textContent = btn.dataset.tipo;
    vista.style.setProperty('--f', btn.style.getPropertyValue('--f'));
    vista.style.insetInlineStart = `${Math.min(Math.max(r.left - c.left + r.width / 2, 130), c.width - 130)}px`;
    vista.hidden = false;
    requestAnimationFrame(() => vista.classList.add('es-visible'));
  };
  const ocultar = (btn) => {
    if (!vista || dentro !== btn) return;
    dentro = null;
    vista.classList.remove('es-visible');
    // se deja el nodo para no recargar la imagen en cada pasada
    setTimeout(() => { if (!dentro) vista.hidden = true; }, 320);
  };

  caja.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.rotulo');
    if (b) mostrar(b);
  });
  caja.addEventListener('pointerout', (e) => {
    const b = e.target.closest('.rotulo');
    if (b && !b.contains(e.relatedTarget)) ocultar(b);
  });
  caja.addEventListener('focusin', (e) => {
    const b = e.target.closest('.rotulo');
    if (b) mostrar(b);
  });
  caja.addEventListener('focusout', (e) => {
    const b = e.target.closest('.rotulo');
    if (b) ocultar(b);
  });

  /* ── clic: bajar a su escaparate en la calle ── */
  caja.addEventListener('click', (e) => {
    const b = e.target.closest('.rotulo');
    if (!b) return;
    irAFachada?.(b.dataset.repo);
  });

  /* ── pausa manual ── */
  if (pausa) {
    if (reducido()) pausa.hidden = true;
    pausa.addEventListener('click', () => {
      const parada = caja.classList.toggle('esta-pausada');
      pausa.setAttribute('aria-pressed', String(parada));
      if (pausaTxt) pausaTxt.textContent = parada ? 'Reanudar' : 'Pausar';
    });
  }
}

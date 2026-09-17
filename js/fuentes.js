/* ════════════════════════════════════════════════════════════════════════
   Cargador de tipografías con presupuesto.

   Cada rótulo de la calle se escribe con la tipografía de titulares de su
   propia web. Son 32 familias distintas: cargarlas todas de golpe serían
   unos cuantos cientos de KB y un buen rato de hilo principal bloqueado.

   Así que: una familia se pide cuando su fachada (o su rótulo de la
   marquesina) está a menos de un viewport, se suelta cuando se aleja, y
   nunca hay más de MAX vivas a la vez. Cuando se pasa del presupuesto se
   tira la menos usada de las que ya no referencia nadie.

   Hasta que llega la webfont, el rótulo se ve con la pila de respaldo de la
   web original (`fuente.stack`), que es del mismo género: no baila de serif
   a sans, solo se afina.
   ════════════════════════════════════════════════════════════════════════ */

export function crearCargador(fuentes, max = 6) {
  /** id → { link, refs, usada } */
  const vivas = new Map();
  let reloj = 0;

  /**
   * El tope es duro: primero se tiran las que ya no referencia nadie, de la
   * menos usada a la más reciente, y si aún así se pasa, se siguen tirando por
   * el mismo criterio aunque estén referenciadas. Si no, un momento en el que
   * se vean siete rótulos deja siete familias cargadas para siempre.
   */
  function podar() {
    if (vivas.size <= max) return;
    const porAntiguedad = (a, b) => (a[1].refs - b[1].refs) || (a[1].usada - b[1].usada);
    for (const [id, e] of [...vivas.entries()].sort(porAntiguedad)) {
      if (vivas.size <= max) break;
      e.link.remove(); // quitar el <link> retira sus @font-face
      vivas.delete(id);
    }
  }

  function pedir(id) {
    if (!id) return;
    const f = fuentes[id];
    if (!f || !f.css) return;

    const viva = vivas.get(id);
    if (viva) {
      viva.refs++;
      viva.usada = ++reloj;
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = f.css;
    link.dataset.fuenteDe = id;
    document.head.append(link);
    vivas.set(id, { link, refs: 1, usada: ++reloj });
    podar();
  }

  function soltar(id) {
    const viva = vivas.get(id);
    if (!viva) return;
    viva.refs = Math.max(0, viva.refs - 1);
    podar();
  }

  return {
    pedir,
    soltar,
    /** para la verificación: qué familias hay cargadas ahora mismo */
    estado: () => [...vivas.entries()].map(([id, e]) => ({ id, refs: e.refs })),
  };
}

/**
 * Observa elementos con `data-fuente` y pide/suelta su familia según se
 * acerquen o se alejen. `root` permite usarlo dentro de la marquesina, donde
 * lo que se mueve es el contenido y no el scroll.
 */
export function vigilarFuentes(cargador, { root = null, margen = '100% 0px', retraso = 0 } = {}) {
  const dentro = new WeakSet();
  const pendientes = new WeakMap(); // histéresis al salir

  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const id = e.target.dataset.fuente;
      if (!id) continue;

      if (e.isIntersecting) {
        // volvió antes de tiempo: se cancela la suelta
        const reloj = pendientes.get(e.target);
        if (reloj) { clearTimeout(reloj); pendientes.delete(e.target); }
        if (dentro.has(e.target)) continue;
        dentro.add(e.target);
        cargador.pedir(id);
        continue;
      }

      if (!dentro.has(e.target) || pendientes.has(e.target)) continue;
      // en la marquesina los rótulos entran y salen sin parar: soltar al
      // instante sería añadir y quitar <link> cada pocos segundos
      const soltar = () => {
        pendientes.delete(e.target);
        dentro.delete(e.target);
        cargador.soltar(id);
      };
      if (retraso > 0) pendientes.set(e.target, setTimeout(soltar, retraso));
      else soltar();
    }
  }, { root, rootMargin: margen, threshold: 0 });

  return {
    observar: (el) => io.observe(el),
    parar: () => io.disconnect(),
  };
}

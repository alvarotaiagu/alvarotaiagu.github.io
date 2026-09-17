/* ════════════════════════════════════════════════════════════════════════
   Movimiento.

   Cinematográfico y contenido: nada se mueve por moverse. Todo lo que hay
   aquí se apaga con `prefers-reduced-motion`, pero el CONTENIDO no: los
   rótulos siguen leyéndose, los contadores muestran su cifra final y las
   fachadas quedan encendidas.
   ════════════════════════════════════════════════════════════════════════ */

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fino = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
const gsap = globalThis.gsap;
const ScrollTrigger = globalThis.ScrollTrigger;

/* ── scroll suave ──────────────────────────────────────────────────────── */
export function montarScroll() {
  const Lenis = globalThis.Lenis;
  if (reducido() || !Lenis) {
    anclas(null);
    return null;
  }

  const lenis = new Lenis({ duration: 1.05, smoothWheel: true, touchMultiplier: 1.6 });

  if (gsap && ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const paso = (t) => { lenis.raf(t); requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }

  anclas(lenis);
  return lenis;
}

function anclas(lenis) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id === '#' || id.length < 2) return;
    const destino = document.querySelector(id);
    if (!destino) return;
    e.preventDefault();
    const arriba = -64;
    if (lenis) lenis.scrollTo(destino, { offset: arriba });
    else destino.scrollIntoView({ behavior: reducido() ? 'auto' : 'smooth', block: 'start' });
    // el foco tiene que seguir al scroll o el teclado se queda arriba
    destino.setAttribute('tabindex', '-1');
    destino.focus({ preventScroll: true });
  });
}

/* ── char-reveal ───────────────────────────────────────────────────────── */
/**
 * Parte el texto en palabras y letras. La PALABRA también va en inline-block
 * y con white-space:nowrap: con solo las letras en inline-block el navegador
 * parte por cualquier letra y sale «Álva / ro».
 */
export function revelarTexto(el) {
  if (!el || el.dataset.partido) return [];
  const texto = el.textContent.trim();
  el.dataset.partido = '1';
  el.textContent = '';

  const letras = [];
  texto.split(/(\s+)/).forEach((trozo) => {
    if (!trozo) return;
    if (/^\s+$/.test(trozo)) { el.append(document.createTextNode(' ')); return; }
    const palabra = document.createElement('span');
    palabra.className = 'revelar__palabra';
    for (const c of trozo) {
      const letra = document.createElement('span');
      letra.className = 'revelar__letra';
      letra.textContent = c;
      palabra.append(letra);
      letras.push(letra);
    }
    el.append(palabra);
  });

  el.setAttribute('aria-label', texto); // el lector lo lee entero, no letra a letra
  for (const l of letras) l.setAttribute('aria-hidden', 'true');
  return letras;
}

export function animarRevelados() {
  for (const el of document.querySelectorAll('[data-revelar]')) {
    const letras = revelarTexto(el);
    el.dataset.listo = '1';
    if (!letras.length) continue;

    if (reducido() || !gsap) {
      for (const l of letras) l.style.opacity = '1';
      continue;
    }
    gsap.set(letras, { opacity: 0, yPercent: 46 });
    gsap.to(letras, {
      opacity: 1,
      yPercent: 0,
      duration: 0.92,
      ease: 'expo.out',
      stagger: 0.042,
      delay: 0.12,
    });
  }
}

/* ── cortina de entrada (preloader) ─────────────────────────────────────
   La calle se enciende de izquierda a derecha: el panel se recorta con
   clip-path desde la izquierda y una farola viaja pegada a ese corte. La
   luz es lo que convierte un barrido en un gesto.

   Dos momentos distintos, y son distintos a propósito:
     · alAbrirse(fn) → cuando la luz EMPIEZA a recorrer, para que el rótulo
       del hero ya se esté revelando cuando asoma la calle.
     · retirar()     → al terminar: quita el nodo, devuelve el scroll y
       refresca ScrollTrigger, que midió con overflow:hidden.
   Se retira SIEMPRE: sin GSAP, con movimiento reducido, o por el timeout
   de seguridad. Una cortina atascada tapa el sitio entero.

   El gate del CSS lo pone ella misma (.cortina-anima): este sitio no tiene
   la clase has-motion que usan los demás de la carpeta.
   ────────────────────────────────────────────────────────────────────── */
export function montarCortina() {
  const el = document.querySelector('[data-cortina]');
  const espera = [];
  let abierta = false;
  let fuera = false;

  const abrir = () => {
    if (abierta) return;
    abierta = true;
    for (const fn of espera.splice(0)) { try { fn(); } catch { /* sigue */ } }
  };
  const retirar = () => {
    abrir();
    if (fuera) return;
    fuera = true;
    if (el) el.hidden = true;
    document.documentElement.classList.remove('cortina-puesta', 'cortina-anima');
    globalThis.ScrollTrigger?.refresh();
  };

  const api = { alAbrirse: (fn) => (abierta ? fn() : espera.push(fn)) };
  if (!el || reducido() || !gsap) { retirar(); return api; }

  const raiz = document.documentElement;
  raiz.classList.add('cortina-puesta', 'cortina-anima');

  const panel = el.querySelector('.cortina__panel');
  const centro = el.querySelector('.cortina__centro');
  const farola = el.querySelector('.cortina__farola');
  const nombre = el.querySelector('.cortina__nombre span');
  const regla = el.querySelector('.cortina__regla');
  const lema = el.querySelector('.cortina__lema');
  const ENCIENDE = 1.3;

  const tl = gsap.timeline({ onComplete: retirar });
  /* el estado inicial es un translateY(112%) del CSS y GSAP lo lee de la
     matriz como píxeles, no como yPercent: hay que poner las dos a cero o
     el nombre no sale nunca de su máscara. */
  if (nombre) tl.to(nombre, { y: 0, yPercent: 0, duration: 0.95, ease: 'expo.out' }, 0.15);
  if (regla) tl.to(regla, { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, 0.55);
  if (lema) tl.to(lema, { opacity: 1, duration: 0.7, ease: 'power2.out' }, 0.62);

  tl.add(abrir, ENCIENDE);
  /* el contenido se va con el corte, no con un fundido aparte: si el panel
     se funde a la vez, la calle aparece entera antes de que pase la luz y
     el barrido deja de significar nada. */
  if (centro) tl.to(centro, { opacity: 0, duration: 0.3, ease: 'power2.in' }, ENCIENDE - 0.12);

  /* el corte y la luz van en el MISMO tween: si fueran dos, cualquier
     diferencia de easing dejaría la farola despegada del borde */
  if (panel && farola) {
    const avance = { p: 0 };
    tl.to(avance, {
      p: 100,
      duration: 1.15,
      ease: 'power2.inOut',
      onStart: () => gsap.set(farola, { opacity: 1 }),
      onUpdate: () => {
        panel.style.clipPath = `inset(0 0 0 ${avance.p}%)`;
        farola.style.transform = `translateX(${avance.p}vw)`;
      },
      onComplete: () => gsap.to(farola, { opacity: 0, duration: 0.25 }),
    }, ENCIENDE);
  }

  setTimeout(retirar, 5200);
  return api;
}

/* ── parallax de dos planos ────────────────────────────────────────────── */
export function montarParallax() {
  if (reducido() || !gsap || !ScrollTrigger) return;

  const plano = (selector, recorrido) => {
    for (const el of document.querySelectorAll(selector)) {
      gsap.fromTo(el,
        { y: recorrido },
        {
          y: -recorrido,
          ease: 'none',
          scrollTrigger: {
            trigger: el.closest('.fachada, .tramo, .farola') || el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
    }
  };

  plano('.fachada__interior', 34);   // plano cercano: las fachadas
  plano('.tramo__cartel', 14);       // plano lejano: los carteles de calle
  plano('.farola', 10);              // y las farolas
  ScrollTrigger.refresh();
}

/* ── botones magnéticos ────────────────────────────────────────────────── */
export function montarMagneticos() {
  if (reducido() || !fino()) return;
  const RADIO = 90;
  for (const btn of document.querySelectorAll('[data-magnetico]')) {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      const k = Math.max(0, 1 - d / (RADIO + r.width / 2)) * 0.32;
      btn.style.setProperty('--btn-x', `${(dx * k).toFixed(1)}px`);
      btn.style.setProperty('--btn-y', `${(dy * k).toFixed(1)}px`);
    });
    const soltar = () => {
      btn.style.setProperty('--btn-x', '0px');
      btn.style.setProperty('--btn-y', '0px');
    };
    btn.addEventListener('pointerleave', soltar);
    btn.addEventListener('blur', soltar);
  }
}

/* ── contadores ────────────────────────────────────────────────────────── */
export function montarContadores() {
  const nodos = [...document.querySelectorAll('[data-contador]')];
  if (!nodos.length) return;

  // con movimiento reducido la cifra sale directamente: es contenido, no adorno
  if (reducido() || !('IntersectionObserver' in window)) {
    for (const n of nodos) n.textContent = n.dataset.contador;
    return;
  }

  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const fin = Number(e.target.dataset.contador) || 0;
      const t0 = performance.now();
      const dur = 900;
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const suave = 1 - (1 - k) ** 3;
        e.target.textContent = String(Math.round(fin * suave));
        if (k < 1) requestAnimationFrame(paso);
        else e.target.textContent = String(fin);
      };
      requestAnimationFrame(paso);
    }
  }, { threshold: 0.6 });

  for (const n of nodos) { n.textContent = '0'; io.observe(n); }
}

/* ── barra y sección activa ────────────────────────────────────────────── */
export function montarBarra() {
  const barra = document.querySelector('[data-barra]');
  const hero = document.querySelector('.hero');
  if (!barra || !hero || !('IntersectionObserver' in window)) return;

  new IntersectionObserver(([e]) => {
    barra.classList.toggle('es-visible', !e.isIntersecting);
  }, { rootMargin: '-72px 0px 0px 0px', threshold: 0 }).observe(hero);

  const enlaces = [...barra.querySelectorAll('.barra__nav a')];
  const secciones = enlaces
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  if (!secciones.length) return;

  const espia = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      for (const a of enlaces) {
        a.classList.toggle('es-actual', a.getAttribute('href') === `#${e.target.id}`);
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  for (const s of secciones) espia.observe(s);
}

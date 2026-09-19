/* ════════════════════════════════════════════════════════════════════════
   Formulario de contacto.

   Tiene tres modos, según lo que haya en js/config.js:
     · sin configurar → no se envía nada: se compone el mensaje y se copia al
       portapapeles, y la web lo dice sin disimulo;
     · mailto        → abre el cliente de correo con todo escrito;
     · formspree     → POST en segundo plano (y entonces sí hay un tercero,
       así que sale el aviso de cookies).
   ════════════════════════════════════════════════════════════════════════ */

import { CONTACTO } from './config.js';

const CAMPOS = [
  ['nombre', 'Escribe tu nombre'],
  ['negocio', 'Falta el nombre del negocio'],
  ['sector', 'Elige un sector'],
  ['email', 'Hace falta un email para poder contestarte'],
  ['mensaje', 'Cuéntame algo, aunque sean dos líneas'],
];

export function usaTerceros() {
  return CONTACTO.modo === 'formspree' && !!CONTACTO.destino;
}

function marcar(campo, error) {
  const caja = campo.closest('.campo');
  if (!caja) return;
  caja.querySelector('.campo__error')?.remove();
  if (error) {
    caja.dataset.error = '1';
    const p = document.createElement('p');
    p.className = 'campo__error';
    p.textContent = error;
    caja.append(p);
    campo.setAttribute('aria-invalid', 'true');
  } else {
    delete caja.dataset.error;
    campo.removeAttribute('aria-invalid');
  }
}

function validar(form) {
  let primero = null;
  for (const [nombre, aviso] of CAMPOS) {
    const campo = form.elements[nombre];
    if (!campo) continue;
    const valor = campo.value.trim();
    let error = valor ? '' : aviso;
    if (!error && nombre === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor)) {
      error = 'Ese email no tiene buena pinta';
    }
    marcar(campo, error);
    if (error && !primero) primero = campo;
  }
  return primero;
}

function componer(form, sectores) {
  const d = new FormData(form);
  const sector = sectores?.[d.get('sector')] || d.get('sector');
  return {
    asunto: `Web para ${d.get('negocio')} (${sector})`,
    cuerpo: [
      `Nombre: ${d.get('nombre')}`,
      `Negocio: ${d.get('negocio')}`,
      `Sector: ${sector}`,
      `Email: ${d.get('email')}`,
      '',
      d.get('mensaje'),
    ].join('\n'),
  };
}

export function montarFormulario(datos) {
  const form = document.querySelector('[data-formulario]');
  if (!form) return;

  const select = form.querySelector('[data-sectores-select]');
  const nombres = {};
  if (select) {
    for (const s of datos.sectores) {
      nombres[s.id] = s.nombre;
      select.append(new Option(s.nombre, s.id));
    }
    nombres.otro = 'Otro';
    select.append(new Option('Otro', 'otro'));
  }

  const estado = form.querySelector('[data-estado-form]');
  const nota = form.querySelector('[data-nota-config]');
  const boton = form.querySelector('[data-enviar]');
  const configurado = !!CONTACTO.destino;

  if (!configurado) {
    if (nota) nota.hidden = false;
    if (boton) boton.textContent = 'Copiar el mensaje';
  }

  const decir = (texto, tono = '') => {
    if (!estado) return;
    estado.textContent = texto;
    if (tono) estado.dataset.tono = tono; else delete estado.dataset.tono;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.elements._gotcha?.value) return; // robot

    const fallo = validar(form);
    if (fallo) {
      decir('Repasa los campos marcados.', 'mal');
      fallo.focus();
      return;
    }
    decir('');

    const { asunto, cuerpo } = componer(form, nombres);

    if (!configurado) {
      try {
        await navigator.clipboard.writeText(`${asunto}\n\n${cuerpo}`);
        decir('Mensaje copiado. Pégalo donde quieras: aún no hay dirección de destino configurada.', 'bien');
      } catch {
        decir('No he podido copiarlo. Aún no hay dirección de destino configurada.', 'mal');
      }
      return;
    }

    if (CONTACTO.modo === 'mailto') {
      location.href = `mailto:${CONTACTO.destino}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
      decir('Abriendo tu cliente de correo…', 'bien');
      return;
    }

    boton.disabled = true;
    decir('Enviando…');
    try {
      const res = await fetch(CONTACTO.destino, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      decir('Recibido. Te contesto en cuanto lo lea.', 'bien');
    } catch {
      decir('No ha salido. Prueba otra vez o escríbeme por GitHub.', 'mal');
    } finally {
      boton.disabled = false;
    }
  });

  // al corregir un campo marcado, el aviso se va
  form.addEventListener('input', (e) => {
    if (e.target.closest('.campo')?.dataset.error) marcar(e.target, '');
  });
}

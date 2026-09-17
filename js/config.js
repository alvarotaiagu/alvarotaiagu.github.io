/* ════════════════════════════════════════════════════════════════════════
   Lo único que hay que tocar a mano en toda la web.
   Los proyectos van en data/projects.json; esto es el contacto.
   ════════════════════════════════════════════════════════════════════════ */

export const CONTACTO = {
  /**
   * A dónde va el formulario. Mientras siga en null, el botón no envía nada:
   * compone el mensaje y lo copia al portapapeles, y la web lo dice en claro.
   *
   *   modo 'mailto'    → destino: 'alvaro@ejemplo.com'
   *   modo 'formspree' → destino: 'https://formspree.io/f/xxxxxxxx'
   */
  destino: null,
  modo: 'mailto',
};

/**
 * Datos personales que faltan. Cada uno que se rellene deja de salir como
 * «pendiente» en la web y pasa a mostrarse (y, en el caso del email y las
 * redes, a enlazarse).
 */
export const PERFIL = {
  apellidos: null,        // 'Pérez Gómez'
  email: null,            // 'alvaro@ejemplo.com'
  telefono: null,         // '+34 600 000 000' (se usa para el enlace de WhatsApp)
  linkedin: null,         // 'https://www.linkedin.com/in/…'
  instagram: null,        // 'https://www.instagram.com/…'
  github: 'https://github.com/alvarotaiagu',
  foto: null,             // 'assets/alvaro.jpg'
  bio: null,              // un párrafo
  formacion: null,
  precios: null,
};

/** Cuánto tarda en encenderse un escaparate al pasar el ratón (ms). */
export const ESPERA_HOVER = 380;

/** Si el iframe no ha cargado en este tiempo, se queda la captura (ms). */
export const LIMITE_IFRAME = 3000;

/** Máximo de familias tipográficas de proyecto vivas a la vez. */
export const MAX_FUENTES = 6;

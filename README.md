# Rúa — portfolio de Álvaro

Un pueblo, 64 webs. El portfolio es una calle de noche con los escaparates
encendidos: cada proyecto es una fachada con su web viva dentro.

**https://alvarotaiagu.github.io/**

Estático: HTML, CSS y JavaScript a mano, rutas relativas, publicado en la raíz
del repo `alvarotaiagu.github.io` (rama `main`). No hay build de la web: lo que
está en el repo es lo que se sirve. Los scripts de `scripts/` solo generan
datos y capturas.

---

## Añadir un proyecto

Todo lo que se pinta sale de **`data/projects.json`**. Para meter una web nueva:

1. Añádela a `scripts/seed.json` (repo, nombre, sector, tipo, concepto).
2. `npm run extract -- <repo>` — visita la web publicada y saca su `<title>`,
   su descripción, su color principal y su tipografía de titulares.
3. `npm run projects` — recompone `data/projects.json` y el JSON-LD.
4. `npm run shots -- <repo>` — genera sus dos capturas.
5. Mira la captura. Si el color no es el que manda en su hero, corrígelo en
   `scripts/overrides.json` y repite el paso 3.

Si solo quieres cambiar un estado, un concepto o un color, edita
`scripts/overrides.json` y corre `npm run projects`. `data/projects.json` es
generado: no lo edites a mano si vas a volver a correr el script.

### Marcar un proyecto como entregado

Por defecto **todo** sale como `"estado": "propuesta"`, que es la verdad: son
rediseños hechos por iniciativa propia, sin encargo. Cuando un negocio lo
confirme, en `scripts/overrides.json`:

```json
{ "ceibo-cafe-carballo-web": { "estado": "entregada" } }
```

y `npm run projects`. No lo marques antes de tener la confirmación: la web dice
en su cabecera que «Entregada» significa exactamente eso.

---

## Rellenar lo que falta

Los huecos salen marcados en ámbar con borde punteado por toda la web. Están
todos en **`js/config.js`**:

| Qué | Dónde |
| --- | --- |
| Apellidos, email, teléfono, redes, foto, bio, formación, precios | `PERFIL` |
| A dónde va el formulario | `CONTACTO.destino` y `CONTACTO.modo` |

Mientras `CONTACTO.destino` sea `null` el botón no envía nada: compone el
mensaje y lo copia al portapapeles, y la web lo dice en claro en vez de fingir
que funciona. Con `modo: 'mailto'` abre el cliente de correo; con
`modo: 'formspree'` hace un POST al endpoint (y entonces el aviso de cookies
añade la frase que corresponde, porque ya hay un tercero recibiendo datos).

---

## Comandos

```
npm install
npm run extract     # visita las 64 webs y saca sus datos → scripts/extracted.json
npm run projects    # seed + extracted + overrides → data/projects.json + JSON-LD + sitemap
npm run shots       # regenera las 128 capturas (1440×900 y 390×844) en webp < 150 KB
npm run og          # compone assets/og.jpg a partir de la propia calle
npm run verify      # Playwright: 64 URLs, capturas, iframes, filtros, foco, longtasks, 400 px
npm run build       # projects + og + verify
```

`npm run shots -- --missing` solo hace las que falten;
`npm run shots -- <repo>` solo una.

---

## Decisiones que conviene saber

**El color lo pone cada proyecto.** La paleta del portfolio no tiene acento:
noche `#0B0D12`, asfalto `#171A21`, papel `#F3EFE6` y un ámbar `#F2C879` a muy
baja opacidad para la luz de farola. El color de cada fachada se extrae de su
web (variable de acento → `theme-color` → barrido del hero) y de ahí sale el
halo del escaparate. Ese color se usa tal cual en 52 de los 64; los otros doce
son tan oscuros que sobre noche no se leerían, así que el rótulo usa una versión
subida por la rampa de luminosidad **OKLCH** conservando el tono, con el croma
pegado al borde de gama (hasta 1,3× el original) y parando en cuanto llega a
**3:1**, que es el umbral WCAG para texto grande. Conservar el croma original al
subir la luminosidad era lo que convertía los rojos de Ceibo o Castro Pombo en
malvas lavados. Los dos colores van en `projects.json` (`color` y
`colorRotulo`) con el ratio medido en `colorContraste`, y el origen de cada uno
en `colorOrigen` — «corregido a mano» son los ocho que corregí tras mirar su captura.

**Las tipografías, con presupuesto.** Cada rótulo se escribe con la tipografía
de titulares de su propia web: 32 familias distintas. Cargarlas todas sería
absurdo, así que `js/fuentes.js` pide la hoja de una familia cuando su fachada
está a menos de un viewport, la suelta cuando se aleja y **nunca tiene más de
seis vivas** (se tira la menos usada de las que ya no referencia nadie). Cada
hoja va subsetada con `&text=` a la unión de los caracteres de los rótulos que
la usan, así que pesa un par de KB. Hasta que llega, el rótulo se ve con la
pila de respaldo de la web original, que es del mismo género: no baila de serif
a sans, solo se afina.

**Los escaparates vivos.** Al pasar el ratón (o tocar «ver en vivo») se monta
un iframe con la web real, escalado al marco y sin puntero. Uno solo a la vez,
con retardo para que pasar de largo no cargue nada, y se destruye al salir. Si
en 3 s no ha cargado, se queda la captura y la fachada se marca como «sin vista
en vivo». En móvil el iframe se monta a 390×844, no a 1440: encoger un layout
de escritorio no enseña la web, enseña una maqueta.

**Lo que costaba al cargar.** Medido con `PerformanceObserver` y A/B contra un
`main.js` vacío, la tarea larga de arranque era de ~200 ms. Casi toda era
*layout*, no JavaScript: 64 escaparates con rejilla, consultas de contenedor e
imagen. Tres cosas la dejaron en ~120 ms:

- `content-visibility: auto` en `.fachada` (con `contain-intrinsic-size` puesto
  a la altura media real medida, 700 px en escritorio y 745 px a una columna),
  para que el navegador se salte los que no se ven. Ojo: eso implica contención
  de pintado, así que la luz de la acera va **dentro** de la caja, en un
  `padding-block-end` compensado con margen negativo, y no colgando por debajo.
- pintar la calle tramo a tramo cediendo el hilo entre uno y otro
  (`scheduler.yield`, con `setTimeout` de respaldo).
- no llamar a `ScrollTrigger.refresh()` ni hacer FLIP en el primer `aplicar()`
  de los filtros: las dos cosas miden la calle entera para animar un movimiento
  que no existe.

**Movimiento.** Lenis para el scroll, GSAP + ScrollTrigger para el parallax de
dos planos, y FLIP escrito a mano para los filtros (35 líneas, sin plugin). La
marquesina es una animación CSS: transform en el compositor, cero trabajo por
fotograma. No hay ningún canvas, ni desenfoques ni sombras calculadas por
fotograma: los brillos son `box-shadow` estáticos con transición de 0,6 s.

**Movimiento reducido.** Se apaga el movimiento, no el contenido. Con
`prefers-reduced-motion` la marquesina se queda quieta pero los 64 rótulos
siguen ahí y legibles, las fachadas salen todas encendidas, el nombre se lee
entero y los contadores muestran su cifra final en vez de quedarse en cero.

**Cookies.** No hay analítica, ni píxeles, ni cookies propias. El aviso sale
igualmente porque sí se cargan tipografías de Google Fonts y, al encender un
escaparate, se incrusta otra web: las dos cosas son conexiones a un servidor
externo y toca decirlo. El botón cierra de verdad — en el CSS está escrito
`.aviso-cookies[hidden] { display: none }`, que es justo el detalle que suele
faltar cuando «el botón no hace nada».

---

## Honestidad sobre los proyectos

Los negocios que aparecen aquí son reales y sus webs están publicadas, pero
**casi todas son propuestas de rediseño hechas por iniciativa propia, sin
encargo**. Ni son clientes ni han pedido nada. Eso está dicho en la cabecera de
la calle, en la etiqueta de cada fachada, en el pie y en los datos
estructurados (`creativeWorkStatus`), no escondido en letra pequeña. Los
nombres y logotipos pertenecen a sus dueños.

## Dependencias

GSAP 3.15 y Lenis 1.3 van **servidos desde el propio repo** (`js/vendor/`), no
desde un CDN: menos terceros y menos latencia. En `devDependencies` solo hay lo
que necesitan los scripts (Playwright y sharp); la web no usa nada de eso.

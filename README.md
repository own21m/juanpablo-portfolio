# Juanpablo — Código & Visión

Mi portfolio personal: ingeniería de software, arte, interfaces y visión por computador, con una estética gótica contemporánea.

Sitio estático en HTML, CSS, JavaScript y WebGL. Incluye 21 proyectos, nueve dibujos con revelación del original, un brazo robótico 3D articulado y una galería de tres videos del montaje.

La ficha de RECEPY Astra enlaza la nueva app en React Native y Expo. Incluye seis capturas reales de su ejecución web, cinco en formato móvil: feed, ingredientes, cocina guiada, comentarios y revisión de recetas. El contenido social es de demostración y la persistencia de la app es local.

## Abrir en local

Abre `index.html` en un navegador. Las fuentes, imágenes, videos y modelos funcionan sin conexión; no necesitas instalar dependencias ni iniciar un servidor. Los enlaces a GitHub y el correo sí utilizan sus aplicaciones correspondientes.

## Estructura

- `index.html`: contenido y diálogos.
- `styles.css` y `fonts.css`: diseño, temas y animaciones.
- `app.js` y `projects.js`: navegación, portada y fichas de proyectos.
- `art-gallery.js`: dibujos, revelación, zoom y transiciones.
- `robot-arm.js` y `robot-gallery.js`: plano 3D interactivo y videos.
- `assets/`: recursos locales y licencias de fuentes e iconos.
- `tests/`: comprobaciones sin dependencias externas.

## Verificación

Con Node.js 20 o superior:

```sh
node tests/run.cjs
```

Las pruebas cubren referencias locales, sintaxis, geometría, controles, tiempos de animación, foco, diálogos, pausa y movimiento reducido. Los dobles de DOM/WebGL permiten probar la lógica; no sustituyen una revisión visual en navegador ni una prueba real de GPU.

## Configuración de Vercel

Importa este repositorio con la raíz del proyecto en `.`. `vercel.json` declara el preset **Other**, sin instalación ni compilación y con la raíz como salida estática. No necesita variables de entorno ni servicios de backend. Consulta la [configuración oficial de Vercel](https://vercel.com/docs/project-configuration/vercel-json).

Las actualizaciones del repositorio pueden desplegarse mediante la integración de Git de Vercel.

## Contenido y movimiento

El control superior pausa las animaciones y el sitio respeta la preferencia de movimiento reducido. El tema sigue el sistema por defecto y puede cambiarse desde el menú. Los videos se cargan al abrir su galería y no se reproducen automáticamente. El formulario prepara un mensaje de correo para que lo envíes desde tu aplicación.

Los dibujos y videos forman parte de mi archivo personal. La inversión de los dibujos es un efecto de presentación: el visor conserva las fotografías en su color original. Las fuentes e iconos conservan las licencias incluidas en `assets/`.

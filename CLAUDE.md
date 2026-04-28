# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Rol del Agente

Eres un desarrollador web profesional de alto nivel con más de 10 años de experiencia. Tu especialidad es crear páginas web modernas, atractivas y funcionales usando las mejores tecnologías actuales (HTML5, CSS3, JavaScript, React, Next.js, Tailwind CSS, entre otras).

## Comportamiento esperado

- Diseña y desarrolla páginas web con código limpio, semántico y accesible.
- Propone estructuras de proyecto sólidas y escalables.
- Aplica buenas prácticas de UX/UI: jerarquía visual, tipografía, paletas de color, responsive design.
- Optimiza el rendimiento (lazy loading, minificación, SEO básico).
- Cuando el usuario describa una web, genera directamente el código necesario sin pedir confirmación innecesaria.

---

## Arquitectura del proyecto

**Sí Ahorro** es un comparador de tarifas de luz y gas con IA. Desplegado en Vercel (proyecto `siahorro`). URL: https://www.si-ahorro.es

### Stack
- **Frontend**: HTML/CSS/JS vanilla en un único `index.html` (sin framework). Todo el CSS está inline en `<style>` y el JS al final del `<body>`.
- **Backend**: Serverless functions en `api/`:
  - `api/analizar.js`: recibe factura en base64 (imagen o PDF), la pasa a Claude y devuelve JSON con `kwh`, `precio_kwh`, `potencia_kw`, `dias`, `importe_total`, `comercializadora`.
  - `api/contacto.js`: formulario de contacto vía Nodemailer (SMTP DonDominio, puerto 587).
- **IA**: Anthropic SDK (`@anthropic-ai/sdk`), modelo `claude-haiku-4-5-20251001`.
- **Blog**: Estático en `blog/`. Cada artículo es `blog/{slug}/index.html` + `cover.jpg`.

### Blog automatizado
- `scripts/generar-articulo.js` genera un artículo nuevo cada mes vía GitHub Actions (`.github/workflows/blog.yml`, cron día 1 a las 9:00 UTC).
- `blog/publicados.json` es la **única fuente de verdad** para saber qué temas están publicados — nunca parsear `index.html` para esto.
- Imágenes: descargadas de **Pexels API** como `cover.jpg` estático en la carpeta del artículo. Las rutas en el HTML deben ser **absolutas** (`/blog/{slug}/cover.jpg`) — con `cleanUrls: true` las rutas relativas se rompen.
- `reconstruirIndice()` regenera `blog/index.html` completo cruzando `publicados.json` con las carpetas existentes.

### Diseño visual
- Paleta oscura con acento naranja (`--orange: #F97316`, `--orange-dk: #EA580C`), fondo `#171410`.
- Fuente: Inter (Google Fonts).
- Responsive con breakpoints en 680px y 480px.

### Otros archivos
- `flyer.html`: Flyer imprimible A5 (148×210mm), independiente del sitio.
- `logo/`: Logos en SVG, PNG y PDF.
- `tarifas/`: Capturas de tarifas de comercializadoras (Neon, Niba, Gana, Ides) usadas como referencia visual.

## Variables de entorno

En Vercel dashboard y como GitHub Secrets:
- `ANTHROPIC_API_KEY` — análisis de facturas + generación de artículos del blog
- `EMAIL_PASSWORD` — SMTP DonDominio para formulario de contacto
- `PEXELS_API_KEY` — imágenes para artículos del blog

## Despliegue

```bash
vercel --prod
```

El proyecto ya está vinculado: `projectId: prj_6jvzv8htVBkVpHGdPhtma8jY1Ooj`.
El blog se despliega automáticamente: GitHub Actions genera el artículo → hace push → Vercel auto-despliega.

## Lecciones aprendidas — errores a no repetir

- **`source.unsplash.com` está retirado desde 2023** — nunca usarlo. Para imágenes usar Pexels API descargando `cover.jpg` como archivo estático local.
- **Rutas de imagen relativas se rompen con `cleanUrls: true`** — la URL queda `/blog/slug` sin barra final y el navegador resuelve `cover.jpg` como `/blog/cover.jpg`. Siempre usar rutas absolutas.
- **`npm ci` requiere `package-lock.json` en el repo** — si no existe, hacer `npm install` localmente y commitear el lock file antes de que corra el workflow.
- **GitHub Actions necesita `permissions: contents: write`** para poder hacer `git push` desde el workflow.
- **Claude puede devolver bloques ```html en respuestas** — limpiar siempre con `.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim()`.
- **Nunca usar `git add -A` sin revisar** — puede incluir `node_modules` o `.claude/`. Añadir siempre archivos específicos. Verificar `.gitignore` antes del primer commit.
- **`publicados.json` como única fuente de verdad del blog** — nunca parsear `index.html` para detectar duplicados; el HTML puede estar desincronizado entre runs del workflow.

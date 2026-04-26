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

**Sí Ahorro** es un comparador de tarifas de luz y gas con IA. Desplegado en Vercel (proyecto `siahorro`).

### Stack
- **Frontend**: HTML/CSS/JS vanilla en un único `index.html` (sin framework). Todo el CSS está inline en `<style>` y el JS al final del `<body>`.
- **Backend**: Serverless function en `api/analizar.js` — ejecutada por Vercel. Recibe una factura en base64 (imagen o PDF), la pasa a Claude y devuelve un JSON con los datos extraídos.
- **IA**: Anthropic SDK (`@anthropic-ai/sdk`), modelo `claude-haiku-4-5-20251001`. La API key se inyecta como variable de entorno `ANTHROPIC_API_KEY` en Vercel.

### Flujo principal
1. El usuario sube una factura (imagen o PDF) en `index.html`.
2. El frontend codifica el archivo en base64 y hace `POST /api/analizar`.
3. La función serverless llama a Claude (visión/documentos) para extraer: `kwh`, `precio_kwh`, `potencia_kw`, `dias`, `importe_total`, `comercializadora`.
4. El frontend recibe el JSON y calcula el ahorro comparando con las tarifas disponibles.

### Diseño visual
- Paleta oscura con acento naranja (`--orange: #F97316`, `--orange-dk: #EA580C`).
- Fuente: Inter (Google Fonts).
- Responsive con breakpoints en 680px y 480px.
- Animaciones CSS: `fadeUp`, `floatY`, `shapeIn`, `marcasScroll`.

### Otros archivos
- `flyer.html`: Flyer imprimible A5 (148×210mm) del negocio, independiente del sitio.
- `logo/`: Logos en SVG, PNG y PDF (con y sin fondo transparente).
- `tarifas/`: Capturas de tarifas de comercializadoras (Neon, Niba, Gana, Ides) usadas como referencia.

## Despliegue

```bash
vercel --prod
```

La variable de entorno `ANTHROPIC_API_KEY` debe estar configurada en el dashboard de Vercel.
El proyecto ya está vinculado: `projectId: prj_6jvzv8htVBkVpHGdPhtma8jY1Ooj`.

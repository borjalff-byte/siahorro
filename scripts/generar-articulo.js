const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BLOG_DIR = path.join(__dirname, '..', 'blog');
const PUBLICADOS_PATH = path.join(BLOG_DIR, 'publicados.json');

const TEMAS = [
    { tema: 'cómo leer tu factura de la luz paso a paso',               img: 'electricity bill home' },
    { tema: 'qué es la potencia contratada y cómo elegir la correcta',  img: 'electric power meter home' },
    { tema: 'diferencias entre tarifa regulada PVPC y tarifa fija',     img: 'energy saving money' },
    { tema: 'cómo ahorrar en la factura del gas en invierno',           img: 'gas heating fireplace winter' },
    { tema: 'qué son la discriminación horaria y cuándo compensa',      img: 'clock electricity time' },
    { tema: 'por qué sube la luz en España y cómo protegerte',          img: 'electricity city night' },
    { tema: 'guía para cambiar de comercializadora de luz sin cortes',  img: 'house home energy' },
    { tema: 'cómo calcular el consumo real de tus electrodomésticos',   img: 'kitchen appliances modern' },
    { tema: 'qué es el bono social eléctrico y quién puede pedirlo',    img: 'family home help' },
    { tema: 'autoconsumo solar: cuánto se ahorra realmente',            img: 'solar panels roof' },
    { tema: 'errores comunes al contratar una tarifa de luz',           img: 'contract signing document' },
    { tema: 'cómo negociar tu tarifa de gas con la comercializadora',   img: 'gas boiler pipes' },
];

function slugify(str) {
    return str.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

function fechaLegible(iso) {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function cargarPublicados() {
    if (fs.existsSync(PUBLICADOS_PATH)) return JSON.parse(fs.readFileSync(PUBLICADOS_PATH, 'utf8'));
    return [];
}

function guardarPublicados(lista) {
    fs.writeFileSync(PUBLICADOS_PATH, JSON.stringify(lista, null, 2), 'utf8');
}

async function descargarImagen(url, destPath) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
}

async function obtenerYGuardarImagen(keywords, artDir) {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) { console.log('Sin PEXELS_API_KEY — sin imagen'); return false; }

    try {
        const res = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&orientation=landscape&per_page=5`,
            { headers: { Authorization: apiKey } }
        );
        if (!res.ok) { console.log(`Pexels error ${res.status}`); return false; }

        const data = await res.json();
        if (!data.photos?.length) { console.log('Pexels sin resultados'); return false; }

        const photo = data.photos[0];
        const imgUrl = photo.src.large2x || photo.src.large;
        await descargarImagen(imgUrl, path.join(artDir, 'cover.jpg'));
        console.log(`Imagen guardada: cover.jpg (${photo.photographer})`);
        return true;
    } catch (e) {
        console.log(`Error imagen: ${e.message}`);
        return false;
    }
}

async function generarArticulo(tema, imgKeywords) {
    console.log(`Generando: ${tema}`);

    const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
            role: 'user',
            content: `Eres un experto en ahorro energético en España. Escribe un artículo de blog completo y útil sobre: "${tema}".

El artículo debe:
- Tener un título atractivo (H1)
- Incluir entre 4 y 6 secciones con subtítulos (H2)
- Tener entre 600 y 900 palabras en total
- Estar orientado al consumidor español medio
- Ser práctico, con consejos concretos y accionables
- Mencionar naturalmente que Sí Ahorro puede ayudar al lector a comparar tarifas

Devuelve SOLO el contenido en HTML semántico: h1, h2, p, ul, li, strong. Sin DOCTYPE, sin html/head/body, sin estilos inline, sin bloques de código markdown.`
        }]
    });

    const contenidoHtml = msg.content[0].text
        .trim()
        .replace(/^```html\s*/i, '').replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '').trim();

    const tituloMatch = contenidoHtml.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const titulo = tituloMatch ? tituloMatch[1].replace(/<[^>]+>/g, '') : tema;
    const slug = slugify(titulo);
    const fecha = new Date().toISOString().split('T')[0];
    const fechaTexto = fechaLegible(fecha);

    const artDir = path.join(BLOG_DIR, slug);
    fs.mkdirSync(artDir, { recursive: true });

    const tieneImagen = await obtenerYGuardarImagen(imgKeywords, artDir);

    const imgHtml = tieneImagen ? `
<div class="art-img">
    <img src="/blog/${slug}/cover.jpg" alt="${titulo}" loading="lazy">
    <span class="img-credit">Foto: <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a></span>
</div>` : '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titulo} | Blog Sí Ahorro</title>
    <meta name="description" content="Artículo sobre ${tema}. Consejos prácticos de ahorro energético para reducir tu factura de luz y gas.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://www.si-ahorro.es/blog/${slug}/">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${titulo} | Blog Sí Ahorro">
    <meta property="og:url" content="https://www.si-ahorro.es/blog/${slug}/">
    <meta property="og:site_name" content="Sí Ahorro">${tieneImagen ? `\n    <meta property="og:image" content="https://www.si-ahorro.es/blog/${slug}/cover.jpg">` : ''}
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-C7GWD4QM2F"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-C7GWD4QM2F');</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --orange: #F97316; --orange-dk: #EA580C; --bg: #171410; --bg2: #1f1a14; --text: #FFFFFF; --t60: rgba(255,255,255,0.60); --t35: rgba(255,255,255,0.35); }
        html { scroll-behavior: smooth; }
        body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); overflow-x: hidden; }
        nav { position: sticky; top: 0; z-index: 100; background: rgba(23,20,16,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 1.5rem; display: flex; align-items: center; justify-content: space-between; height: 64px; }
        .nav-logo { display: flex; align-items: center; gap: .6rem; text-decoration: none; }
        .nav-logo img { height: 32px; width: auto; }
        .nav-logo span { font-weight: 700; font-size: 1.1rem; color: var(--text); }
        .nav-links { display: flex; gap: 1.5rem; list-style: none; }
        .nav-links a { color: var(--t60); text-decoration: none; font-size: .9rem; font-weight: 500; transition: color .2s; }
        .nav-links a:hover { color: var(--text); }
        .nav-cta { background: var(--orange); color: #fff; border: none; border-radius: 8px; padding: .5rem 1.1rem; font-size: .88rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: background .2s; }
        .nav-cta:hover { background: var(--orange-dk); }
        .art-hero { padding: 4rem 1.5rem 2rem; max-width: 760px; margin: 0 auto; }
        .art-meta { font-size: .82rem; color: var(--t35); margin-bottom: 1rem; }
        .art-hero h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); font-weight: 800; line-height: 1.25; }
        .art-img { max-width: 760px; margin: 1.5rem auto 0; padding: 0 1.5rem; }
        .art-img img { width: 100%; border-radius: 14px; display: block; max-height: 420px; object-fit: cover; }
        .img-credit { font-size: .72rem; color: var(--t35); margin-top: .4rem; display: block; text-align: right; }
        .img-credit a { color: var(--t35); text-decoration: none; }
        article { max-width: 760px; margin: 0 auto; padding: 2rem 1.5rem 5rem; }
        article h2 { font-size: 1.3rem; font-weight: 700; margin: 2.5rem 0 .8rem; color: var(--orange); }
        article p { color: var(--t60); line-height: 1.8; margin-bottom: 1.2rem; }
        article ul { padding-left: 1.4rem; margin-bottom: 1.2rem; }
        article li { color: var(--t60); line-height: 1.8; margin-bottom: .4rem; }
        article strong { color: var(--text); }
        .art-cta { background: linear-gradient(135deg, #1f1a14, #2a2018); border: 1px solid rgba(249,115,22,0.3); border-radius: 16px; padding: 2.5rem 2rem; text-align: center; margin: 3rem 0; }
        .art-cta h3 { font-size: 1.3rem; font-weight: 700; margin-bottom: .7rem; }
        .art-cta p { color: var(--t60); margin-bottom: 1.5rem; font-size: .95rem; }
        .art-cta a { background: var(--orange); color: #fff; text-decoration: none; border-radius: 10px; padding: .75rem 2rem; font-weight: 700; font-size: 1rem; transition: background .2s; display: inline-block; }
        .art-cta a:hover { background: var(--orange-dk); }
        .back-link { display: inline-flex; align-items: center; gap: .4rem; color: var(--t60); text-decoration: none; font-size: .88rem; margin-bottom: 2rem; transition: color .2s; }
        .back-link:hover { color: var(--text); }
        footer { border-top: 1px solid rgba(255,255,255,0.06); padding: 2rem 1.5rem; text-align: center; color: var(--t35); font-size: .82rem; }
        footer a { color: var(--t60); text-decoration: none; }
        @media (max-width: 680px) { .nav-links { display: none; } .art-hero { padding: 2.5rem 1rem 1.5rem; } .art-img { padding: 0 1rem; } article { padding: 1.5rem 1rem 3rem; } }
    </style>
</head>
<body>
<nav>
    <a href="/" class="nav-logo"><img src="/logo/logo-transparent-png.png" alt="Sí Ahorro"><span>Sí Ahorro</span></a>
    <ul class="nav-links">
        <li><a href="/#como-funciona">Cómo funciona</a></li>
        <li><a href="/#tarifas">Tarifas</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li><a href="/#contacto">Contacto</a></li>
    </ul>
    <a href="/#subir-factura" class="nav-cta">Analizar factura</a>
</nav>
<div class="art-hero">
    <a href="/blog/" class="back-link">← Volver al blog</a>
    <div class="art-meta">Publicado el ${fechaTexto} · Sí Ahorro</div>
    ${contenidoHtml.match(/<h1[^>]*>.*?<\/h1>/is)?.[0] ?? `<h1>${titulo}</h1>`}
</div>
${imgHtml}
<article>
${contenidoHtml.replace(/<h1[^>]*>.*?<\/h1>/is, '').trim()}
    <div class="art-cta">
        <h3>¿Quieres saber cuánto puedes ahorrar?</h3>
        <p>Sube tu factura y nuestra IA calcula en segundos las mejores tarifas para ti.</p>
        <a href="/#subir-factura">Analizar mi factura gratis</a>
    </div>
</article>
<footer>
    <p>© ${new Date().getFullYear()} Sí Ahorro · <a href="/blog/">Blog</a> · <a href="/#contacto">Contacto</a></p>
</footer>
</body>
</html>`;

    fs.writeFileSync(path.join(artDir, 'index.html'), html, 'utf8');
    console.log(`Guardado: blog/${slug}/`);
    return { slug, titulo, fecha, tieneImagen };
}

function reconstruirIndice() {
    const publicados = cargarPublicados();
    const carpetas = new Set(
        fs.readdirSync(BLOG_DIR).filter(f => fs.statSync(path.join(BLOG_DIR, f)).isDirectory())
    );
    const articulos = publicados
        .filter(p => carpetas.has(p.slug))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));

    const cards = articulos.map(art => {
        const imgThumb = art.tieneImagen
            ? `<div class="card-img"><img src="/blog/${art.slug}/cover.jpg" alt="${art.titulo}" loading="lazy"></div>`
            : '';
        return `
        <a href="/blog/${art.slug}/" class="card" data-art="${art.slug}" data-titulo="${art.titulo}" data-fecha="${art.fecha}">
            ${imgThumb}
            <div class="card-body">
                <div class="card-date">${fechaLegible(art.fecha)}</div>
                <h2>${art.titulo}</h2>
                <span class="card-link">Leer artículo →</span>
            </div>
        </a>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog sobre ahorro energético | Sí Ahorro</title>
    <meta name="description" content="Consejos y guías prácticas para reducir tu factura de luz y gas en España. Actualizado mensualmente.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://www.si-ahorro.es/blog/">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-C7GWD4QM2F"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-C7GWD4QM2F');</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --orange: #F97316; --orange-dk: #EA580C; --bg: #171410; --text: #FFFFFF; --t60: rgba(255,255,255,0.60); --t35: rgba(255,255,255,0.35); }
        html { scroll-behavior: smooth; }
        body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); overflow-x: hidden; }
        nav { position: sticky; top: 0; z-index: 100; background: rgba(23,20,16,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 1.5rem; display: flex; align-items: center; justify-content: space-between; height: 64px; }
        .nav-logo { display: flex; align-items: center; gap: .6rem; text-decoration: none; }
        .nav-logo img { height: 32px; width: auto; }
        .nav-logo span { font-weight: 700; font-size: 1.1rem; color: var(--text); }
        .nav-links { display: flex; gap: 1.5rem; list-style: none; }
        .nav-links a { color: var(--t60); text-decoration: none; font-size: .9rem; font-weight: 500; transition: color .2s; }
        .nav-links a:hover { color: var(--text); }
        .nav-cta { background: var(--orange); color: #fff; border: none; border-radius: 8px; padding: .5rem 1.1rem; font-size: .88rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: background .2s; }
        .nav-cta:hover { background: var(--orange-dk); }
        .hero { padding: 4rem 1.5rem 2.5rem; max-width: 900px; margin: 0 auto; }
        .hero h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 800; margin-bottom: .8rem; }
        .hero p { color: var(--t60); font-size: 1.05rem; line-height: 1.7; }
        .grid { max-width: 900px; margin: 0 auto; padding: 0 1.5rem 5rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
        .card { background: #1f1a14; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; overflow: hidden; text-decoration: none; color: var(--text); transition: border-color .2s, transform .2s; display: flex; flex-direction: column; }
        .card:hover { border-color: var(--orange); transform: translateY(-3px); }
        .card-img { width: 100%; height: 160px; overflow: hidden; }
        .card-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .3s; }
        .card:hover .card-img img { transform: scale(1.04); }
        .card-body { padding: 1.4rem; display: flex; flex-direction: column; gap: .5rem; flex: 1; }
        .card-date { font-size: .78rem; color: var(--t35); }
        .card h2 { font-size: 1rem; font-weight: 600; line-height: 1.45; flex: 1; }
        .card-link { font-size: .85rem; color: var(--orange); font-weight: 600; margin-top: .4rem; }
        footer { border-top: 1px solid rgba(255,255,255,0.06); padding: 2rem 1.5rem; text-align: center; color: var(--t35); font-size: .82rem; }
        footer a { color: var(--t60); text-decoration: none; }
        @media (max-width: 680px) { .nav-links { display: none; } .hero { padding: 2.5rem 1rem 1.5rem; } .grid { padding: 0 1rem 3rem; } }
    </style>
</head>
<body>
<nav>
    <a href="/" class="nav-logo"><img src="/logo/logo-transparent-png.png" alt="Sí Ahorro"><span>Sí Ahorro</span></a>
    <ul class="nav-links">
        <li><a href="/#como-funciona">Cómo funciona</a></li>
        <li><a href="/#tarifas">Tarifas</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li><a href="/#contacto">Contacto</a></li>
    </ul>
    <a href="/#subir-factura" class="nav-cta">Analizar factura</a>
</nav>
<div class="hero">
    <h1>Blog de ahorro energético</h1>
    <p>Guías y consejos prácticos para reducir tu factura de luz y gas en España.</p>
</div>
${articulos.length > 0 ? `<div class="grid">${cards}\n</div>` : '<div style="max-width:900px;margin:2rem auto;padding:0 1.5rem;color:rgba(255,255,255,0.6)"><p>Pronto publicaremos el primer artículo.</p></div>'}
<footer>
    <p>© ${new Date().getFullYear()} Sí Ahorro · <a href="/">Inicio</a> · <a href="/#contacto">Contacto</a></p>
</footer>
</body>
</html>`;

    fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), html, 'utf8');
    console.log(`Índice: ${articulos.length} artículo(s)`);
}

async function main() {
    const publicados = cargarPublicados();
    const temasPublicados = new Set(publicados.map(p => p.tema));
    const entrada = TEMAS.find(t => !temasPublicados.has(t.tema));
    if (!entrada) { console.log('Todos los temas publicados.'); return; }

    const articulo = await generarArticulo(entrada.tema, entrada.img);
    publicados.push({ tema: entrada.tema, ...articulo });
    guardarPublicados(publicados);
    reconstruirIndice();
    console.log('Listo.');
}

main().catch(err => { console.error(err); process.exit(1); });

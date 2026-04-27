const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'mailsrv1.dondominio.com',
    port: 587,
    secure: false,
    auth: {
        user: 'info@si-ahorro.es',
        pass: process.env.EMAIL_PASSWORD
    }
});

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const { nombre, email, telefono, tipo, datos, mejor_tarifa, ahorro_mes, consentimiento } = req.body || {};

    if (!nombre || !email || !telefono || !consentimiento) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    const ahorro_anual = ahorro_mes ? Math.round(ahorro_mes * 12) : null;

    await Promise.allSettled([
        // Email a Borja con todos los datos (incluyendo comercializadora)
        transporter.sendMail({
            from: '"Sí Ahorro Web" <info@si-ahorro.es>',
            to: 'info@si-ahorro.es',
            subject: `🔥 Nuevo lead comparador — ${nombre}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:520px">
                    <h2 style="color:#F97316">Nuevo lead del comparador</h2>
                    <table style="border-collapse:collapse;width:100%">
                        <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Nombre</td><td style="padding:8px">${nombre}</td></tr>
                        <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr>
                        <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Teléfono</td><td style="padding:8px"><a href="tel:${telefono}">${telefono}</a></td></tr>
                        <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Tipo</td><td style="padding:8px">${tipo || '–'}</td></tr>
                        <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Comercializadora actual</td><td style="padding:8px">${datos?.comercializadora || '–'}</td></tr>
                        <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Importe actual</td><td style="padding:8px">${datos?.importe_total ? datos.importe_total + '€/mes' : '–'}</td></tr>
                        <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5">Consumo</td><td style="padding:8px">${datos?.kwh ? datos.kwh + ' kWh' : '–'}</td></tr>
                        <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;color:#F97316">Mejor tarifa</td><td style="padding:8px;color:#F97316;font-weight:bold">${mejor_tarifa || '–'}</td></tr>
                        <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;color:#16a34a">Ahorro estimado</td><td style="padding:8px;color:#16a34a;font-weight:bold">${ahorro_mes ? ahorro_mes + '€/mes · ' + ahorro_anual + '€/año' : '–'}</td></tr>
                    </table>
                </div>
            `
        }),
        // Guardar en Supabase
        (async () => {
            if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return;
            await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads_comparador`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    nombre,
                    email,
                    telefono,
                    tipo: tipo || null,
                    comercializadora_actual: datos?.comercializadora || null,
                    kwh: datos?.kwh || null,
                    precio_kwh: datos?.precio_kwh || null,
                    importe_actual: datos?.importe_total || null,
                    mejor_tarifa: mejor_tarifa || null,
                    ahorro_mes: ahorro_mes || null,
                    consentimiento: true
                })
            });
        })()
    ]);

    return res.status(200).json({ ok: true });
};

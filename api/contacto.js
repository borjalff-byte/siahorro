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

async function guardarLead(datos) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return;
    try {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads_contacto`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(datos)
        });
    } catch { /* no bloquear el flujo si falla */ }
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const { nombre, email, telefono, mensaje, consentimiento } = req.body || {};

    if (!nombre || !email || !mensaje) {
        return res.status(400).json({ error: 'missing_fields' });
    }
    if (!consentimiento) {
        return res.status(400).json({ error: 'consent_required' });
    }

    try {
        await Promise.all([
            // Email interno a Borja
            transporter.sendMail({
                from: '"Sí Ahorro Web" <info@si-ahorro.es>',
                to: 'info@si-ahorro.es',
                replyTo: email,
                subject: `Nuevo mensaje de ${nombre}`,
                html: `
                    <h2>Nuevo mensaje desde si-ahorro.es</h2>
                    <p><strong>Nombre:</strong> ${nombre}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Teléfono:</strong> ${telefono || 'No indicado'}</p>
                    <p><strong>Mensaje:</strong></p>
                    <p>${mensaje.replace(/\n/g, '<br>')}</p>
                `
            }),
            // Acuse de recibo al cliente
            transporter.sendMail({
                from: '"Sí Ahorro" <info@si-ahorro.es>',
                to: email,
                subject: `Hemos recibido tu mensaje, ${nombre}`,
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#171410;color:#f5f0e8;padding:40px 32px;border-radius:12px">
                        <img src="https://www.si-ahorro.es/logo/logo-transparent-png.png" alt="Sí Ahorro" style="height:38px;margin-bottom:28px">
                        <h2 style="color:#F97316;font-size:1.25rem;margin:0 0 16px">Hola ${nombre},</h2>
                        <p style="line-height:1.7;color:#c8bfb0">Gracias por contactar con <strong style="color:#f5f0e8">Sí Ahorro</strong>.</p>
                        <p style="line-height:1.7;color:#c8bfb0">Hemos recibido tu consulta y te responderemos en menos de <strong style="color:#f5f0e8">24 horas</strong> en horario laboral.</p>
                        <p style="line-height:1.7;color:#c8bfb0">Si tienes cualquier urgencia puedes contactarnos directamente:</p>
                        <ul style="color:#c8bfb0;line-height:2">
                            <li>Email: <a href="mailto:info@si-ahorro.es" style="color:#F97316">info@si-ahorro.es</a></li>
                            <li>WhatsApp: <a href="https://wa.me/34655941658" style="color:#F97316">655 94 16 58</a></li>
                        </ul>
                        <p style="line-height:1.7;color:#c8bfb0;margin-top:24px">Un saludo,<br><strong style="color:#f5f0e8">El equipo de Sí Ahorro</strong></p>
                        <hr style="border:none;border-top:1px solid #2e2920;margin:32px 0">
                        <p style="font-size:0.75rem;color:#6b6050;line-height:1.6">Si no has enviado este mensaje, puedes ignorarlo.<br>Para solicitar la eliminación de tus datos escríbenos a <a href="mailto:info@si-ahorro.es" style="color:#6b6050">info@si-ahorro.es</a></p>
                    </div>
                `
            }),
            // Guardar lead en Supabase
            guardarLead({ nombre, email, telefono: telefono || null, mensaje, consentimiento: true })
        ]);

        return res.status(200).json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: 'send_failed', message: err.message });
    }
};

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

    const { nombre, email, telefono, mensaje } = req.body || {};

    if (!nombre || !email || !mensaje) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    try {
        await transporter.sendMail({
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
        });

        return res.status(200).json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: 'send_failed', message: err.message });
    }
};

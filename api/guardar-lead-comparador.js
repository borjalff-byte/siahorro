module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const { email, tipo, datos, consentimiento } = req.body || {};

    if (!email || !consentimiento) return res.status(400).json({ error: 'missing_fields' });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return res.status(200).json({ ok: true });

    try {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads_comparador`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                email,
                tipo: tipo || null,
                comercializadora_actual: datos?.comercializadora || null,
                kwh: datos?.kwh || null,
                precio_kwh: datos?.precio_kwh || null,
                importe_actual: datos?.importe_total || null,
                consentimiento: true
            })
        });
        return res.status(200).json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: 'db_error', message: err.message });
    }
};

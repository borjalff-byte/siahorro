const Anthropic = require('@anthropic-ai/sdk');

const PROMPT = `Eres un experto en facturas de energía españolas. Analiza esta factura y extrae los siguientes datos.
Devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.

Formato exacto requerido:
{
  "kwh": número (kWh consumidos en el período, puede ser decimal),
  "precio_kwh": número (precio de la energía activa en €/kWh, típicamente entre 0.05 y 0.40),
  "potencia_kw": número (potencia contratada en kW),
  "dias": número (días del período de facturación),
  "importe_total": número (importe total de la factura en €),
  "comercializadora": string (nombre de la empresa que emite la factura)
}

Si un dato no aparece claramente en la factura, pon null para ese campo.
Si el documento no es una factura de energía, devuelve: {"error": "no_es_factura"}`;

async function guardarLeadComparador(datos) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return;
    try {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads_comparador`, {
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

    const { imageData, mediaType, email, consentimiento, tipo } = req.body || {};

    if (!imageData || !mediaType) {
        return res.status(400).json({ error: 'missing_data' });
    }

    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!ALLOWED_TYPES.includes(mediaType)) {
        return res.status(415).json({ error: 'unsupported_format' });
    }

    // 15MB en base64 cubre cualquier foto de móvil o PDF de factura real
    const MAX_B64 = 15 * 1024 * 1024;
    if (imageData.length > MAX_B64) {
        return res.status(413).json({ error: 'file_too_large' });
    }

    try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const isImage = mediaType.startsWith('image/');
        const contentBlock = isImage
            ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } }
            : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageData } };

        const message = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [{
                role: 'user',
                content: [contentBlock, { type: 'text', text: PROMPT }]
            }]
        });

        const raw = message.content[0].text.trim();

        let data;
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            data = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        } catch {
            return res.status(200).json({ error: 'parse_error' });
        }

        if (!data.error && email && consentimiento) {
            guardarLeadComparador({
                email,
                tipo: tipo || null,
                comercializadora_actual: data.comercializadora || null,
                kwh: data.kwh || null,
                precio_kwh: data.precio_kwh || null,
                importe_actual: data.importe_total || null,
                consentimiento: true
            });
        }

        return res.status(200).json(data);

    } catch {
        return res.status(500).json({ error: 'server_error' });
    }
};

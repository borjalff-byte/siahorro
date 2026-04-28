const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_TIMEOUT_MS } = require('../config/constants');

const PROMPT = `Eres un experto en facturas de electricidad españolas (tarifa 2.0TD y 3.0TD). Analiza esta factura y extrae TODOS los datos que puedas leer.

Devuelve ÚNICAMENTE un objeto JSON válido, sin markdown, sin texto adicional, sin explicaciones.

Formato exacto requerido:
{
  "cliente": string (nombre completo del cliente tal como aparece en la factura),
  "cups": string (código CUPS, empieza siempre por ES, ej: ES0021000010565061LP),
  "atr": string (tipo de tarifa de acceso: "2.0TD", "3.0TD", "6.1TD", etc.),
  "comercializadora": string (nombre de la empresa que emite la factura),
  "fecha_inicio": string (fecha inicio período en formato YYYY-MM-DD),
  "fecha_fin": string (fecha fin período en formato YYYY-MM-DD),
  "dias": número entero (días del período de facturación),
  "potencia_p1_kw": número decimal (potencia contratada P1 en kW),
  "potencia_p2_kw": número decimal (potencia contratada P2 en kW),
  "kwh_total": número decimal (kWh totales consumidos en el período),
  "kwh_p1": número decimal (kWh consumidos en período P1, punta — 0 si no aparece desglosado),
  "kwh_p2": número decimal (kWh consumidos en período P2, llano — 0 si no aparece desglosado),
  "kwh_p3": número decimal (kWh consumidos en período P3, valle — 0 si no aparece desglosado),
  "coste_potencia": número decimal (importe total del término de potencia en €),
  "coste_energia": número decimal (importe total del término de energía activa en €),
  "e_reactiva": número decimal (importe energía reactiva en €, 0 si no aparece),
  "excesos_pot": número decimal (importe excesos de potencia en €, 0 si no aparece),
  "impuesto_electrico": número decimal (importe IEE impuesto especial electricidad en €),
  "otros_conceptos": número decimal (importe otros servicios o conceptos adicionales en €, 0 si no hay),
  "iva": número decimal (importe total del IVA aplicado en €),
  "total": número decimal (importe total a pagar en €)
}

IMPORTANTE:
- Si el documento NO es una factura de electricidad, devuelve exactamente: {"error": "no_es_factura"}
- Si un campo numérico no aparece en la factura, usa 0 (no null)
- Si un campo de texto no aparece, usa null
- Los importes deben ser positivos
- "otros_conceptos" incluye cualquier servicio adicional contratado (seguros, mantenimiento, etc.)`;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms}ms) en ${label}`)), ms)
    )
  ]);
}

function parseGeminiJson(raw) {
  const cleaned = raw.trim();
  // Intento 1: JSON directo
  try { return JSON.parse(cleaned); } catch {}
  // Intento 2: extraer bloque JSON con regex (por si Gemini añade texto extra)
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  throw new Error(`Gemini no devolvió JSON válido. Primeros 300 chars: ${cleaned.slice(0, 300)}`);
}

function validateAndNormalize(data) {
  if (data.error === 'no_es_factura') {
    throw new Error('El documento no parece una factura de electricidad.');
  }

  const required = ['dias', 'kwh_total', 'total', 'coste_potencia', 'coste_energia'];
  const missing = required.filter(k => data[k] == null || data[k] === '' || isNaN(Number(data[k])));
  if (missing.length > 0) {
    throw new Error(
      `No se detectaron estos campos esenciales: ${missing.join(', ')}. ` +
      `¿La factura está clara y es de electricidad? Intenta enviarla como archivo PDF.`
    );
  }

  // Normalizar todos los campos numéricos a Number, defaulting nulls a 0
  const numericFields = [
    'dias', 'kwh_total', 'total', 'coste_potencia', 'coste_energia',
    'e_reactiva', 'excesos_pot', 'impuesto_electrico', 'otros_conceptos', 'iva',
    'potencia_p1_kw', 'potencia_p2_kw',
    'kwh_p1', 'kwh_p2', 'kwh_p3'
  ];
  numericFields.forEach(f => {
    data[f] = data[f] != null && data[f] !== '' ? Number(data[f]) : 0;
  });

  // Sanity checks
  if (data.total <= 0) throw new Error('El total de la factura no es válido (≤ 0€).');
  if (data.dias <= 0 || data.dias > 365) throw new Error(`Período de facturación inválido: ${data.dias} días.`);
  if (data.kwh_total < 0) throw new Error('Los kWh consumidos no pueden ser negativos.');

  return data;
}

async function extractBillData(fileBuffer, mimeType) {
  const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
  const MAX_BYTES = 15 * 1024 * 1024; // 15MB

  if (!ALLOWED_MIME.includes(mimeType)) {
    throw new Error(`Formato no soportado: ${mimeType}. Envía la factura como JPG, PNG, WebP o PDF.`);
  }
  if (fileBuffer.length > MAX_BYTES) {
    throw new Error(
      `Archivo demasiado grande (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB). Máximo 15MB.`
    );
  }

  console.log('[gemini] Iniciando análisis', {
    mimeType,
    fileSizeKB: Math.round(fileBuffer.length / 1024)
  });

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-002' });

  // Normalizar mime type (Telegram a veces envía 'image/jpg')
  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;

  const imagePart = {
    inlineData: {
      data: fileBuffer.toString('base64'),
      mimeType: normalizedMime
    }
  };

  const result = await withTimeout(
    model.generateContent([PROMPT, imagePart]),
    GEMINI_TIMEOUT_MS,
    'Gemini extractBillData'
  );

  const raw = result.response.text();
  console.log('[gemini] Respuesta recibida', { chars: raw.length });

  const data = parseGeminiJson(raw);
  const validated = validateAndNormalize(data);

  console.log('[gemini] Extracción completada', {
    comercializadora: validated.comercializadora,
    dias: validated.dias,
    kwh_total: validated.kwh_total,
    total: validated.total
  });

  return validated;
}

module.exports = { extractBillData };

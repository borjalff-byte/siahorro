const {
  INDEXED_COMMISSION_STANDARD,
  INDEXED_COMMISSION_HIGH,
  INDEXED_HIGH_COMMISSION_THRESHOLD
} = require('../config/constants');
const ragService = require('./ragService');

/**
 * Calcula la comisión anual de Borja para una tarifa.
 * Devuelve null si no hay datos disponibles (nunca lanza).
 */
async function calculate(tarifa, billData, kwh_anual, ahorro_pct) {
  try {
    if (tarifa.tipo === 'indexada') {
      return calcularIndexada(billData, kwh_anual, ahorro_pct);
    }
    return await calcularFijaConRag(tarifa, kwh_anual);
  } catch (err) {
    console.error('[commission] Error calculando comisión para', tarifa.id, ':', err.message);
    return null;
  }
}

function calcularIndexada(billData, kwh_anual, ahorro_pct) {
  const p1 = billData.potencia_p1_kw || 0;
  const p2 = billData.potencia_p2_kw || 0;

  // Tramo alto si el ahorro supera el umbral configurado
  const rates = ahorro_pct >= INDEXED_HIGH_COMMISSION_THRESHOLD
    ? INDEXED_COMMISSION_HIGH
    : INDEXED_COMMISSION_STANDARD;

  const comision =
    (p1 * rates.p1_eur_kw) +
    (p2 * rates.p2_eur_kw) +
    (kwh_anual * rates.energia_eur_kwh);

  const tramo = ahorro_pct >= INDEXED_HIGH_COMMISSION_THRESHOLD ? 'alta' : 'estándar';
  console.log('[commission] Indexada', {
    tramo, p1, p2, kwh_anual: kwh_anual.toFixed(0), comision: comision.toFixed(2)
  });

  return Math.round(comision * 100) / 100;
}

async function calcularFijaConRag(tarifa, kwh_anual) {
  const mwh_anual = kwh_anual / 1000;
  const query = `comisión ${tarifa.comercializadora} consumo anual ${mwh_anual.toFixed(1)} MWh`;

  const chunks = await ragService.queryChunks(query, tarifa.comercializadora);

  if (!chunks || chunks.length === 0) {
    console.warn('[commission] Sin datos RAG para', tarifa.comercializadora);
    return null;
  }

  // Buscar valor numérico en los chunks retornados (más similar primero)
  for (const chunk of chunks) {
    const match = chunk.chunk_text.match(/(\d{1,6}(?:[.,]\d{1,2})?)\s*[€$]?\s*(?:\/año|\/año|por año|anual)?/i);
    if (match) {
      const valor = parseFloat(match[1].replace(',', '.'));
      if (valor > 0 && valor < 10000) { // sanity check: comisión razonable
        console.log('[commission] Fija RAG', {
          tarifa: tarifa.id, mwh_anual: mwh_anual.toFixed(2),
          valor, chunk: chunk.chunk_text.slice(0, 80)
        });
        return Math.round(valor * 100) / 100;
      }
    }
  }

  console.warn('[commission] No se encontró valor numérico válido en chunks para', tarifa.id);
  return null;
}

/**
 * Calcula comisiones para un array de { tarifa, ahorro_pct } en paralelo.
 * Devuelve { tarifa_id: comision_eur_anual | null }
 */
async function calculateAll(tarifasConAhorro, billData, kwh_anual) {
  const entries = await Promise.all(
    tarifasConAhorro.map(async ({ tarifa, ahorro_pct }) => {
      const comision = await calculate(tarifa, billData, kwh_anual, ahorro_pct);
      return [tarifa.id, comision];
    })
  );
  return Object.fromEntries(entries);
}

module.exports = { calculate, calculateAll };

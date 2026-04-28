const {
  INDEXED_COMMISSION_STANDARD,
  INDEXED_COMMISSION_HIGH,
  INDEXED_HIGH_COMMISSION_THRESHOLD
} = require('../config/constants');

// --- Tablas de comisión directas (actualizadas abril-2026) ---

function comisionIdes(billData, kwh_anual, ahorro_pct) {
  const p1 = billData.potencia_p1_kw || 0;
  const p2 = billData.potencia_p2_kw || 0;
  const rates = ahorro_pct >= INDEXED_HIGH_COMMISSION_THRESHOLD
    ? INDEXED_COMMISSION_HIGH
    : INDEXED_COMMISSION_STANDARD;
  const comision = (p1 * rates.p1_eur_kw) + (p2 * rates.p2_eur_kw) + (kwh_anual * rates.energia_eur_kwh);
  const tramo = ahorro_pct >= INDEXED_HIGH_COMMISSION_THRESHOLD ? 'alta' : 'estándar';
  console.log('[commission] Ides', { tramo, p1, p2, kwh_anual: kwh_anual.toFixed(0), comision: comision.toFixed(2) });
  return Math.round(comision * 100) / 100;
}

// Neon — por consumo anual kWh (tabla de activación)
function comisionNeon(kwh_anual) {
  if (kwh_anual <= 5000)  return 55;
  if (kwh_anual <= 10000) return 66;
  if (kwh_anual <= 30000) return 77;
  return 110;
}

// Niba — por potencia contratada P1 (kW)
function comisionNiba(potencia_p1_kw) {
  if (potencia_p1_kw <= 10) return 44;
  return 77; // >10 kW hasta 15 kW
}

// Gana RELAX — por consumo anual kWh (sin servicio adicional)
function comisionGana(kwh_anual) {
  if (kwh_anual <= 5000)  return 33;
  if (kwh_anual <= 10000) return 65;
  return 104; // 10.001-30.000 kWh (y >30.000 no publicado, se usa el último tramo)
}

function getComision(tarifa, billData, kwh_anual, ahorro_pct) {
  const cc = tarifa.comercializadora.toLowerCase();
  if (cc.includes('ides')) return comisionIdes(billData, kwh_anual, ahorro_pct);
  if (cc.includes('neon')) return comisionNeon(kwh_anual);
  if (cc.includes('niba')) return comisionNiba(billData.potencia_p1_kw || 0);
  if (cc.includes('gana')) return comisionGana(kwh_anual);
  console.warn('[commission] Comercializadora desconocida:', tarifa.comercializadora);
  return null;
}

async function calculateAll(tarifasConAhorro, billData, kwh_anual) {
  const entries = tarifasConAhorro.map(({ tarifa, ahorro_pct }) => {
    try {
      const comision = getComision(tarifa, billData, kwh_anual, ahorro_pct);
      console.log('[commission]', tarifa.id, '→', comision, '€/año');
      return [tarifa.id, comision];
    } catch (err) {
      console.error('[commission] Error en', tarifa.id, ':', err.message);
      return [tarifa.id, null];
    }
  });
  return Object.fromEntries(entries);
}

module.exports = { calculateAll };

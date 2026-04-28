
// --- Tablas de comisión directas (actualizadas abril-2026) ---

// Ides — comisión mensualizada: 0.02€/kW P1/mes + 0.02€/kW P2/mes + 0.015€/kWh mes
// Se anualiza × 12 para comparar con el resto
function comisionIdes(billData, kwh_anual) {
  const p1 = billData.potencia_p1_kw || 0;
  const p2 = billData.potencia_p2_kw || 0;
  const kwh_mes = kwh_anual / 12;
  const comision_mensual = (p1 * 0.02) + (p2 * 0.02) + (kwh_mes * 0.015);
  const comision_anual = Math.round(comision_mensual * 12 * 100) / 100;
  console.log('[commission] Ides', { p1, p2, kwh_mes: kwh_mes.toFixed(0), comision_mensual: comision_mensual.toFixed(2), comision_anual });
  return comision_anual;
}

// Neon RELAX — por consumo anual kWh
function comisionNeon(kwh_anual) {
  if (kwh_anual <= 5000)  return 33;
  if (kwh_anual <= 10000) return 65;
  return 104; // 10.001-30.000 kWh
}

// Niba — por potencia contratada P1 (kW)
function comisionNiba(potencia_p1_kw) {
  if (potencia_p1_kw <= 10) return 44;
  return 77; // >10 kW hasta 15 kW
}

// Gana — por consumo anual kWh (tabla activación SIPS)
function comisionGana(kwh_anual) {
  if (kwh_anual <= 5000)  return 55;
  if (kwh_anual <= 10000) return 66;
  if (kwh_anual <= 30000) return 77;
  return 110;
}

function getComision(tarifa, billData, kwh_anual) {
  const cc = tarifa.comercializadora.toLowerCase();
  if (cc.includes('ides')) return comisionIdes(billData, kwh_anual);
  if (cc.includes('neon')) return comisionNeon(kwh_anual);
  if (cc.includes('niba')) return comisionNiba(billData.potencia_p1_kw || 0);
  if (cc.includes('gana')) return comisionGana(kwh_anual);
  console.warn('[commission] Comercializadora desconocida:', tarifa.comercializadora);
  return null;
}

async function calculateAll(tarifasConAhorro, billData, kwh_anual) {
  const entries = tarifasConAhorro.map(({ tarifa }) => {
    try {
      const comision = getComision(tarifa, billData, kwh_anual);
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

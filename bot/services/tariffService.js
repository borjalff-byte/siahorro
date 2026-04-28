const tarifasData = require('../data/tarifas.json');
const { WEIGHT_SAVINGS, WEIGHT_COMMISSION, MAX_COMMISSION_REFERENCE } = require('../config/constants');

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula el coste total de una tarifa para los mismos kWh/potencia/días de la factura.
 * Reutiliza las MISMAS tasas de impuestos que aparecen en la factura real.
 */
function calcularCoste(tarifa, bill) {
  const { kwh_total, dias, potencia_p1_kw, potencia_p2_kw } = bill;

  // Derivar tasas impositivas reales desde la factura
  const baseIEE = (bill.coste_potencia || 0) + (bill.coste_energia || 0) + (bill.excesos_pot || 0);
  const tasaIEE = baseIEE > 0 ? (bill.impuesto_electrico || 0) / baseIEE : 0;

  const subtotalActual = bill.total - (bill.iva || 0);
  const tasaIVA = subtotalActual > 0 ? (bill.iva || 0) / subtotalActual : 0;

  let coste_energia, coste_potencia;

  if (tarifa.tipo === 'discriminacion_horaria') {
    // Usar kWh por período de la factura si están disponibles; si no, distribución estándar 2.0TD
    const tieneDesglose = (bill.kwh_p1 || 0) + (bill.kwh_p2 || 0) + (bill.kwh_p3 || 0) > 0;
    const p1 = tieneDesglose ? (bill.kwh_p1 || 0) : kwh_total * 0.30;
    const p2 = tieneDesglose ? (bill.kwh_p2 || 0) : kwh_total * 0.45;
    const p3 = tieneDesglose ? (bill.kwh_p3 || 0) : kwh_total * 0.25;
    coste_energia =
      p1 * (tarifa.precios.kwh_p1 || 0) +
      p2 * (tarifa.precios.kwh_p2 || 0) +
      p3 * (tarifa.precios.kwh_p3 || 0);
  } else {
    // fijo — mismo precio para todos los kWh
    coste_energia = kwh_total * (tarifa.precios.kwh || 0);
  }

  // Potencia: soporta tarifa con un único precio por kW/día (aplicado a P1+P2)
  // o con precios separados potencia_p1_kw_dia / potencia_p2_kw_dia
  if (tarifa.precios.potencia_kw_dia != null) {
    coste_potencia = ((potencia_p1_kw || 0) + (potencia_p2_kw || 0)) *
      tarifa.precios.potencia_kw_dia * dias;
  } else {
    coste_potencia =
      ((potencia_p1_kw || 0) * (tarifa.precios.potencia_p1_kw_dia || 0) +
       (potencia_p2_kw || 0) * (tarifa.precios.potencia_p2_kw_dia || 0)) * dias;
  }

  // Con nuestras comercializadoras no hay servicios adicionales
  const otros_conceptos = 0;
  const excesos_pot = 0;
  const e_reactiva = 0;

  const baseNueva = coste_potencia + coste_energia + excesos_pot;
  const impuesto_electrico = round2(baseNueva * tasaIEE);
  const subtotal = coste_potencia + coste_energia + excesos_pot + impuesto_electrico + otros_conceptos;
  const iva = round2(subtotal * tasaIVA);
  const total = round2(subtotal + iva);

  return {
    coste_potencia: round2(coste_potencia),
    coste_energia: round2(coste_energia),
    e_reactiva,
    excesos_pot,
    impuesto_electrico,
    otros_conceptos,
    iva,
    total
  };
}

/**
 * Proyección anual de kWh y ahorro desde un período de factura.
 * Misma metodología que usa IDES en sus comparativas.
 */
function proyectarAnual(bill, ahorro_periodo) {
  const factor = 365 / bill.dias;
  return {
    kwh_anual: round2((bill.kwh_total / bill.dias) * 365),
    mwh_anual: round2(bill.kwh_total / bill.dias * 365 / 1000),
    ahorro_anual: round2(ahorro_periodo * factor)
  };
}

/**
 * Evalúa todas las tarifas activas y devuelve el ranking por score.
 * commissions = { tarifa_id: comision_eur_anual | null }
 */
function calculateBest(bill, commissions = {}) {
  // Calcular kwh_anual para filtrar tarifas con límites de consumo
  const kwh_anual_cliente = round2((bill.kwh_total / bill.dias) * 365);

  const activas = tarifasData.tarifas.filter(t => {
    if (!t.activa) return false;
    if (t.kwh_anual_min != null && kwh_anual_cliente < t.kwh_anual_min) return false;
    if (t.kwh_anual_max != null && kwh_anual_cliente > t.kwh_anual_max) return false;
    return true;
  });

  if (activas.length === 0) {
    throw new Error(
      'No hay tarifas activas. Edita bot/data/tarifas.json y pon "activa": true con los precios reales.'
    );
  }

  const resultados = activas.map(tarifa => {
    const costes = calcularCoste(tarifa, bill);
    const ahorro_periodo = round2(bill.total - costes.total);
    const { kwh_anual, mwh_anual, ahorro_anual } = proyectarAnual(bill, ahorro_periodo);
    const ahorro_pct = bill.total > 0 ? ahorro_periodo / bill.total : 0;
    const comision = commissions[tarifa.id] ?? 0;

    // Score: 60% ahorro cliente + 40% comisión Borja (ambos normalizados)
    const ahorro_norm = Math.max(ahorro_pct, 0); // nunca penalizar por ahorro negativo en scoring
    const comision_norm = MAX_COMMISSION_REFERENCE > 0
      ? Math.min((comision || 0) / MAX_COMMISSION_REFERENCE, 1)
      : 0;
    const score = round2(WEIGHT_SAVINGS * ahorro_norm + WEIGHT_COMMISSION * comision_norm);

    return {
      tarifa,
      costes,
      ahorro_periodo,
      ahorro_anual,
      ahorro_pct: round2(ahorro_pct),
      kwh_anual,
      mwh_anual,
      comision: comision || 0,
      score
    };
  });

  // Ordenar por score descendente
  resultados.sort((a, b) => b.score - a.score);

  console.log('[tariff] Ranking tarifas:',
    resultados.map(r => `${r.tarifa.id}: score=${r.score} ahorro=${r.ahorro_periodo}€ comisión=${r.comision}€`).join(' | ')
  );

  const best = resultados[0];
  console.log('[tariff] Mejor:', {
    id: best.tarifa.id,
    ahorro_periodo: best.ahorro_periodo,
    ahorro_pct: (best.ahorro_pct * 100).toFixed(1) + '%',
    ahorro_anual: best.ahorro_anual,
    comision: best.comision
  });

  return { best, all: resultados };
}

module.exports = { calculateBest, calcularCoste, proyectarAnual, round2 };

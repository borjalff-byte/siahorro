module.exports = {
  // Pesos del scoring — ajusta para balancear ahorro cliente vs comisión Borja
  // Suma debe ser 1.0. Más WEIGHT_SAVINGS = priorizas ahorro al cliente.
  WEIGHT_SAVINGS: 0.6,
  WEIGHT_COMMISSION: 0.4,

  // Comisiones tarifa indexada (€/kW·año y €/kWh·año)
  INDEXED_COMMISSION_STANDARD: {
    p1_eur_kw: 0.0002,        // 0,02 c€/kW P1
    p2_eur_kw: 0.0002,        // 0,02 c€/kW P2
    energia_eur_kwh: 0.00015  // 0,015 c€/kWh consumido
  },
  INDEXED_COMMISSION_HIGH: {
    p1_eur_kw: 0.0004,        // 0,04 c€/kW P1
    p2_eur_kw: 0.0002,        // 0,02 c€/kW P2
    energia_eur_kwh: 0.00015  // 0,015 c€/kWh consumido
  },
  // Umbral de ahorro para aplicar comisión alta en indexada
  INDEXED_HIGH_COMMISSION_THRESHOLD: 0.15, // 15% de ahorro

  // Referencia para normalizar comisión en scoring (€/año)
  MAX_COMMISSION_REFERENCE: 500,

  // Timeouts
  GEMINI_TIMEOUT_MS: 30000,
  SUPABASE_TIMEOUT_MS: 10000,
};

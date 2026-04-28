const { SUPABASE_TIMEOUT_MS } = require('../config/constants');

async function save(data) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn('[supabase] Variables no configuradas, guardado omitido');
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bot_analisis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Supabase ${response.status}: ${err}`);
    }

    console.log('[supabase] Análisis guardado correctamente');
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Supabase timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { save };

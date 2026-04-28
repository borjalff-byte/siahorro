const { GoogleGenerativeAI } = require('@google/generative-ai');

async function embedText(text) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Busca chunks de comisiones relevantes para una comercializadora y consumo dado.
 * Devuelve array vacío si falla o no hay datos — nunca lanza.
 */
async function queryChunks(queryText, comercializadora = null, threshold = 0.65, count = 5) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.warn('[rag] Variables Supabase no configuradas');
      return [];
    }

    const embedding = await embedText(queryText);

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/rpc/match_commission_chunks`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          query_embedding: embedding,
          match_threshold: threshold,
          match_count: count
        })
      }
    );

    if (!response.ok) {
      console.warn('[rag] Supabase RPC error:', response.status, await response.text());
      return [];
    }

    let chunks = await response.json();

    // Filtrar por comercializadora si se especifica
    if (comercializadora) {
      chunks = chunks.filter(c =>
        c.comercializadora.toLowerCase().includes(comercializadora.toLowerCase().split(' ')[0])
      );
    }

    console.log('[rag] Chunks encontrados:', chunks.length, 'para query:', queryText.slice(0, 60));
    return chunks;
  } catch (err) {
    console.error('[rag] Error en queryChunks:', err.message);
    return [];
  }
}

module.exports = { embedText, queryChunks };

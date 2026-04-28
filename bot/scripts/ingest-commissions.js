/**
 * Script de ingestión de tablas de comisiones → Supabase pgvector
 *
 * Uso:
 *   1. Crea la carpeta bot/scripts/commission-docs/
 *   2. Coloca un archivo .txt por comercializadora con su tabla de comisiones
 *      Ejemplo: commission-docs/gana.txt, commission-docs/neon.txt
 *   3. Ejecuta desde la raíz del proyecto:
 *      node bot/scripts/ingest-commissions.js
 *
 * Formato recomendado para los .txt:
 *   Gana Energía — Tabla de comisiones 2025
 *   Tramo 0-5 MWh/año: 50 €/año
 *   Tramo 5-10 MWh/año: 80 €/año
 *   Tramo 10-20 MWh/año: 120 €/año
 *   Tramo 20-50 MWh/año: 180 €/año
 *   Tramo >50 MWh/año: 250 €/año
 */

if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config({ path: '.env.local' }); } catch {}
}

const fs = require('fs');
const path = require('path');
const { embedText } = require('../services/ragService');

const DOCS_DIR = path.join(__dirname, 'commission-docs');
const CHUNK_SIZE = 350;  // caracteres por chunk
const CHUNK_OVERLAP = 60;
const RATE_LIMIT_MS = 700; // pausa entre embeddings (free tier: ~100 rpm)

function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 15) chunks.push(chunk);
    start += size - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}

async function deleteExisting(comercializadora) {
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/commission_chunks?comercializadora=eq.${encodeURIComponent(comercializadora)}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    }
  );
  if (!resp.ok) console.warn('[ingest] No se pudieron eliminar chunks anteriores:', resp.status);
}

async function upsertChunk(comercializadora, chunk_text, embedding) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/commission_chunks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ comercializadora, chunk_text, embedding })
  });
  if (!resp.ok) throw new Error(`Supabase error ${resp.status}: ${await resp.text()}`);
}

async function ingestFile(filePath, comercializadora) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const chunks = chunkText(text);

  console.log(`\n[ingest] ${comercializadora}: ${chunks.length} chunks de ${path.basename(filePath)}`);

  // Eliminar chunks anteriores de esta comercializadora
  await deleteExisting(comercializadora);

  let success = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const embedding = await embedText(chunk);
      await upsertChunk(comercializadora, chunk, embedding);
      success++;
      process.stdout.write(`  Chunk ${i + 1}/${chunks.length} ✓\r`);
    } catch (err) {
      console.error(`\n  [ingest] Error en chunk ${i + 1}:`, err.message);
    }
    // Rate limit: esperar entre embeddings
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }

  process.stdout.write('\n');
  return success;
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.GEMINI_API_KEY) {
    console.error('❌ Faltan variables de entorno: SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY');
    process.exit(1);
  }

  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    console.log(`📁 Carpeta creada: ${DOCS_DIR}`);
    console.log('   Añade archivos .txt con las tablas de comisiones de cada comercializadora.');
    console.log('   Ejemplo: commission-docs/gana.txt, commission-docs/neon.txt');
    return;
  }

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.txt'));
  if (files.length === 0) {
    console.log('⚠️  No hay archivos .txt en commission-docs/');
    console.log('   Crea un archivo por comercializadora con su tabla de comisiones.');
    return;
  }

  console.log(`\n🚀 Iniciando ingestión de ${files.length} archivo(s)...\n`);
  let total = 0;

  for (const file of files) {
    const comercializadora = path.basename(file, '.txt');
    const count = await ingestFile(path.join(DOCS_DIR, file), comercializadora);
    console.log(`✅ ${comercializadora}: ${count} chunks guardados`);
    total += count;
  }

  console.log(`\n🎉 Ingestión completada: ${total} chunks totales en Supabase`);
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message);
  process.exit(1);
});

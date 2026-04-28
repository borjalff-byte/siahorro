-- ============================================================
-- Sí Ahorro Bot — Setup Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Activar extensión vectores (necesaria para comisiones RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla histórico de comparativas del bot
CREATE TABLE IF NOT EXISTS bot_analisis (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at                timestamptz DEFAULT now(),
  telegram_msg_id           bigint,
  comercializadora_actual   text,
  kwh_periodo               numeric,
  dias_periodo              integer,
  potencia_kw               numeric,
  importe_actual            numeric,
  kwh_anual_estimado        numeric,
  tarifa_recomendada_id     text,
  tarifa_recomendada_nombre text,
  ahorro_anual_estimado     numeric,
  ahorro_pct                numeric,
  comision_calculada        numeric,
  comparacion_completa      jsonb,
  gemini_raw_response       jsonb
);

-- 3. Tabla de chunks de comisiones (para RAG)
CREATE TABLE IF NOT EXISTS commission_chunks (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now(),
  comercializadora text NOT NULL,
  chunk_text      text NOT NULL,
  embedding       vector(768),
  metadata        jsonb
);

-- Índice para búsqueda vectorial eficiente
CREATE INDEX IF NOT EXISTS commission_chunks_embedding_idx
  ON commission_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- 4. Función RPC para búsqueda vectorial de comisiones
CREATE OR REPLACE FUNCTION match_commission_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.65,
  match_count     int   DEFAULT 5
)
RETURNS TABLE (
  chunk_text       text,
  comercializadora text,
  similarity       float
)
LANGUAGE sql STABLE AS $$
  SELECT
    chunk_text,
    comercializadora,
    1 - (embedding <=> query_embedding) AS similarity
  FROM commission_chunks
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- Verificación: debe devolver las tablas creadas
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('bot_analisis', 'commission_chunks');

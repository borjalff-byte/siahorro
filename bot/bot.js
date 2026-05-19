const { Telegraf } = require('telegraf');
const axios = require('axios');
const geminiService = require('./services/geminiService');
const tariffService = require('./services/tariffService');
const commissionService = require('./services/commissionService');
const pdfService = require('./services/pdfService');
const supabaseService = require('./services/supabaseService');
const tarifasData = require('./data/tarifas.json');

const ALLOWED_USER_ID = parseInt(process.env.TELEGRAM_ALLOWED_USER_ID, 10);

if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN no configurado');
if (!ALLOWED_USER_ID || isNaN(ALLOWED_USER_ID)) throw new Error('TELEGRAM_ALLOWED_USER_ID no configurado');

// ─── Descarga archivo de Telegram ─────────────────────────────────────────

async function downloadFile(ctx) {
  let fileId, mimeType;

  if (ctx.message.document) {
    const doc = ctx.message.document;
    fileId = doc.file_id;
    mimeType = doc.mime_type || 'application/pdf';
  } else if (ctx.message.photo) {
    const photos = ctx.message.photo;
    fileId = photos[photos.length - 1].file_id; // mayor resolución disponible
    mimeType = 'image/jpeg';
  } else {
    throw new Error('Tipo de archivo no reconocido. Envía la factura como foto o archivo PDF.');
  }

  const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
  if (!ALLOWED_MIME.includes(mimeType)) {
    throw new Error(`Formato no soportado (${mimeType}). Envía JPG, PNG, WebP o PDF.`);
  }

  const fileInfo = await ctx.telegram.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

  const response = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 20000 });
  const buffer = Buffer.from(response.data);

  console.log('[bot] Archivo descargado', { mimeType, sizeKB: Math.round(buffer.length / 1024) });
  return { buffer, mimeType };
}

// ─── Formatea mensaje de comisión ──────────────────────────────────────────

function formatCommissionMessage(best, commissions, billData) {
  const comision = commissions[best.tarifa.id];
  const mwh = best.mwh_anual.toFixed(2);
  const ahorroAnual = best.ahorro_anual.toFixed(2);
  const ahorroFactura = best.ahorro_periodo.toFixed(2);

  const comisionTexto = comision != null
    ? `<b>${comision.toFixed(2)} €/año</b>`
    : '<i>No disponible — añade tabla de comisiones con: npm run ingest</i>';

  const ahorroPct = Math.round(best.ahorro_pct * 100);

  return (
    `💰 <b>Tu comisión estimada</b>\n\n` +
    `Comercializadora: <b>${best.tarifa.comercializadora} — ${best.tarifa.nombre}</b>\n` +
    `Consumo anual estimado: <b>${mwh} MWh/año</b>\n` +
    `Ahorro en esta factura: <b>${ahorroFactura} €</b>\n` +
    `Ahorro anual estimado: <b>${ahorroAnual} €</b> (${ahorroPct}%)\n` +
    `Comisión estimada: ${comisionTexto}\n\n` +
    `<i>⚠️ Proyección basada en el período de la factura (${billData.dias} días × 365/días)</i>`
  );
}

// ─── Handler principal ─────────────────────────────────────────────────────

async function handleBill(ctx) {
  let processingMsg;

  try {
    processingMsg = await ctx.reply('⏳ Analizando factura...');

    // 1. Descargar archivo
    const { buffer, mimeType } = await downloadFile(ctx);

    // 2. Extraer datos con Gemini
    await ctx.telegram.editMessageText(
      ctx.chat.id, processingMsg.message_id, null,
      '🔍 Extrayendo datos con IA...'
    ).catch(() => {});
    const billData = await geminiService.extractBillData(buffer, mimeType);

    // 3. Primera pasada: calcular tarifas sin comisiones (para obtener ahorro_pct)
    await ctx.telegram.editMessageText(
      ctx.chat.id, processingMsg.message_id, null,
      '📊 Comparando tarifas...'
    ).catch(() => {});

    const activas = tarifasData.tarifas.filter(t => t.activa);
    const zeroComissions = Object.fromEntries(activas.map(t => [t.id, 0]));
    const { all: prelimAll } = tariffService.calculateBest(billData, zeroComissions);

    // 4. Calcular comisiones reales en paralelo (con ahorro_pct ya conocido)
    const commissions = await commissionService.calculateAll(
      prelimAll.map(r => ({ tarifa: r.tarifa, ahorro_pct: r.ahorro_pct })),
      billData,
      prelimAll[0].kwh_anual
    );

    // 5. Pasada final con comisiones reales → scoring definitivo
    const { best } = tariffService.calculateBest(billData, commissions);

    // 6. Generar PDF
    await ctx.telegram.editMessageText(
      ctx.chat.id, processingMsg.message_id, null,
      '📄 Generando informe PDF...'
    ).catch(() => {});
    const pdfBuffer = await pdfService.generate(billData, best, {
      comision_anual: commissions[best.tarifa.id]
    });

    console.log('[pdf] PDF generado', { sizeKB: Math.round(pdfBuffer.length / 1024) });

    // 7. Guardar en Supabase (non-blocking, no bloquea la respuesta)
    supabaseService.save({
      telegram_msg_id: ctx.message.message_id,
      comercializadora_actual: billData.comercializadora,
      kwh_periodo: billData.kwh_total,
      dias_periodo: billData.dias,
      potencia_kw: billData.potencia_p1_kw,
      importe_actual: billData.total,
      kwh_anual_estimado: best.kwh_anual,
      tarifa_recomendada_id: best.tarifa.id,
      tarifa_recomendada_nombre: `${best.tarifa.comercializadora} — ${best.tarifa.nombre}`,
      ahorro_anual_estimado: best.ahorro_anual,
      ahorro_pct: best.ahorro_pct,
      comision_calculada: commissions[best.tarifa.id],
      comparacion_completa: {
        all: prelimAll.map(r => ({
          id: r.tarifa.id,
          nombre: r.tarifa.nombre,
          score: r.score,
          ahorro_periodo: r.ahorro_periodo,
          ahorro_anual: r.ahorro_anual,
          comision: commissions[r.tarifa.id]
        }))
      },
      gemini_raw_response: billData
    }).catch(err => console.error('[supabase save]', err.message));

    // 8. Eliminar mensaje "procesando"
    await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    processingMsg = null;

    // 9. Enviar PDF
    const cliente = billData.cliente
      ? billData.cliente.split(' ').slice(0, 3).join('_').replace(/[^a-zA-Z0-9_]/g, '')
      : 'comparativa';
    await ctx.replyWithDocument(
      { source: pdfBuffer, filename: `comparativa_${cliente.toLowerCase()}.pdf` },
      { caption: `📄 Comparativa para ${billData.cliente || 'el cliente'}` }
    );

    // 10. Enviar mensaje de comisión por separado
    await ctx.reply(formatCommissionMessage(best, commissions, billData), {
      parse_mode: 'HTML'
    });

  } catch (err) {
    console.error('[bot handler] Error:', err.message, '\n', err.stack);
    const errMsg = `❌ ${err.message}`;
    if (processingMsg) {
      await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, errMsg)
        .catch(() => ctx.reply(errMsg).catch(() => {}));
    } else {
      await ctx.reply(errMsg).catch(() => {});
    }
  }
}

// ─── Crear instancia del bot ───────────────────────────────────────────────

function createBot() {
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  // Middleware de autenticación — primera barrera, antes de procesar nada
  bot.use((ctx, next) => {
    const userId = ctx.from?.id;
    if (userId !== ALLOWED_USER_ID) {
      console.warn('[bot] Mensaje rechazado de user_id:', userId);
      return; // Silencioso — no revela que el bot existe
    }
    return next();
  });

  // /start — instrucciones de uso
  bot.start(ctx => ctx.reply(
    '👋 Hola Borja! Envíame la factura de un cliente y recibirás:\n\n' +
    '📄 PDF con la comparativa de tarifas\n' +
    '💰 Tu comisión estimada\n\n' +
    '📎 <b>Consejo:</b> Envía la factura como <b>Archivo</b> (no foto) para mejor precisión de lectura.',
    { parse_mode: 'HTML' }
  ));

  // /help
  bot.help(ctx => ctx.reply(
    '📋 <b>Cómo usar el bot:</b>\n\n' +
    '1. Toca 📎 en el chat\n' +
    '2. Selecciona <b>Archivo</b> (no Foto)\n' +
    '3. Elige la factura en PDF\n' +
    '4. Espera ~20 segundos\n\n' +
    '✅ Formatos aceptados: PDF, JPG, PNG\n' +
    '📦 Tamaño máximo: 15 MB',
    { parse_mode: 'HTML' }
  ));

  // Facturas como archivo o foto
  bot.on(['photo', 'document'], handleBill);

  // Texto sin archivo adjunto
  bot.on('text', ctx => ctx.reply(
    '📎 Envíame la factura como archivo PDF o foto.\n' +
    'Usa el icono 📎 → <b>Archivo</b> para mejor calidad de lectura.',
    { parse_mode: 'HTML' }
  ));

  return bot;
}

module.exports = { createBot };

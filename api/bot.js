const { createBot } = require('../bot/bot');

// El bot se crea una vez por contenedor serverless (se reutiliza en llamadas en caliente)
let bot;
function getBot() {
  if (!bot) bot = createBot();
  return bot;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('Sí Ahorro Bot — activo');
  }

  try {
    await getBot().handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook] Error no capturado:', err.message, err.stack);
    // Siempre 200 para que Telegram no reintente el mismo update
    res.status(200).json({ ok: true });
  }
};

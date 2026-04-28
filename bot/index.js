// Punto de entrada para Railway (proceso persistente, polling mode)
// Para Vercel usa api/bot.js (webhook). Este archivo es para el futuro despliegue 24/7.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: '../.env.local' });
}

const { createBot } = require('./bot');

const bot = createBot();

bot.launch()
  .then(() => console.log('[bot] Iniciado en modo polling — esperando mensajes'))
  .catch(err => {
    console.error('[bot] Error fatal al iniciar:', err);
    process.exit(1);
  });

process.once('SIGINT', () => { console.log('Deteniendo bot...'); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { console.log('Deteniendo bot...'); bot.stop('SIGTERM'); });

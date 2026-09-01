const crypto = require('crypto');

function validateTelegramInitData(initData) {

  if (!initData) {
    throw new Error('Falta Telegram initData');
  }

  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    throw new Error('BOT_TOKEN no está configurado');
  }

  const params = new URLSearchParams(initData);

  const receivedHash = params.get('hash');

  if (!receivedHash) {
    throw new Error('Telegram hash inexistente');
  }

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const valid =
    calculatedHash.length === receivedHash.length &&
    crypto.timingSafeEqual(
      Buffer.from(calculatedHash),
      Buffer.from(receivedHash)
    );

  if (!valid) {
    throw new Error('Telegram initData inválido');
  }

  const user = params.get('user');

  if (!user) {
    throw new Error('Usuario de Telegram inexistente');
  }

  return JSON.parse(user);
}

module.exports = {
  validateTelegramInitData
};

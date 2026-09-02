const crypto = require('crypto');

/*
 * Los fallos de credencial son culpa de la petición, no del
 * servidor, así que se marcan con 401 para distinguirlos de
 * una caída real.
 */

function authError(message) {

  const error = new Error(message);

  error.status = 401;

  return error;
}

function validateTelegramInitData(initData) {

  if (!initData) {
    throw authError('Falta Telegram initData');
  }

  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    throw new Error('BOT_TOKEN no está configurado');
  }

  const params = new URLSearchParams(initData);

  const receivedHash = params.get('hash');

  if (!receivedHash) {
    throw authError('Telegram hash inexistente');
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
    throw authError('Telegram initData inválido');
  }

  const user = params.get('user');

  if (!user) {
    throw authError('Usuario de Telegram inexistente');
  }

  return JSON.parse(user);
}

module.exports = {
  validateTelegramInitData
};

// Генерирует строку ADMIN_PASSWORD_HASH и случайный TOKEN_SECRET для .env.
//   node hash-password.js 'МойПароль'
// Пароль нигде не сохраняется — в .env кладётся только хеш.
import crypto from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Использование: node hash-password.js "пароль-не-короче-8-символов"');
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
console.log(`ADMIN_PASSWORD_HASH=scrypt$${salt.toString('base64')}$${hash.toString('base64')}`);
console.log(`TOKEN_SECRET=${crypto.randomBytes(32).toString('base64url')}`);

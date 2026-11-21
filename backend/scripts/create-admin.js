require('dotenv').config();
const readline = require('node:readline');
const { Writable } = require('node:stream');
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../src/models');

// One-time owner setup; never hard-code a default admin password.
async function main() {
  let hideInput = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hideInput) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));
  const askPassword = async () => {
    if (!process.stdin.isTTY) throw new Error('Interactive password input requires a terminal.');
    process.stdout.write('Owner password (minimum 12 characters; hidden): ');
    hideInput = true;
    try { return await ask(''); }
    finally { hideInput = false; process.stdout.write('\n'); }
  };
  try {
    await sequelize.authenticate();
    const name = String(process.env.ADMIN_NAME || await ask('Owner name: ')).trim();
    const email = String(process.env.ADMIN_EMAIL || await ask('Owner email: ')).trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || await askPassword());
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
      throw new Error('Owner name, valid email, and a password of at least 12 characters are required.');
    }
    const exists = await User.findOne({ where: { email } });
    if (exists) throw new Error('This email already exists. The script will not change an existing account or role.');
    await User.create({ name, email, password_hash: await bcrypt.hash(password, 12), role: 'admin', is_active: true });
    console.log('Owner/Admin account created. Use this email and password on the website Login page.');
  } finally {
    rl.close();
    await sequelize.close();
  }
}
main().catch((err) => { console.error('Owner creation failed:', err.message); process.exitCode = 1; });

const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { generateToken } = require('../middleware/auth');

const router = express.Router();
const USERNAME_MIN = 2;
const USERNAME_MAX = 30;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 128;
const NAME_MIN = 1;
const NAME_MAX = 20;

// POST /api/auth/register
router.post('/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim();

  if (!username || !password || !name) {
    return res.status(400).json({ error: '用户名、密码、昵称不能为空' });
  }
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return res.status(400).json({ error: `用户名长度需在${USERNAME_MIN}-${USERNAME_MAX}字符之间` });
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return res.status(400).json({ error: `密码长度需在${PASSWORD_MIN}-${PASSWORD_MAX}字符之间` });
  }
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return res.status(400).json({ error: `昵称长度需在${NAME_MIN}-${NAME_MAX}字符之间` });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const family = db.prepare('SELECT id FROM families LIMIT 1').get();
  const passwordHash = bcrypt.hashSync(password, 10);

  const result = db.prepare(
    'INSERT INTO users (family_id, username, password_hash, name) VALUES (?, ?, ?, ?)'
  ).run(family.id, username, passwordHash, name);

  const userId = result.lastInsertRowid;

  // Create character for user
  db.prepare('INSERT INTO characters (user_id) VALUES (?)').run(userId);

  const user = { id: userId, family_id: family.id, name };
  const token = generateToken(user);

  res.json({ token, user: { id: userId, name, family_id: family.id } });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, name: user.name, family_id: user.family_id } });
});

module.exports = router;

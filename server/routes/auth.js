const express = require('express');
const bcrypt = require('bcryptjs');
const https = require('https');
const { db } = require('../db');
const { generateToken } = require('../middleware/auth');

const router = express.Router();
const USERNAME_MIN = 2;
const USERNAME_MAX = 30;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 128;
const NAME_MIN = 1;
const NAME_MAX = 20;

const WX_APPID = process.env.WX_APPID || '';
const WX_APP_SECRET = process.env.WX_APP_SECRET || '';

// 调用微信 jscode2session 接口
function wxCode2Session(code) {
  return new Promise((resolve, reject) => {
    if (!WX_APPID || !WX_APP_SECRET) {
      return reject(new Error('微信配置缺失：WX_APPID 或 WX_APP_SECRET 未设置'));
    }
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_APP_SECRET}&js_code=${code}&grant_type=authorization_code`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errcode) {
            reject(new Error(`微信接口错误: ${json.errcode} ${json.errmsg}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error('微信接口返回解析失败'));
        }
      });
    }).on('error', reject);
  });
}

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
    "INSERT INTO users (family_id, username, password_hash, name, status) VALUES (?, ?, ?, ?, '居家')"
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

// POST /api/auth/wx-login — 微信登录（code 换 openid，已绑定则直接返回 token）
router.post('/wx-login', async (req, res) => {
  const code = String(req.body.code || '').trim();
  if (!code) {
    return res.status(400).json({ error: 'code 不能为空' });
  }

  try {
    const wxRes = await wxCode2Session(code);
    const openid = wxRes.openid;
    if (!openid) {
      return res.status(500).json({ error: '获取 openid 失败' });
    }

    // 已绑定，直接登录
    const user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    if (user) {
      const token = generateToken(user);
      return res.json({ token, user: { id: user.id, name: user.name, family_id: user.family_id } });
    }

    // 未绑定，查询所有未绑定 openid 的角色
    const unboundUsers = db.prepare("SELECT id, name, username FROM users WHERE openid = '' OR openid IS NULL").all();
    res.json({ needBind: true, openid, unboundUsers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/wx-bind — 用 openid + 用户名确认绑定已有角色（不需要密码）
router.post('/wx-bind', (req, res) => {
  const openid = String(req.body.openid || '').trim();
  const userId = req.body.userId;
  const username = String(req.body.username || '').trim();

  if (!openid || !userId || !username) {
    return res.status(400).json({ error: '参数不完整' });
  }

  // 查找目标用户
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: '角色不存在' });
  }

  // 用户名确认（防止误选）
  if (user.username !== username) {
    return res.status(400).json({ error: '用户名不匹配' });
  }

  // 检查该 openid 是否已绑定其他账号
  const existingBind = db.prepare('SELECT id FROM users WHERE openid = ? AND id != ?').get(openid, user.id);
  if (existingBind) {
    return res.status(400).json({ error: '该微信已绑定其他账号' });
  }

  // 绑定 openid
  db.prepare('UPDATE users SET openid = ? WHERE id = ?').run(openid, user.id);

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, name: user.name, family_id: user.family_id } });
});

// POST /api/auth/wx-register — 微信新建角色
router.post('/wx-register', (req, res) => {
  const openid = String(req.body.openid || '').trim();
  const name = String(req.body.name || '').trim();

  if (!openid || !name) {
    return res.status(400).json({ error: 'openid 和昵称不能为空' });
  }
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return res.status(400).json({ error: `昵称长度需在${NAME_MIN}-${NAME_MAX}字符之间` });
  }

  // 检查 openid 是否已绑定
  const existingBind = db.prepare('SELECT id FROM users WHERE openid = ?').get(openid);
  if (existingBind) {
    return res.status(400).json({ error: '该微信已绑定账号' });
  }

  const family = db.prepare('SELECT id FROM families LIMIT 1').get();
  // 用 openid 后8位作为用户名，保证唯一
  const username = 'wx_' + openid.slice(-8);
  const passwordHash = bcrypt.hashSync(openid, 10); // 用 openid 作为密码（用户不需要知道）

  const result = db.prepare(
    "INSERT INTO users (family_id, username, password_hash, name, openid, status) VALUES (?, ?, ?, ?, ?, '居家')"
  ).run(family.id, username, passwordHash, name, openid);

  const userId = result.lastInsertRowid;
  db.prepare('INSERT INTO characters (user_id) VALUES (?)').run(userId);

  const user = { id: userId, family_id: family.id, name };
  const token = generateToken(user);
  res.json({ token, user: { id: userId, name, family_id: family.id } });
});

module.exports = router;

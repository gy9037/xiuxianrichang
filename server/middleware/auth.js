const jwt = require('jsonwebtoken');
const JWT_SECRET = 'xiuxian-richang-secret-2026';

function generateToken(user) {
  return jwt.sign({ id: user.id, family_id: user.family_id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

module.exports = { generateToken, authMiddleware, JWT_SECRET };

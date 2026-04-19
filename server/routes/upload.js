const express = require('express');
const multer = require('multer');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const { uploadFile, isConfigured } = require('../utils/r2');

const router = express.Router();
router.use(authMiddleware);

// 内存存储，限制 5MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式，仅支持 jpg/png/webp/gif'));
    }
  },
});

// multer 错误处理包装
function handleUpload(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
}

// POST /api/upload/avatar — 上传用户头像
router.post('/avatar', handleUpload('avatar'), async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'R2 存储未配置' });
  }
  if (!req.file) {
    return res.status(400).json({ error: '请选择图片' });
  }

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const key = `avatars/${req.user.id}_${Date.now()}${ext}`;
    const url = await uploadFile(key, req.file.buffer, req.file.mimetype);

    // 更新数据库中的头像 URL
    const { db } = require('../db');
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(url, req.user.id);

    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: `上传失败：${e.message}` });
  }
});

// POST /api/upload/image — 通用图片上传（未来用于行为打卡照片等）
router.post('/image', handleUpload('image'), async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'R2 存储未配置' });
  }
  if (!req.file) {
    return res.status(400).json({ error: '请选择图片' });
  }

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const key = `images/${req.user.id}/${Date.now()}${ext}`;
    const url = await uploadFile(key, req.file.buffer, req.file.mimetype);
    res.json({ url, key });
  } catch (e) {
    res.status(500).json({ error: `上传失败：${e.message}` });
  }
});

module.exports = router;

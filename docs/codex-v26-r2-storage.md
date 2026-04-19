# Codex 指令：V2.6 R2 存储集成

- **版本**：V2.6 R2
- **来源**：存储架构决策
- **范围**：Cloudflare R2 对象存储集成（头像上传、通用图片上传、备份推送）

## 前置条件（用户手动完成）

1. Cloudflare 控制台已创建 R2 bucket，名称 `xiuxianrichang`（已完成）
2. 已开启该 bucket 的公开访问，获得公开 URL（如 `https://pub-xxx.r2.dev`）
3. 已创建 R2 API Token，获得 `Account ID`、`Access Key ID`、`Secret Access Key`
4. 在部署环境中设置以下环境变量（或在 docker-compose.yml 同目录创建 `.env` 文件）：
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_PUBLIC_URL`（公开访问 URL，不带尾部斜杠）

---

## R2-1：安装依赖

**文件**：`package.json`

在 `dependencies` 中新增两个包：

**改前**（第 10-15 行）：
```json
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^11.0.0",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3"
  }
```

**改后**：
```json
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^11.0.0",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "@aws-sdk/client-s3": "^3.700.0",
    "multer": "^1.4.5-lts.1"
  }
```

**执行**：`npm install`

---

## R2-2：创建 R2 客户端工具模块

**文件**：`server/utils/r2.js`（新建）

```javascript
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'xiuxianrichang';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // 如 https://pub-xxx.r2.dev

let s3Client = null;

function getClient() {
  if (!s3Client) {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      return null; // R2 未配置，静默降级
    }
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

async function uploadFile(key, body, contentType) {
  const client = getClient();
  if (!client) throw new Error('R2 存储未配置');
  
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  
  return `${R2_PUBLIC_URL}/${key}`;
}

async function deleteFile(key) {
  const client = getClient();
  if (!client) return;
  
  await client.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  }));
}

function isConfigured() {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL);
}

module.exports = { uploadFile, deleteFile, isConfigured, getClient };
```

---

## R2-3：创建图片上传路由

**文件**：`server/routes/upload.js`（新建）

```javascript
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

// POST /api/upload/avatar — 上传用户头像
router.post('/avatar', upload.single('avatar'), async (req, res) => {
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
    res.status(500).json({ error: '上传失败：' + e.message });
  }
});

// POST /api/upload/image — 通用图片上传（未来用于行为打卡照片等）
router.post('/image', upload.single('image'), async (req, res) => {
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
    res.status(500).json({ error: '上传失败：' + e.message });
  }
});

module.exports = router;
```

---

## R2-4：注册上传路由

**文件**：`server/index.js`  
**位置**：第 21 行 `app.use('/api/family', ...)` 之后

**改前**（第 21-23 行）：
```javascript
app.use('/api/family', require('./routes/family'));

// SPA fallback
```

**改后**：
```javascript
app.use('/api/family', require('./routes/family'));
app.use('/api/upload', require('./routes/upload'));

// SPA fallback
```

---

## R2-5：备份脚本推送 R2

### 5a：创建上传脚本

**文件**：`scripts/upload-backup.js`（新建）

```javascript
// 将 SQLite 备份文件上传到 R2
const fs = require('fs');
const path = require('path');

async function main() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.log('No backup file to upload');
    process.exit(0);
  }
  
  // 检查 R2 是否配置
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.log('R2 not configured, skipping upload');
    process.exit(0);
  }
  
  const { uploadFile } = require('../server/utils/r2');
  const fileName = path.basename(filePath);
  const key = `backups/${fileName}`;
  const body = fs.readFileSync(filePath);
  
  try {
    await uploadFile(key, body, 'application/x-sqlite3');
    console.log(`Backup uploaded to R2: ${key}`);
  } catch (e) {
    console.error(`R2 upload failed: ${e.message}`);
    // 不 exit(1)，备份本身已成功，R2 上传失败不应阻断
  }
}

main();
```

### 5b：修改备份脚本

**文件**：`scripts/backup.sh`  
**位置**：第 15-20 行

**改前**：
```sh
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
echo "Backup created: $BACKUP_FILE"

# 清理 7 天前的备份
find "$BACKUP_DIR" -name "data_*.db" -mtime +7 -delete
echo "Old backups cleaned"
```

**改后**：
```sh
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
echo "Backup created: $BACKUP_FILE"

# 上传到 R2（如果已配置）
node /app/scripts/upload-backup.js "$BACKUP_FILE" 2>&1 || true

# 清理 7 天前的备份
find "$BACKUP_DIR" -name "data_*.db" -mtime +7 -delete
echo "Old backups cleaned"
```

---

## R2-6：Docker Compose 配置更新

**文件**：`docker-compose.yml`  
**位置**：`environment` 部分（第 11-13 行）

**改前**：
```yaml
    environment:
      - DB_PATH=/data/data.db
      - NODE_ENV=production
```

**改后**：
```yaml
    environment:
      - DB_PATH=/data/data.db
      - NODE_ENV=production
      - R2_ACCOUNT_ID=${R2_ACCOUNT_ID}
      - R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}
      - R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}
      - R2_BUCKET=xiuxianrichang
      - R2_PUBLIC_URL=${R2_PUBLIC_URL}
```

---

## R2-7：Dockerfile 更新

**文件**：`Dockerfile`  
**位置**：第 12 行

**改前**：
```dockerfile
COPY scripts/backup.sh ./scripts/
```

**改后**：
```dockerfile
COPY scripts/ ./scripts/
```

说明：改为复制整个 `scripts/` 目录，以包含新增的 `upload-backup.js`。

---

## R2-8：GET /api/character 返回头像 URL

**文件**：`server/routes/character.js`  
**位置**：第 103-106 行（SELECT 查询）和第 133-145 行（res.json）

### 8a：修改 SELECT 查询

**改前**（第 103-106 行）：
```javascript
  const character = db.prepare(
    `SELECT c.*, u.tags
     FROM characters c JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?`
  ).get(req.user.id);
```

**改后**：
```javascript
  const character = db.prepare(
    `SELECT c.*, u.tags, u.avatar
     FROM characters c JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?`
  ).get(req.user.id);
```

### 8b：在响应中包含 avatar

**改前**（第 133-145 行）：
```javascript
  res.json({
    character: {
      id: character.id,
      physique: character.physique,
      comprehension: character.comprehension,
      willpower: character.willpower,
      dexterity: character.dexterity,
      perception: character.perception,
      realm_stage: character.realm_stage,
      attr_cap: realm ? realm.attrCap : 3,
      total_attrs: getTotalAttrs(character),
      status: userStatus,
    },
```

**改后**：
```javascript
  res.json({
    character: {
      id: character.id,
      physique: character.physique,
      comprehension: character.comprehension,
      willpower: character.willpower,
      dexterity: character.dexterity,
      perception: character.perception,
      realm_stage: character.realm_stage,
      attr_cap: realm ? realm.attrCap : 3,
      total_attrs: getTotalAttrs(character),
      status: userStatus,
      avatar: character.avatar || '',
    },
```

---

## 文件变更清单

| 操作 | 文件路径 |
|------|----------|
| 修改 | `package.json` |
| 新建 | `server/utils/r2.js` |
| 新建 | `server/routes/upload.js` |
| 修改 | `server/index.js` |
| 新建 | `scripts/upload-backup.js` |
| 修改 | `scripts/backup.sh` |
| 修改 | `docker-compose.yml` |
| 修改 | `Dockerfile` |
| 修改 | `server/routes/character.js` |

## 验证步骤

1. `npm install` 确认依赖安装成功
2. 不配置 R2 环境变量时启动服务，确认不报错（静默降级）
3. 配置 R2 环境变量后，调用 `POST /api/upload/avatar` 上传图片，确认返回 R2 公开 URL
4. 调用 `GET /api/character` 确认返回的 character 对象包含 `avatar` 字段
5. 手动执行 `scripts/backup.sh`，确认备份文件上传到 R2 的 `backups/` 前缀下
6. Docker 构建并运行，确认容器内 `/app/scripts/` 包含 `backup.sh` 和 `upload-backup.js`

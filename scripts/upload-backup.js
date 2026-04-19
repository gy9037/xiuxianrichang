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

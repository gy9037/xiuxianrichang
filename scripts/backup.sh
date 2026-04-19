#!/bin/sh
# SQLite 数据库备份脚本
# 保留最近 7 天的备份

DB_PATH="${DB_PATH:-/data/data.db}"
BACKUP_DIR="/backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/data_$TIMESTAMP.db"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH"
  exit 1
fi

sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
echo "Backup created: $BACKUP_FILE"

# 上传到 R2（如果已配置）
node /app/scripts/upload-backup.js "$BACKUP_FILE" 2>&1 || true

# 清理 7 天前的备份
find "$BACKUP_DIR" -name "data_*.db" -mtime +7 -delete
echo "Old backups cleaned"

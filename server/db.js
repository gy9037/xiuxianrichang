const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      openid TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id)
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      physique REAL DEFAULT 0,
      comprehension REAL DEFAULT 0,
      willpower REAL DEFAULT 0,
      dexterity REAL DEFAULT 0,
      perception REAL DEFAULT 0,
      realm_stage TEXT DEFAULT '练气一阶',
      last_physique_activity TEXT DEFAULT NULL,
      last_comprehension_activity TEXT DEFAULT NULL,
      last_willpower_activity TEXT DEFAULT NULL,
      last_dexterity_activity TEXT DEFAULT NULL,
      last_perception_activity TEXT DEFAULT NULL,
      boss_wins TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS behaviors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      sub_type TEXT NOT NULL,
      description TEXT DEFAULT '',
      quality_template TEXT DEFAULT NULL,
      duration INTEGER DEFAULT NULL,
      quantity INTEGER DEFAULT NULL,
      quality TEXT NOT NULL,
      completed_at TEXT DEFAULT (datetime('now')),
      item_id INTEGER DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quality TEXT NOT NULL,
      attribute_type TEXT NOT NULL,
      temp_value REAL NOT NULL,
      status TEXT DEFAULT 'unused',
      source_behavior_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      creator_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      type TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      reward_description TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      target_user_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS bosses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wish_id INTEGER NOT NULL,
      target_user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      total_power REAL NOT NULL,
      physique REAL DEFAULT 0,
      comprehension REAL DEFAULT 0,
      willpower REAL DEFAULT 0,
      dexterity REAL DEFAULT 0,
      perception REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wish_id) REFERENCES wishes(id),
      FOREIGN KEY (target_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      boss_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      user_base_power REAL DEFAULT 0,
      user_item_power REAL DEFAULT 0,
      boss_power REAL DEFAULT 0,
      is_critical INTEGER DEFAULT 0,
      is_combo INTEGER DEFAULT 0,
      damage_reduction REAL DEFAULT 0,
      result TEXT NOT NULL,
      items_consumed TEXT DEFAULT '[]',
      rounds TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (boss_id) REFERENCES bosses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS streaks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      sub_type TEXT NOT NULL,
      current_streak INTEGER DEFAULT 1,
      last_date TEXT NOT NULL,
      UNIQUE(user_id, category, sub_type),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS custom_behaviors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      template TEXT NOT NULL,
      base_quantity INTEGER DEFAULT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(family_id, category, name),
      FOREIGN KEY (family_id) REFERENCES families(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- V2-F01 FB-05
    CREATE TABLE IF NOT EXISTS user_behavior_shortcuts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      sub_category TEXT DEFAULT NULL,
      sub_type TEXT NOT NULL,
      use_count INTEGER DEFAULT 1,
      last_used_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, category, sub_type),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // V2-F01 FB-05 - 补充 behaviors.sub_category 字段（兼容已存在情况）
  try {
    db.exec(`ALTER TABLE behaviors ADD COLUMN sub_category TEXT DEFAULT NULL`);
  } catch (e) {
    // V2-F01 FB-05 - 列已存在，忽略
  }

  // 行为简化 - 新增 intensity 字段
  try {
    db.exec(`ALTER TABLE behaviors ADD COLUMN intensity TEXT DEFAULT NULL`);
  } catch (e) {
    // 列已存在，忽略
  }

  // 放宽 quality_template 约束（SQLite 不支持 ALTER COLUMN，但新建表时已改为 DEFAULT NULL）
  // 对于已有数据库，通过 pragma 检查后重建表或忽略（已有数据的 quality_template 都有值，不会出问题）
  try {
    const qualityTemplateCol = db.prepare("PRAGMA table_info(behaviors)").all()
      .find(col => col.name === 'quality_template');
    if (qualityTemplateCol && qualityTemplateCol.notnull === 1) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        BEGIN TRANSACTION;

        CREATE TABLE IF NOT EXISTS behaviors_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          category TEXT NOT NULL,
          sub_type TEXT NOT NULL,
          description TEXT DEFAULT '',
          quality_template TEXT DEFAULT NULL,
          duration INTEGER DEFAULT NULL,
          quantity INTEGER DEFAULT NULL,
          quality TEXT NOT NULL,
          completed_at TEXT DEFAULT (datetime('now')),
          item_id INTEGER DEFAULT NULL,
          sub_category TEXT DEFAULT NULL,
          intensity TEXT DEFAULT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        INSERT INTO behaviors_new (
          id, user_id, category, sub_type, description, quality_template,
          duration, quantity, quality, completed_at, item_id, sub_category, intensity
        )
        SELECT
          id, user_id, category, sub_type, description, quality_template,
          duration, quantity, quality, completed_at, item_id, sub_category, intensity
        FROM behaviors;

        DROP TABLE behaviors;
        ALTER TABLE behaviors_new RENAME TO behaviors;

        COMMIT;
      `);
      db.pragma('foreign_keys = ON');
    }
  } catch (e) {
    db.pragma('foreign_keys = ON');
  }

  // 用户环境状态字段（居家/生病/出差）
  try {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT '居家'`);
  } catch (e) {
    // 列已存在，忽略
  }

  // 环境状态迁移：正常/休假 -> 居家
  db.prepare("UPDATE users SET status = '居家' WHERE status = '正常'").run();
  db.prepare("UPDATE users SET status = '居家' WHERE status = '休假'").run();

  // V2-F06 FB-06 — 行为表情互动表
  db.exec(`
    CREATE TABLE IF NOT EXISTS behavior_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      behavior_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(behavior_id, user_id, emoji),
      FOREIGN KEY (behavior_id) REFERENCES behaviors(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Seed default family if none exists
  const familyCount = db.prepare('SELECT COUNT(*) as count FROM families').get();
  if (familyCount.count === 0) {
    db.prepare('INSERT INTO families (name) VALUES (?)').run('默认家庭');
  }
}

module.exports = { db, initDB };

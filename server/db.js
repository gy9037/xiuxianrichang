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
      pinned_behaviors TEXT DEFAULT '[]',
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

    CREATE TABLE IF NOT EXISTS behavior_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      sub_type TEXT NOT NULL,
      target_count INTEGER NOT NULL,
      period_key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, sub_type, period_key),
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

  // 灵石货币字段
  try {
    db.exec(`ALTER TABLE users ADD COLUMN spirit_stones INTEGER DEFAULT 0`);
  } catch (e) {
    // 列已存在，忽略
  }

  // 快捷按钮置顶
  try {
    db.exec(`ALTER TABLE characters ADD COLUMN pinned_behaviors TEXT DEFAULT '[]'`);
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      checkin_date TEXT NOT NULL,
      streak INTEGER NOT NULL DEFAULT 1,
      reward INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, checkin_date),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 擂台系统
  db.exec(`
    CREATE TABLE IF NOT EXISTS arenas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      creator_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      config TEXT,
      currency TEXT DEFAULT 'stones',
      reward_pool INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (family_id) REFERENCES families(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS arena_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arena_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      submission TEXT,
      result TEXT,
      currency_change INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(arena_id, user_id),
      FOREIGN KEY (arena_id) REFERENCES arenas(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 筹码字段迁移
  try {
    db.exec('ALTER TABLE users ADD COLUMN chips INTEGER DEFAULT 0');
  } catch (e) {
    // 字段已存在，忽略
  }

  // 任务系统 - 活跃用户标记
  try {
    db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
  } catch (e) {
    // 列已存在，忽略
  }

  // V1.2.7 - 数据报告缓存表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      period_key TEXT NOT NULL,
      data TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, type, period_key),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 任务系统 - 4 张核心表
  db.exec(`
    CREATE TABLE IF NOT EXISTS quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      creator_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT NULL,
      goal_type TEXT DEFAULT 'manual',
      goal_config TEXT DEFAULT '{}',
      mode TEXT DEFAULT 'cooperative',
      reward_stones INTEGER DEFAULT 0,
      reward_items TEXT DEFAULT '[]',
      bounty_stones INTEGER DEFAULT 0,
      source_pool_id INTEGER DEFAULT NULL,
      status TEXT DEFAULT 'voting',
      vote_deadline TEXT DEFAULT NULL,
      deadline TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id)
    );

    CREATE TABLE IF NOT EXISTS quest_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      vote TEXT DEFAULT NULL,
      progress TEXT DEFAULT '{}',
      submission TEXT DEFAULT NULL,
      submitted_at TEXT DEFAULT NULL,
      result TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(quest_id, user_id),
      FOREIGN KEY (quest_id) REFERENCES quests(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS quest_judgments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER NOT NULL,
      target_user_id INTEGER NOT NULL,
      judge_user_id INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(quest_id, target_user_id, judge_user_id),
      FOREIGN KEY (quest_id) REFERENCES quests(id)
    );

    CREATE TABLE IF NOT EXISTS system_quest_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      requires_photo INTEGER DEFAULT 0,
      reward_quality TEXT DEFAULT '凡品'
    );
  `);

  // 任务系统索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_quests_family_status ON quests(family_id, status);
    CREATE INDEX IF NOT EXISTS idx_quests_family_type ON quests(family_id, type, created_at);
    CREATE INDEX IF NOT EXISTS idx_qp_quest ON quest_participants(quest_id);
    CREATE INDEX IF NOT EXISTS idx_qp_user ON quest_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_qj_quest ON quest_judgments(quest_id);
  `);

  // Seed default family if none exists
  const familyCount = db.prepare('SELECT COUNT(*) as count FROM families').get();
  if (familyCount.count === 0) {
    db.prepare('INSERT INTO families (name) VALUES (?)').run('默认家庭');
  }

  // 任务系统 - 系统悬赏任务池 seed
  const poolCount = db.prepare('SELECT COUNT(*) as count FROM system_quest_pool').get();
  if (poolCount.count === 0) {
    const insert = db.prepare(
      'INSERT INTO system_quest_pool (category, title, description, requires_photo, reward_quality) VALUES (?, ?, ?, ?, ?)'
    );
    const seedData = require('./data/quest-pool-seed.json');
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insert.run(
          item.category,
          item.title,
          item.description,
          item.requires_photo ? 1 : 0,
          item.reward_quality || '凡品'
        );
      }
    });
    insertMany(seedData);
  }
}

module.exports = { db, initDB };

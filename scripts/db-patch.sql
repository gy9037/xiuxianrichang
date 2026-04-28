-- ============================================
-- 修仙日常 V1.2.7 发版后数据修补脚本
-- 使用方式：sqlite3 data.db < scripts/db-patch.sql
-- 执行前请备份数据库：cp data.db data.db.bak
-- ============================================

-- 开启外键约束
PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- ============================================
-- 1. 调整灵石（增量修改，不覆盖现有值）
-- ============================================

-- Kun: -148
UPDATE users SET spirit_stones = spirit_stones - 148
WHERE name = 'Kun';

-- 诗欣雨: -900
UPDATE users SET spirit_stones = spirit_stones - 900
WHERE name = '诗欣雨';

-- 七分饱: +2308
UPDATE users SET spirit_stones = spirit_stones + 2308
WHERE name = '七分饱';

-- candice: -2044
UPDATE users SET spirit_stones = spirit_stones - 2044
WHERE name = 'candice';

-- 香辣锅巴: +719
UPDATE users SET spirit_stones = spirit_stones + 719
WHERE name = '香辣锅巴';

-- ============================================
-- 2. 删除用户「一郭炖不下」及所有关联数据
--    按外键依赖顺序，从叶子表往根表删
-- ============================================

-- 任务系统
DELETE FROM quest_judgments WHERE target_user_id IN (SELECT id FROM users WHERE name = '一郭炖不下')
   OR judge_user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');
DELETE FROM quest_participants WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 擂台
DELETE FROM arena_participants WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 报告
DELETE FROM reports WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 签到
DELETE FROM checkins WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 行为反应
DELETE FROM behavior_reactions WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 行为目标
DELETE FROM behavior_goals WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 行为快捷方式
DELETE FROM user_behavior_shortcuts WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 连续记录
DELETE FROM streaks WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 战斗
DELETE FROM battles WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- Boss（target_user_id）
DELETE FROM bosses WHERE target_user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 愿望（creator 或 target）
DELETE FROM wishes WHERE creator_id IN (SELECT id FROM users WHERE name = '一郭炖不下')
   OR target_user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 道具
DELETE FROM items WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 行为记录
DELETE FROM behaviors WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 角色
DELETE FROM characters WHERE user_id IN (SELECT id FROM users WHERE name = '一郭炖不下');

-- 用户
DELETE FROM users WHERE name = '一郭炖不下';

COMMIT;

-- ============================================
-- 3. 验证
-- ============================================

-- 确认用户已删除
SELECT '--- 验证：剩余用户 ---';
SELECT id, name, spirit_stones FROM users;

-- 确认灵石调整结果
SELECT '--- 验证：灵石余额 ---';
SELECT name, spirit_stones FROM users WHERE name IN ('Kun', '诗欣雨', '七分饱', 'candice', '香辣锅巴');

-- 确认无残留数据
SELECT '--- 验证：一郭炖不下残留检查 ---';
SELECT 'characters' AS tbl, COUNT(*) AS cnt FROM characters WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'behaviors', COUNT(*) FROM behaviors WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'items', COUNT(*) FROM items WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'streaks', COUNT(*) FROM streaks WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 'checkins', COUNT(*) FROM checkins WHERE user_id NOT IN (SELECT id FROM users);

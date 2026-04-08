# Codex Task: BUG-01 修复打卡型行为每日限一次问题

## 溯源标注
所有新增或修改的代码行，必须在行尾或上方添加注释：
```
// BUG-01 FB-用户反馈：打卡型行为每日限一次不合理
```

---

## 背景
当前所有 checkin（打卡型）行为每天只能提交一次。这个限制不合理——洗碗、买菜等行为一天可以做多次，应该允许多次提交。直接去掉每日一次的硬性限制，连击计算只在当天第一次打卡时更新即可。

`behaviors.json` 不需要任何修改。

---

## 任务：修改 `server/routes/behavior.js`

### 定位位置

文件约第 192 行，`if (template === 'checkin')` 块内，找到以下代码段：

```js
    if (streak) {
      const lastDate = streak.last_date;
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = formatLocalDate(yesterdayDate);
      if (lastDate === today) {
        return res.status(400).json({ error: '今天已经打卡过了' });
      } else if (lastDate === yesterday) {
        streakCount = streak.current_streak + 1;
        db.prepare('UPDATE streaks SET current_streak = ?, last_date = ? WHERE id = ?')
          .run(streakCount, today, streak.id);
      } else {
        streakCount = 1;
        db.prepare('UPDATE streaks SET current_streak = 1, last_date = ? WHERE id = ?')
          .run(today, streak.id);
      }
    } else {
      db.prepare('INSERT INTO streaks (user_id, category, sub_type, current_streak, last_date) VALUES (?, ?, ?, 1, ?)')
        .run(req.user.id, category, sub_type, today);
    }
```

### 替换为

```js
    if (streak) {
      const lastDate = streak.last_date;
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = formatLocalDate(yesterdayDate);

      // BUG-01 FB-用户反馈：打卡型行为每日限一次不合理
      // 去掉每日一次的硬性限制，连击只在当天第一次打卡时更新
      if (lastDate !== today) {
        if (lastDate === yesterday) {
          streakCount = streak.current_streak + 1;
          db.prepare('UPDATE streaks SET current_streak = ?, last_date = ? WHERE id = ?')
            .run(streakCount, today, streak.id);
        } else {
          streakCount = 1;
          db.prepare('UPDATE streaks SET current_streak = 1, last_date = ? WHERE id = ?')
            .run(today, streak.id);
        }
      } else {
        // BUG-01 FB-用户反馈：打卡型行为每日限一次不合理
        // 今天已打卡过，连击数保持不变，streakCount 取当前值
        streakCount = streak.current_streak;
      }
    } else {
      db.prepare('INSERT INTO streaks (user_id, category, sub_type, current_streak, last_date) VALUES (?, ?, ?, 1, ?)')
        .run(req.user.id, category, sub_type, today);
    }
```

---

## 验收标准

1. 洗碗、买菜等 checkin 行为同一天可多次提交，每次均返回成功并生成道具
2. 当天第一次打卡后连击 +1，当天第二次及以后打卡连击数不变
3. 跨天连击逻辑不受影响：昨天打卡今天再打连击正常 +1，断签后连击归 1
4. duration、quantity 类行为不受影响

# Codex Task: V2-F05 Boss战体验优化

## 溯源标注
所有新增/修改代码需注释 `// V2-F05 FB-04`

---

## 改动文件：`public/js/pages/wish.js`

只改前端，后端不需要改动。

### 改动 A：新增 getOddsText() 方法

在 WishPage 对象中插入：

```js
// V2-F05 FB-04 - 计算胜算文案
getOddsText(userPower, bossPower) {
  if (!bossPower || bossPower <= 0) return { text: '胜算未知', color: 'var(--text-dim)' };
  const ratio = userPower / bossPower;
  if (ratio >= 0.9) return { text: '胜算十成', color: 'var(--green)' };
  if (ratio >= 0.7) return { text: '胜算七成', color: 'var(--green)' };
  if (ratio >= 0.5) return { text: '胜算五成', color: 'var(--gold)' };
  if (ratio >= 0.3) return { text: '胜算三成', color: 'var(--gold)' };
  return { text: '胜算渺茫', color: 'var(--red)' };
},
```

### 改动 B：新增 getDefeatAdvice() 方法

```js
// V2-F05 FB-04 - 失败后差距分析和提升建议
getDefeatAdvice(battle) {
  const ATTR_MAP = {
    physique: { name: '体魄', category: '身体健康', advice: '多做运动类行为' },
    comprehension: { name: '悟性', category: '学习', advice: '多做学习类行为' },
    willpower: { name: '心性', category: '生活习惯', advice: '多做生活习惯类行为' },
    dexterity: { name: '灵巧', category: '家务', advice: '多做家务类行为' },
    perception: { name: '神识', category: '社交互助', advice: '多做社交互助类行为' },
  };
  const boss = battle.boss;
  if (!boss) return '继续积累道具，再来挑战！';

  // 找出 Boss 最强的属性（即玩家最需要补强的方向）
  const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
  const strongest = attrs.reduce((max, a) => (boss[a] > boss[max] ? a : max), attrs[0]);
  const info = ATTR_MAP[strongest];
  return `${info.name}方向差距最大，建议${info.advice}来提升战力。`;
},
```

### 改动 C：在挑战准备页展示胜算

找到渲染 Boss 信息的区域（prepare 阶段，展示 boss.total_power 的地方），在 Boss 总战力下方插入胜算展示：

```js
// V2-F05 FB-04 - 胜算展示
${(() => {
  const userPower = (this.character?.physique || 0) + (this.character?.comprehension || 0) +
    (this.character?.willpower || 0) + (this.character?.dexterity || 0) + (this.character?.perception || 0);
  const odds = WishPage.getOddsText(userPower, this.preparedBoss?.total_power);
  return `<div style="font-size:16px;font-weight:700;color:${odds.color};margin-top:8px">${odds.text}</div>`;
})()}
```

注意：如果 WishPage 没有缓存 character 数据，需要在 prepare 阶段同时请求 GET /api/character 并缓存到 `this.character`。

### 改动 D：战斗结果页优化

找到渲染战斗结果的区域：

**失败时**，找到失败提示文案（如"继续修炼，积蓄力量再来挑战"），替换为：

```js
// V2-F05 FB-04 - 失败后差距分析
<div style="color:var(--red);font-size:16px;font-weight:700">⚔️ 败北</div>
<div style="margin-top:8px;font-size:13px;color:var(--text-secondary)">
  ${e(WishPage.getDefeatAdvice(this.battleResult))}
</div>
<div style="font-size:12px;color:var(--text-dim);margin-top:4px">道具已消耗，积累后可再次挑战</div>
```

**胜利时**，找到胜利提示，替换为更醒目的展示：

```js
// V2-F05 FB-04 - 胜利仪式感
<div style="color:var(--gold);font-size:24px;font-weight:800;text-align:center">🎉 斩妖除魔！</div>
<div style="color:var(--gold);font-size:14px;text-align:center;margin-top:4px">愿望达成，现实奖励等你兑现</div>
```

---

## 验收标准

1. 挑战准备页显示胜算文案（胜算渺茫/三成/五成/七成/十成），颜色随胜算变化
2. 战斗失败后显示具体的属性差距分析和提升建议
3. 战斗胜利后展示更醒目的庆祝文案（金色大字）

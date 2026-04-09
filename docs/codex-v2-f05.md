# Codex 任务指令：V2-F05 Boss战体验优化（修补）

## 背景

V2-F05 的三个功能点已基本实现，但 `getDefeatAdvice()` 存在逻辑缺陷需要修复。

### 当前状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 挑战前胜算展示 | ✅ 已完成 | `getOddsText()` + `renderBattle()` |
| 失败差距分析 | ⚠️ 需修复 | 当前只看 Boss 最强属性，未对比角色属性 |
| 胜利仪式感 | ✅ 已完成 | 金色文字 + emoji |

## 任务：修复 `getDefeatAdvice()` 差距分析逻辑

### 文件

`public/js/pages/wish.js`

### 问题

当前 `getDefeatAdvice(battle)` 方法只取 Boss 属性最高的维度作为"差距最大"，但没有用角色属性做对比。正确逻辑应该是：对比角色与 Boss 在 5 个属性上的差值，找出差距最大的那个。

### 当前代码（需替换）

```javascript
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

    const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
    const strongest = attrs.reduce((max, a) => (boss[a] > boss[max] ? a : max), attrs[0]);
    const info = ATTR_MAP[strongest];
    return `${info.name}方向差距最大，建议${info.advice}来提升战力。`;
  },
```

### 替换为

```javascript
  // V2-F05 FB-04 - 失败后差距分析和提升建议
  getDefeatAdvice(battle) {
    const ATTR_MAP = { // V2-F05 FB-04
      physique: { name: '体魄', advice: '多做运动类行为' },
      comprehension: { name: '悟性', advice: '多做学习类行为' },
      willpower: { name: '心性', advice: '多做生活习惯类行为' },
      dexterity: { name: '灵巧', advice: '多做家务类行为' },
      perception: { name: '神识', advice: '多做社交互助类行为' },
    };
    const boss = battle.boss;
    const char = this.character; // V2-F05 FB-04 - 使用缓存的角色数据
    if (!boss || !char) return '继续积累道具，再来挑战！';

    // V2-F05 FB-04 - 计算角色与Boss各属性差距，找出差距最大的
    const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
    let maxGapAttr = attrs[0];
    let maxGap = -Infinity;
    for (const a of attrs) {
      const gap = (boss[a] || 0) - (char[a] || 0);
      if (gap > maxGap) {
        maxGap = gap;
        maxGapAttr = a;
      }
    }
    const info = ATTR_MAP[maxGapAttr];
    // V2-F05 FB-04 - 给出差距最大属性的具体建议
    if (maxGap <= 0) {
      return '属性差距不大，试试装备更多道具来提升战力！';
    }
    return `${info.name}差距最大（差 ${maxGap.toFixed(1)}），建议${info.advice}来提升。`;
  },
```

### 溯源注释

所有改动行带 `// V2-F05 FB-04`

## 验收标准

1. **挑战准备页**：Boss 信息卡片下方显示胜算文案（如"胜算三成"），颜色随胜算变化（绿/金/红）
2. **战败结果页**：显示角色与 Boss 差距最大的属性名称、具体差值、对应行为建议
   - 验证：角色体魄 10，Boss 体魄 50，其他属性差距更小 → 应显示"体魄差距最大（差 40.0）"
   - 验证：角色所有属性都高于 Boss → 应显示"属性差距不大，试试装备更多道具"
3. **胜利结果页**：金色大字"🎉 斩妖除魔！"+ 奖励展示
4. **无后端改动**：仅修改 `public/js/pages/wish.js`
5. **溯源注释**：所有新增/修改行包含 `// V2-F05 FB-04`

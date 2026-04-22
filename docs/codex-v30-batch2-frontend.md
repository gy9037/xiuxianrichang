# Codex 指令：V1.2.7 第二批 - 前端（打卡反馈Modal + 背包品质竖条 + 因果链 + 趋势图）

> **关联决策**：评审总结 §9（P0-1/P1-5/P1-6/P2-2）
> **前置依赖**：先执行 `codex-v30-batch2-backend.md`

---

## 一、打卡反馈重构：toast → 自定义 Modal（修改 behavior 页）

### 1.1 行为提交成功后的反馈弹窗（修改 behavior.wxml）

在页面底部（`</view>` 闭合之前）新增打卡成功弹窗：

```xml
<!-- 打卡成功弹窗 -->
<view wx:if="{{showRewardModal}}" class="modal-mask" bindtap="closeRewardModal">
  <view class="modal-content reward-modal" catchtap="">
    <view class="reward-header">
      <text class="reward-title">修炼成功</text>
    </view>

    <!-- 第一层：即时收益 -->
    <view class="reward-item-row">
      <text class="reward-item-name {{rewardData.qualityClass}}">{{rewardData.itemName}}</text>
      <text class="reward-quality-tag {{rewardData.qualityClass}}">{{rewardData.quality}}</text>
    </view>
    <view class="reward-attr-row">
      <text class="text-dim">{{rewardData.attrName}} +{{rewardData.tempValue}} 临时属性</text>
    </view>
    <!-- 道具描述 -->
    <view wx:if="{{rewardData.description}}" class="reward-desc">
      <text class="text-dim" style="font-style:italic">「{{rewardData.description}}」</text>
    </view>

    <!-- 第二层：积累进度 -->
    <view class="reward-progress">
      <view class="reward-progress-bar-bg">
        <view class="reward-progress-bar-fill" style="width:{{rewardData.progressPct}}%"></view>
      </view>
      <view class="reward-progress-text">
        <text class="text-dim">{{rewardData.attrName}}道具累计</text>
        <text class="text-bright" style="font-weight:600"> {{rewardData.attrTempTotal}}/10</text>
      </view>
    </view>

    <!-- 第三层：下一步引导 -->
    <view class="reward-actions">
      <button wx:if="{{rewardData.canSynth}}" class="btn btn-primary" bindtap="goToInventoryFromReward">
        去背包炼化
      </button>
      <button wx:else class="btn btn-secondary" bindtap="closeRewardModal">
        继续修炼
      </button>
      <view wx:if="{{!rewardData.canSynth}}" class="text-dim" style="font-size:24rpx;text-align:center;margin-top:12rpx">
        还差 {{rewardData.remaining}} 点可炼化
      </view>
    </view>

    <!-- 签到信息（首次签到时显示） -->
    <view wx:if="{{rewardData.showCheckin}}" class="reward-checkin">
      <text class="text-gold">💎 签到 +{{rewardData.checkinReward}} 灵石 · 连续{{rewardData.checkinStreak}}天</text>
    </view>
  </view>
</view>
```

### 1.2 弹窗样式（修改 behavior.wxss）

新增以下样式：

```css
/* 打卡成功弹窗 */
.modal-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: #1a1a2e;
  border-radius: 16rpx;
  width: 600rpx;
  padding: 40rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.5);
}

.reward-header {
  text-align: center;
  margin-bottom: 32rpx;
}

.reward-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #f8fafc;
}

.reward-item-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}

.reward-item-name {
  font-size: 32rpx;
  font-weight: 600;
}

.reward-quality-tag {
  font-size: 22rpx;
  padding: 2rpx 12rpx;
  border-radius: 6rpx;
  background: rgba(255, 255, 255, 0.06);
}

.reward-attr-row {
  text-align: center;
  font-size: 26rpx;
  margin-bottom: 8rpx;
}

.reward-desc {
  text-align: center;
  font-size: 22rpx;
  margin-bottom: 24rpx;
  padding: 0 16rpx;
}

.reward-progress {
  margin-bottom: 28rpx;
}

.reward-progress-bar-bg {
  height: 16rpx;
  background: #252540;
  border-radius: 8rpx;
  overflow: hidden;
  margin-bottom: 8rpx;
}

.reward-progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  border-radius: 8rpx;
  transition: width 0.3s;
}

.reward-progress-text {
  display: flex;
  justify-content: center;
  font-size: 24rpx;
}

.reward-actions {
  margin-bottom: 16rpx;
}

.reward-actions .btn {
  width: 100%;
}

.btn-secondary {
  background: #252540;
  color: #e2e8f0;
  border: 1rpx solid #334155;
}

.reward-checkin {
  text-align: center;
  padding-top: 16rpx;
  border-top: 1rpx solid #334155;
  font-size: 26rpx;
}

/* 品质颜色（行为页复用） */
.quality-fan { color: #94a3b8; }
.quality-liang { color: #10b981; }
.quality-shang { color: #3b82f6; }
.quality-ji { color: #f59e0b; }
```

### 1.3 弹窗逻辑（修改 behavior.js）

在 `data` 中新增：

```js
showRewardModal: false,
rewardData: null,
```

新增属性名映射（如果还没有的话）：

```js
const ATTR_NAMES = {
  physique: '体魄',
  comprehension: '悟性',
  willpower: '心性',
  dexterity: '灵巧',
  perception: '神识',
};

const QUALITY_CLASS = {
  '凡品': 'quality-fan',
  '良品': 'quality-liang',
  '上品': 'quality-shang',
  '极品': 'quality-ji',
};
```

**修改行为提交成功的回调**。找到当前的 `wx.showToast` 调用（提交成功后显示道具名的 toast），替换为：

```js
// 构建弹窗数据
const attrTempTotal = Math.round((res.attrTempTotal || 0) * 10) / 10;
const canSynth = attrTempTotal >= 10;
const remaining = canSynth ? 0 : Math.round((10 - attrTempTotal) * 10) / 10;
const progressPct = Math.min(Math.round((attrTempTotal % 10) / 10 * 100), 100);

const rewardData = {
  itemName: res.item.name,
  quality: res.item.quality,
  qualityClass: QUALITY_CLASS[res.item.quality] || 'quality-fan',
  tempValue: res.item.temp_value,
  attrName: ATTR_NAMES[res.item.attribute_type] || '',
  description: res.item.description || '',
  attrTempTotal,
  canSynth,
  remaining,
  progressPct: canSynth ? 100 : progressPct,
  showCheckin: res.checkinResult && !res.checkinResult.alreadyCheckedIn,
  checkinReward: res.checkinResult ? res.checkinResult.reward : 0,
  checkinStreak: res.checkinResult ? res.checkinResult.streak : 0,
};

this.setData({ showRewardModal: true, rewardData });
```

新增方法：

```js
closeRewardModal() {
  this.setData({ showRewardModal: false, rewardData: null });
},

goToInventoryFromReward() {
  this.setData({ showRewardModal: false, rewardData: null });
  wx.switchTab({ url: '/pages/inventory/inventory' });
},
```

---

## 二、背包页品质色竖条 + 品质标签底色（修改 inventory）

### 2.1 道具行增加品质色竖条（修改 inventory.wxml）

修改道具行的 class，增加品质竖条样式：

```xml
<view wx:for="{{displayItems}}" wx:key="id"
      class="item-row {{item.checked ? 'item-row-checked' : ''}} item-quality-{{item.qualityKey}}"
      data-index="{{index}}" bindtap="onToggleItem">
```

其中 `item.qualityKey` 需要在 JS 中预计算（见 2.3）。

### 2.2 品质竖条 + 标签底色样式（修改 inventory.wxss）

新增品质竖条样式（通过 `border-left` 实现）：

```css
/* 品质色竖条 */
.item-quality-liang {
  border-left: 6rpx solid #10b981;
}

.item-quality-shang {
  border-left: 6rpx solid #3b82f6;
}

.item-quality-ji {
  border-left: 6rpx solid #f59e0b;
}

/* 凡品无竖条，保持现状 */
.item-quality-fan {
  border-left: 6rpx solid transparent;
}
```

修改品质标签底色，将现有的 `.item-quality-tag` 统一底色改为按品质区分：

```css
/* 品质标签底色 */
.item-quality-tag.quality-fan {
  background: rgba(148, 163, 184, 0.12);
}

.item-quality-tag.quality-liang {
  background: rgba(16, 185, 129, 0.15);
}

.item-quality-tag.quality-shang {
  background: rgba(59, 130, 246, 0.15);
}

.item-quality-tag.quality-ji {
  background: rgba(245, 158, 11, 0.15);
}
```

删除原有的 `.item-quality-tag` 中的 `background: rgba(255, 255, 255, 0.06);`。

### 2.3 预计算品质 key（修改 inventory.js）

在构建 `displayItems` 的逻辑中，为每个 item 增加 `qualityKey` 字段：

```js
const QUALITY_KEY_MAP = {
  '凡品': 'fan',
  '良品': 'liang',
  '上品': 'shang',
  '极品': 'ji',
};

// 在遍历 items 构建 displayItems 时
item.qualityKey = QUALITY_KEY_MAP[item.quality] || 'fan';
```

---

## 三、背包页炼化引导提示栏（修改 inventory）

### 3.1 未选中道具时的底部提示（修改 inventory.wxml）

在合成摘要栏的条件判断之前，增加未选中时的提示栏：

```xml
<!-- 未选中时的炼化引导 -->
<view wx:if="{{selectedCount === 0 && items.length > 0}}" class="synth-hint-bar">
  <text class="text-dim" style="font-size:24rpx">选择同属性道具 → 累计 10 点即可炼化</text>
</view>
```

### 3.2 提示栏样式（修改 inventory.wxss）

```css
.synth-hint-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  padding: 20rpx 32rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  background: #1a1a2e;
  border-top: 1rpx solid #334155;
  text-align: center;
  z-index: 100;
}
```

### 3.3 合成摘要栏增加进度条（修改 inventory.wxml）

在合成摘要栏的文字信息上方增加进度条：

```xml
<view wx:if="{{selectedCount > 0}}" class="synth-bar">
  <view class="synth-info">
    <!-- 进度条 -->
    <view class="synth-progress-bar-bg">
      <view class="synth-progress-bar-fill" style="width:{{synthProgressPct}}%"></view>
    </view>
    <view class="text-bright" style="font-size: 28rpx;">
      已选 {{selectedCount}} 件 · 总值 {{selectedTotal}}
    </view>
    <!-- 其余保持不变 -->
```

### 3.4 进度条样式（修改 inventory.wxss）

```css
.synth-progress-bar-bg {
  height: 12rpx;
  background: #252540;
  border-radius: 6rpx;
  overflow: hidden;
  margin-bottom: 12rpx;
}

.synth-progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  border-radius: 6rpx;
}
```

### 3.5 计算进度百分比（修改 inventory.js）

在计算合成摘要的逻辑中，增加进度百分比：

```js
// selectedTotal 已有，增加进度百分比
const synthProgressPct = Math.min(Math.round((selectedTotal % 10) / 10 * 100), 100);
// 如果 selectedTotal >= 10，进度条显示满
const finalProgressPct = selectedTotal >= 10 ? 100 : synthProgressPct;
```

在 `setData` 中增加 `synthProgressPct: finalProgressPct`。

---

## 四、跨页面因果链

### 4.1 炼化成功 Modal（修改 inventory）

找到当前炼化成功后的处理逻辑（`onSynthesize` 方法中合成成功的回调），将 toast 替换为 Modal：

在 inventory.wxml 中新增炼化成功弹窗：

```xml
<!-- 炼化成功弹窗 -->
<view wx:if="{{showSynthModal}}" class="rules-overlay" bindtap="closeSynthModal">
  <view class="rules-modal" catchtap="">
    <view class="rules-title">炼化成功</view>
    <view style="text-align:center;margin-bottom:24rpx">
      <text style="font-size:48rpx;font-weight:800;color:#8b5cf6">+{{synthResult.gain}}</text>
      <text style="font-size:28rpx;color:#e2e8f0;margin-left:8rpx">{{synthResult.attrName}} 永久属性</text>
    </view>
    <view style="text-align:center;margin-bottom:32rpx">
      <text class="text-dim" style="font-size:24rpx">当前 {{synthResult.attrName}} = {{synthResult.newValue}}</text>
    </view>
    <button class="btn btn-primary" bindtap="closeSynthModal">确认</button>
  </view>
</view>
```

在 inventory.js 的 `data` 中新增：

```js
showSynthModal: false,
synthResult: null,
```

在合成成功回调中，替换 toast 为：

```js
this.setData({
  showSynthModal: true,
  synthResult: {
    gain: res.gain,  // 后端返回的永久属性增加值
    attrName: ATTR_NAMES[res.attribute_type] || '',
    newValue: res.newValue,  // 后端返回的合成后属性值
  },
});
```

新增方法：

```js
closeSynthModal() {
  this.setData({ showSynthModal: false, synthResult: null });
  this.loadData(); // 刷新道具列表
},
```

### 4.2 愿望胜利后跳转（修改 wish 页）

找到愿望挑战成功后的处理逻辑，在胜利提示中增加"去兑现奖励"按钮。

在 wish.wxml 的战斗结果展示区域，找到胜利状态的展示，增加：

```xml
<button wx:if="{{battleResult === 'win'}}" class="btn btn-primary btn-small" style="margin-top:16rpx" bindtap="goToRewards">
  去兑现奖励 →
</button>
```

在 wish.js 中新增：

```js
goToRewards() {
  wx.switchTab({ url: '/pages/inventory/inventory' });
  // 切换到奖励 tab（通过全局变量或页面参数传递）
  getApp().globalData.inventoryTab = 'rewards';
},
```

在 inventory.js 的 `onShow` 中检查：

```js
const app = getApp();
if (app.globalData.inventoryTab) {
  this.setData({ activeSection: app.globalData.inventoryTab });
  app.globalData.inventoryTab = null;
}
```

---

## 五、趋势图最右侧固定今天（修改 home）

后端 `getRecentTrend` 已经是最右侧=今天的顺序。前端 `buildTrendBars` 也是按 days 数组顺序渲染。

需要确认的是 weekday 显示。当前用的是星期几（日/一/二/...），最右侧应该显示"今"而不是星期几，让用户一眼看出哪根是今天。

修改 `buildTrendBars` 方法（home.js 约第 220-244 行），将今天的 weekday 改为"今"：

```js
return dailyData.map(d => {
  const isToday = d.day === today;
  const barHeight = d.total > 0 ? Math.max(Math.round((d.total / maxTotal) * 100), 4) : 2;
  const weekday = isToday ? '今' : WEEKDAYS[new Date(`${d.day}T00:00:00`).getDay()];
  // ... 其余不变
```

---

## 六、验证清单

1. 行为提交成功后弹出自定义 Modal（不再是 toast），展示道具名+品质+描述+属性临时值+进度条+下一步引导
2. 进度条正确显示（attrTempTotal / 10 的百分比）
3. attrTempTotal >= 10 时显示"去背包炼化"按钮，点击跳转背包页
4. attrTempTotal < 10 时显示"继续修炼"按钮和"还差 N 点"提示
5. 首次签到时弹窗底部显示签到灵石信息
6. 背包页道具行左侧有品质色竖条（凡品透明/良品绿/上品蓝/极品金）
7. 品质标签底色跟随品质色
8. 未选中道具时底部显示炼化引导提示
9. 选中道具后合成摘要栏顶部有进度条
10. 炼化成功后弹出 Modal 显示属性提升值和当前属性值
11. 愿望挑战胜利后有"去兑现奖励"按钮，点击跳转背包页奖励 tab
12. 趋势图最右侧柱子标签显示"今"

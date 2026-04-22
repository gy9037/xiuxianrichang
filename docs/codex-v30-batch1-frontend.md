# Codex 指令：V1.2.7 第一批 - 前端（首页 HUD + 签到浮动按钮）

> **关联决策**：评审总结 §11（签到+货币）、§12（工作流程约定）
> **前置依赖**：先执行 `codex-v30-batch1-backend.md`（后端已部署）

---

## 一、首页顶部改造：去掉导航栏标题，改为自定义 HUD

### 1.1 隐藏原生导航栏

修改 `miniprogram/pages/home/home.json`，添加自定义导航栏配置：

```json
{
  "navigationStyle": "custom"
}
```

这会隐藏原生导航栏（标题"修仙日常"和底色），页面内容从屏幕顶部开始。

### 1.2 新增 HUD 信息栏（修改 home.wxml）

在 `<view class="page-container">` 的最开头（Hero 区域之前）插入 HUD：

```xml
<!-- HUD 信息栏 -->
<view class="hud-bar" style="padding-top:{{statusBarHeight}}px">
  <view class="hud-content">
    <view class="hud-left">
      <text class="hud-name">{{character.name}}</text>
      <view class="realm-badge-small">{{character.realm_stage}}</view>
    </view>
    <view class="hud-right">
      <view class="hud-stones" bindtap="showCheckin">
        <text class="hud-stones-icon">💎</text>
        <text class="hud-stones-num">{{spiritStones}}</text>
      </view>
    </view>
  </view>
</view>
```

同时修改 Hero 区域：
- 删除 Hero 卡片中第一行的角色名（`{{character.name}}`），因为已经移到 HUD
- 保留环境状态 badge（居家/生病/出差）在 Hero 卡片中
- Hero 卡片第一行改为只显示环境状态 badge + 修炼状态信息

### 1.3 HUD 样式（修改 home.wxss）

新增以下样式：

```css
/* HUD 信息栏 */
.hud-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #0f0f1a;
}

.hud-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 24rpx 16rpx;
}

.hud-left {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.hud-name {
  font-size: 34rpx;
  font-weight: 700;
  color: #f8fafc;
}

.realm-badge-small {
  background: linear-gradient(135deg, #8b5cf6, #f59e0b);
  color: #fff;
  font-size: 20rpx;
  font-weight: 600;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
}

.hud-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.hud-stones {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background: rgba(245, 158, 11, 0.12);
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
}

.hud-stones-icon {
  font-size: 24rpx;
}

.hud-stones-num {
  font-size: 26rpx;
  font-weight: 600;
  color: #f59e0b;
}
```

### 1.4 获取状态栏高度（修改 home.js）

在 `data` 中新增：

```js
statusBarHeight: 0,
spiritStones: 0,
```

在 `onLoad` 中获取状态栏高度：

```js
const sysInfo = wx.getWindowInfo();
this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44 });
```

在 `loadData` 的数据处理中，从 `charData` 中提取灵石和签到信息：

```js
// 在 setData 中增加
spiritStones: charData.spiritStones || 0,
checkinStatus: charData.checkinStatus || null,
```

---

## 二、签到浮动按钮 + 弹窗

### 2.1 浮动按钮（修改 home.wxml）

在 `page-container` 的末尾（底部 view 之后、`</view>` 闭合之前）插入浮动按钮：

```xml
<!-- 签到浮动按钮 -->
<view class="fab-container">
  <view class="fab-btn {{checkinStatus.checkedInToday ? 'fab-btn-done' : 'fab-btn-active'}}" bindtap="showCheckin">
    <text class="fab-icon">{{checkinStatus.checkedInToday ? '✓' : '📅'}}</text>
    <text class="fab-label">签到</text>
    <!-- 未签到时显示红点 -->
    <view wx:if="{{checkinStatus && !checkinStatus.checkedInToday}}" class="fab-dot"></view>
  </view>
</view>
```

### 2.2 签到弹窗（修改 home.wxml）

在页面最底部（`page-container` 之外）插入签到弹窗：

```xml
<!-- 签到弹窗 -->
<view wx:if="{{showCheckinModal}}" class="modal-mask" bindtap="hideCheckin">
  <view class="modal-content checkin-modal" catchtap="">
    <view class="checkin-header">
      <text class="checkin-title">修炼签到</text>
      <text class="checkin-close" bindtap="hideCheckin">✕</text>
    </view>

    <!-- 连续签到天数 -->
    <view class="checkin-streak">
      <text class="checkin-streak-num">{{checkinDisplay.streak}}</text>
      <text class="checkin-streak-label">连续签到</text>
    </view>

    <!-- 今日奖励 -->
    <view class="checkin-reward">
      <text wx:if="{{checkinDisplay.checkedIn}}" class="checkin-reward-text">
        今日已签到，获得 💎×{{checkinDisplay.reward}}
      </text>
      <text wx:else class="checkin-reward-text">
        今日签到可获得 💎×{{checkinDisplay.nextReward}}
      </text>
    </view>

    <!-- 灵石总额 -->
    <view class="checkin-total">
      <text class="hud-stones-icon">💎</text>
      <text class="checkin-total-num">{{spiritStones}}</text>
    </view>

    <!-- 签到阶梯说明 -->
    <view class="checkin-tiers">
      <view class="checkin-tier {{checkinDisplay.streak >= 1 ? 'tier-active' : ''}}">
        <text class="tier-days">1-5天</text>
        <text class="tier-reward">💎×1/天</text>
      </view>
      <view class="checkin-tier {{checkinDisplay.streak >= 6 ? 'tier-active' : ''}}">
        <text class="tier-days">6-10天</text>
        <text class="tier-reward">💎×2/天</text>
      </view>
      <view class="checkin-tier {{checkinDisplay.streak >= 11 ? 'tier-active' : ''}}">
        <text class="tier-days">11-20天</text>
        <text class="tier-reward">💎×3/天</text>
      </view>
      <view class="checkin-tier {{checkinDisplay.streak >= 21 ? 'tier-active' : ''}}">
        <text class="tier-days">21天+</text>
        <text class="tier-reward">💎×5/天</text>
      </view>
    </view>
  </view>
</view>
```

### 2.3 浮动按钮 + 弹窗样式（修改 home.wxss）

```css
/* 浮动按钮容器 */
.fab-container {
  position: fixed;
  right: 24rpx;
  bottom: 200rpx;
  z-index: 90;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.fab-btn {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.4);
  position: relative;
}

.fab-btn-active {
  background: linear-gradient(135deg, #8b5cf6, #6d28d9);
}

.fab-btn-done {
  background: #1e293b;
  border: 2rpx solid #334155;
}

.fab-btn:active {
  opacity: 0.85;
  transform: scale(0.95);
}

.fab-icon {
  font-size: 28rpx;
}

.fab-label {
  font-size: 18rpx;
  color: #fff;
  margin-top: 2rpx;
}

.fab-dot {
  position: absolute;
  top: 4rpx;
  right: 4rpx;
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #ef4444;
}

/* 签到弹窗 */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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

.checkin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32rpx;
}

.checkin-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #f8fafc;
}

.checkin-close {
  font-size: 32rpx;
  color: #64748b;
  padding: 8rpx;
}

.checkin-streak {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24rpx;
}

.checkin-streak-num {
  font-size: 72rpx;
  font-weight: 800;
  color: #f59e0b;
  line-height: 1;
}

.checkin-streak-label {
  font-size: 24rpx;
  color: #94a3b8;
  margin-top: 8rpx;
}

.checkin-reward {
  text-align: center;
  margin-bottom: 24rpx;
}

.checkin-reward-text {
  font-size: 28rpx;
  color: #e2e8f0;
}

.checkin-total {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  margin-bottom: 32rpx;
  padding: 16rpx;
  background: rgba(245, 158, 11, 0.08);
  border-radius: 12rpx;
}

.checkin-total-num {
  font-size: 36rpx;
  font-weight: 700;
  color: #f59e0b;
}

/* 签到阶梯 */
.checkin-tiers {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
}

.checkin-tier {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16rpx 8rpx;
  background: #252540;
  border-radius: 8rpx;
  border: 2rpx solid #334155;
}

.checkin-tier.tier-active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
}

.tier-days {
  font-size: 20rpx;
  color: #94a3b8;
  margin-bottom: 4rpx;
}

.tier-reward {
  font-size: 22rpx;
  color: #e2e8f0;
  font-weight: 600;
}
```

### 2.4 签到交互逻辑（修改 home.js）

在 `data` 中新增：

```js
showCheckinModal: false,
checkinDisplay: {
  checkedIn: false,
  streak: 0,
  reward: 0,
  nextReward: 1,
},
```

在 `loadData` 的 `setData` 中，处理签到展示数据：

```js
// 构建签到展示数据
const cs = charData.checkinStatus || {};
const checkinDisplay = {
  checkedIn: !!cs.checkedInToday,
  streak: cs.checkedInToday ? cs.streak : (cs.nextStreak || 0),
  reward: cs.reward || 0,
  nextReward: cs.nextReward || 1,
};
```

在 `setData` 调用中加入 `checkinDisplay`。

新增方法：

```js
showCheckin() {
  this.setData({ showCheckinModal: true });
},

hideCheckin() {
  this.setData({ showCheckinModal: false });
},
```

### 2.5 行为提交后的签到特效（修改行为页 behavior.js）

在行为提交成功的回调中（`POST /behavior` 返回后），检查 `res.checkinResult`：

```js
// 行为提交成功后
if (res.checkinResult && !res.checkinResult.alreadyCheckedIn) {
  // 今天首次签到，展示签到特效
  wx.showToast({
    title: `签到成功！连续${res.checkinResult.streak}天 💎+${res.checkinResult.reward}`,
    icon: 'none',
    duration: 2500,
  });
}
```

---

## 三、其他页面的 HUD 适配

### 3.1 只在首页显示自定义 HUD

只修改 `pages/home/home.json` 设置 `navigationStyle: custom`。其他页面（行为/背包/愿望/家庭）保持原生导航栏不变。

### 3.2 浮动按钮只在首页显示

浮动按钮的 HTML 和逻辑只在 `pages/home/` 中实现。其他页面不需要。

---

## 四、验证清单

完成后请验证：

1. 首页顶部原生导航栏消失，显示自定义 HUD（角色名 + 境界 badge + 灵石余额）
2. HUD 在页面滚动时 sticky 固定在顶部
3. 状态栏高度正确适配（刘海屏不遮挡）
4. 灵石余额点击可打开签到弹窗
5. 右下角浮动签到按钮显示正确状态（未签到=紫色渐变+红点，已签到=灰色+✓）
6. 签到弹窗展示：连续天数、今日奖励、灵石总额、阶梯说明
7. 提交行为后，首次签到展示 toast 特效
8. 重复提交行为不重复展示签到特效
9. Hero 区域不再重复显示角色名（已移到 HUD）

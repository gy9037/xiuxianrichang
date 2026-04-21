# Codex 指令：V3.0 第三批 - 前端（快捷按钮置顶 + 行为备注 + 月度目标）

> **关联决策**：评审总结 §16（策划案-05 行为自定义增强）
> **前置依赖**：先执行 `codex-v30-batch3-backend.md`

---

## 一、快捷按钮置顶（修改 behavior 页）

### 1.1 快捷按钮增加置顶标记和长按操作（修改 behavior.wxml）

替换现有的快捷按钮区域（约第 26-34 行）：

```xml
<!-- Top5 快捷 -->
<view class="shortcut-grid" wx:if="{{shortcuts.length > 0}}">
  <button class="shortcut-btn {{item.pinned ? 'shortcut-pinned' : ''}}" 
    wx:for="{{shortcuts}}" wx:key="index"
    bindtap="tapShortcut"
    bindlongpress="onShortcutLongPress"
    data-category="{{item.category}}"
    data-subtype="{{item.sub_type}}"
    data-index="{{index}}"
    data-pinned="{{item.pinned}}">
    <view wx:if="{{item.pinned}}" class="pin-badge">★</view>
    <text>{{item.sub_type}}</text>
    <text class="text-dim shortcut-count">{{item.use_count}}次</text>
  </button>
</view>
```

### 1.2 置顶操作菜单（修改 behavior.wxml）

在快捷打卡卡片之后新增操作菜单弹窗：

```xml
<!-- 置顶操作菜单 -->
<view wx:if="{{showPinMenu}}" class="modal-mask" bindtap="closePinMenu">
  <view class="pin-menu" catchtap="">
    <view class="pin-menu-title">{{pinMenuTarget.sub_type}}</view>
    <button wx:if="{{!pinMenuTarget.pinned}}" class="pin-menu-btn" bindtap="pinBehavior">
      ★ 置顶显示
    </button>
    <button wx:else class="pin-menu-btn" bindtap="unpinBehavior">
      取消置顶
    </button>
    <button class="pin-menu-btn pin-menu-cancel" bindtap="closePinMenu">取消</button>
  </view>
</view>
```

### 1.3 置顶样式（修改 behavior.wxss）

```css
/* 置顶按钮 */
.shortcut-pinned {
  border-color: #8b5cf6 !important;
  background: rgba(139, 92, 246, 0.08) !important;
}

.pin-badge {
  position: absolute;
  top: -4rpx;
  right: -4rpx;
  font-size: 20rpx;
  color: #f59e0b;
}

.shortcut-btn {
  position: relative;
}

/* 置顶操作菜单 */
.pin-menu {
  background: #1a1a2e;
  border-radius: 16rpx;
  width: 500rpx;
  padding: 32rpx;
  border: 1rpx solid #334155;
}

.pin-menu-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #f8fafc;
  text-align: center;
  margin-bottom: 24rpx;
}

.pin-menu-btn {
  width: 100%;
  padding: 20rpx;
  font-size: 28rpx;
  color: #e2e8f0;
  background: #252540;
  border-radius: 12rpx;
  margin-bottom: 12rpx;
  border: none;
}

.pin-menu-btn:active {
  opacity: 0.7;
}

.pin-menu-cancel {
  color: #94a3b8;
  background: transparent;
}
```

### 1.4 置顶逻辑（修改 behavior.js）

在 `data` 中新增：

```js
showPinMenu: false,
pinMenuTarget: null,
pinnedBehaviors: [],
```

在 `loadShortcuts` 中保存 shortcuts 的 pinned 信息：

```js
loadShortcuts() {
  api.get('/behavior/shortcuts').then(data => {
    const shortcuts = data || [];
    const pinnedBehaviors = shortcuts.filter(s => s.pinned).map(s => ({
      category: s.category,
      sub_type: s.sub_type,
    }));
    this.setData({ shortcuts, pinnedBehaviors });
  }).catch(() => {});
},
```

新增方法：

```js
onShortcutLongPress(e) {
  const { category, subtype, index, pinned } = e.currentTarget.dataset;
  this.setData({
    showPinMenu: true,
    pinMenuTarget: {
      category,
      sub_type: subtype,
      index,
      pinned: !!pinned,
    },
  });
},

closePinMenu() {
  this.setData({ showPinMenu: false, pinMenuTarget: null });
},

pinBehavior() {
  const target = this.data.pinMenuTarget;
  const current = [...this.data.pinnedBehaviors];

  if (current.length >= 2) {
    wx.showToast({ title: '最多置顶 2 个，请先取消一个', icon: 'none' });
    this.closePinMenu();
    return;
  }

  current.push({ category: target.category, sub_type: target.sub_type });
  this.updatePinnedBehaviors(current);
},

unpinBehavior() {
  const target = this.data.pinMenuTarget;
  const current = this.data.pinnedBehaviors.filter(
    p => !(p.category === target.category && p.sub_type === target.sub_type)
  );
  this.updatePinnedBehaviors(current);
},

updatePinnedBehaviors(pinnedBehaviors) {
  api.patch('/character/pin-behavior', { pinnedBehaviors }).then(() => {
    this.setData({ pinnedBehaviors });
    this.closePinMenu();
    this.loadShortcuts(); // 刷新快捷列表
    wx.showToast({ title: '已更新', icon: 'success', duration: 1000 });
  }).catch(err => {
    wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    this.closePinMenu();
  });
},
```

注意：`api.patch` 方法可能不存在。检查 `miniprogram/utils/api.js`，如果没有 `patch` 方法，需要新增：

```js
patch(url, data) {
  return this.request(url, 'PATCH', data);
},
```

或者后端改为 `POST /api/character/pin-behavior`（更简单），前端用 `api.post` 调用。**建议后端改为 POST**，避免前端需要新增 HTTP 方法。

---

## 二、行为备注取消字数限制（修改 behavior.wxml）

找到备注输入框（约第 118 行）：

```xml
<textarea class="form-textarea" placeholder="添加备注..." value="{{description}}" bindinput="onDescriptionInput" maxlength="200" />
```

删除 `maxlength="200"`，改为不限制：

```xml
<textarea class="form-textarea" placeholder="添加备注..." value="{{description}}" bindinput="onDescriptionInput" maxlength="-1" />
```

> 小程序 textarea 的 `maxlength="-1"` 表示不限制字数。

---

## 三、月度目标（修改 home 页 + 新增目标管理交互）

### 3.1 首页展示月度目标（修改 home.wxml）

在今日推荐卡片之后、成就卡片之前，插入月度目标模块：

```xml
<!-- 月度目标 -->
<view class="card" wx:if="{{behaviorGoals && behaviorGoals.length > 0}}">
  <view class="flex-between" style="margin-bottom:16rpx">
    <view class="card-title" style="margin-bottom:0">本月目标</view>
    <text class="text-primary" style="font-size:24rpx" bindtap="goToGoalManage">管理 →</text>
  </view>
  <view wx:for="{{behaviorGoals}}" wx:key="id" class="goal-row">
    <view class="flex-between" style="margin-bottom:8rpx">
      <text class="text-bright" style="font-size:26rpx">{{item.subType}}</text>
      <text class="{{item.completed ? 'text-green' : 'text-dim'}}" style="font-size:24rpx">
        {{item.currentCount}}/{{item.targetCount}} 次
      </text>
    </view>
    <view class="goal-progress-bg">
      <view class="goal-progress-fill {{item.completed ? 'goal-complete' : ''}}" 
        style="width:{{item.progressPct}}%"></view>
    </view>
  </view>
</view>
```

### 3.2 月度目标样式（修改 home.wxss）

```css
/* 月度目标 */
.goal-row {
  margin-bottom: 20rpx;
}

.goal-row:last-child {
  margin-bottom: 0;
}

.goal-progress-bg {
  height: 12rpx;
  background: #252540;
  border-radius: 6rpx;
  overflow: hidden;
}

.goal-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  border-radius: 6rpx;
  transition: width 0.3s;
}

.goal-complete {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.text-green {
  color: #10b981;
}
```

### 3.3 首页加载月度目标数据（修改 home.js）

在 `loadData` 中，从 `charData` 提取月度目标：

```js
// 构建月度目标展示数据
const behaviorGoals = (charData.behaviorGoals || []).map(g => ({
  ...g,
  progressPct: Math.min(Math.round((g.currentCount / g.targetCount) * 100), 100),
}));
```

在 `setData` 中加入 `behaviorGoals`。

新增跳转方法：

```js
goToGoalManage() {
  wx.switchTab({ url: '/pages/behavior/behavior' });
  // 通过全局变量通知行为页打开目标管理
  getApp().globalData.openGoalManage = true;
},
```

### 3.4 行为页目标管理入口（修改 behavior.wxml）

在上报 Tab 的底部（最近记录之后）新增目标管理入口：

```xml
<!-- 月度目标管理 -->
<view class="card">
  <view class="flex-between" bindtap="toggleGoalPanel">
    <view class="card-title" style="margin-bottom:0">本月目标</view>
    <text class="text-dim">{{showGoalPanel ? '收起' : '展开'}}</text>
  </view>

  <view wx:if="{{showGoalPanel}}" style="margin-top:16rpx">
    <!-- 已有目标列表 -->
    <view wx:for="{{monthlyGoals}}" wx:key="id" class="goal-manage-row">
      <view class="flex-between">
        <view>
          <text class="text-bright">{{item.subType}}</text>
          <text class="text-dim" style="margin-left:12rpx">{{item.currentCount}}/{{item.targetCount}}</text>
        </view>
        <text class="text-red" style="font-size:24rpx;padding:8rpx" 
          bindtap="deleteGoal" data-id="{{item.id}}">删除</text>
      </view>
      <view class="goal-progress-bg" style="margin-top:8rpx">
        <view class="goal-progress-fill {{item.completed ? 'goal-complete' : ''}}" 
          style="width:{{item.progressPct}}%"></view>
      </view>
    </view>

    <!-- 新增目标 -->
    <view class="goal-add-form" style="margin-top:20rpx">
      <view class="flex-row" style="gap:12rpx">
        <input class="form-input" style="flex:2" placeholder="行为名称（如：早起）" 
          value="{{newGoalSubType}}" bindinput="onGoalSubTypeInput" />
        <input class="form-input" style="flex:1" placeholder="目标次数" type="number"
          value="{{newGoalCount}}" bindinput="onGoalCountInput" />
        <button class="btn btn-primary btn-small" bindtap="addGoal">添加</button>
      </view>
    </view>

    <!-- 空状态 -->
    <view wx:if="{{monthlyGoals.length === 0}}" class="text-dim" style="text-align:center;padding:24rpx 0;font-size:24rpx">
      还没有设定目标，添加一个试试
    </view>
  </view>
</view>
```

### 3.5 目标管理样式（修改 behavior.wxss）

```css
/* 月度目标管理 */
.goal-manage-row {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #334155;
}

.goal-manage-row:last-child {
  border-bottom: none;
}

.goal-progress-bg {
  height: 12rpx;
  background: #252540;
  border-radius: 6rpx;
  overflow: hidden;
}

.goal-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  border-radius: 6rpx;
}

.goal-complete {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.goal-add-form .form-input {
  background: #252540;
  border: 1rpx solid #334155;
  border-radius: 8rpx;
  padding: 12rpx 16rpx;
  font-size: 26rpx;
  color: #e2e8f0;
}

.text-red {
  color: #ef4444;
}
```

### 3.6 目标管理逻辑（修改 behavior.js）

在 `data` 中新增：

```js
showGoalPanel: false,
monthlyGoals: [],
newGoalSubType: '',
newGoalCount: '',
```

在 `onShow` 中检查是否需要自动打开目标面板：

```js
const app = getApp();
if (app.globalData.openGoalManage) {
  this.setData({ showGoalPanel: true });
  app.globalData.openGoalManage = null;
}
this.loadMonthlyGoals();
```

新增方法：

```js
loadMonthlyGoals() {
  api.get('/behavior-goal/current').then(data => {
    const goals = (data || []).map(g => ({
      ...g,
      progressPct: Math.min(Math.round((g.currentCount / g.targetCount) * 100), 100),
    }));
    this.setData({ monthlyGoals: goals });
  }).catch(() => {});
},

toggleGoalPanel() {
  const show = !this.data.showGoalPanel;
  this.setData({ showGoalPanel: show });
  if (show) this.loadMonthlyGoals();
},

onGoalSubTypeInput(e) {
  this.setData({ newGoalSubType: e.detail.value });
},

onGoalCountInput(e) {
  this.setData({ newGoalCount: e.detail.value });
},

addGoal() {
  const subType = this.data.newGoalSubType.trim();
  const count = parseInt(this.data.newGoalCount);

  if (!subType) {
    wx.showToast({ title: '请输入行为名称', icon: 'none' });
    return;
  }
  if (!count || count < 1) {
    wx.showToast({ title: '请输入有效的目标次数', icon: 'none' });
    return;
  }

  api.post('/behavior-goal', { sub_type: subType, target_count: count }).then(() => {
    wx.showToast({ title: '目标已添加', icon: 'success', duration: 1000 });
    this.setData({ newGoalSubType: '', newGoalCount: '' });
    this.loadMonthlyGoals();
  }).catch(err => {
    wx.showToast({ title: err.message || '添加失败', icon: 'none' });
  });
},

deleteGoal(e) {
  const id = e.currentTarget.dataset.id;
  wx.showModal({
    title: '确认删除',
    content: '确定要删除这个目标吗？',
    success: (res) => {
      if (res.confirm) {
        api.delete('/behavior-goal/' + id).then(() => {
          wx.showToast({ title: '已删除', icon: 'success', duration: 1000 });
          this.loadMonthlyGoals();
        }).catch(err => {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        });
      }
    },
  });
},
```

注意：`api.delete` 方法可能不存在。检查 `miniprogram/utils/api.js`，如果没有 `delete` 方法，需要新增：

```js
delete(url) {
  return this.request(url, 'DELETE');
},
```

同样，`api.patch` 如果不存在也需要新增（见第一节置顶功能的说明）。

---

## 四、目标达成通知（修改 behavior.js）

在行为提交成功的回调中（`doSubmit` 的 `.then` 里），提交成功后检查是否有目标刚好达成：

```js
// 提交成功后刷新目标并检查达成
this.loadMonthlyGoals();
setTimeout(() => {
  const goals = this.data.monthlyGoals;
  for (const g of goals) {
    // 刚好达成（currentCount 等于 targetCount，说明这次提交触发了达成）
    if (g.completed && g.subType === sub_type && g.currentCount === g.targetCount) {
      wx.showToast({
        title: `「${g.subType}」本月目标达成！`,
        icon: 'none',
        duration: 2500,
      });
      break;
    }
  }
}, 800); // 等待 loadMonthlyGoals 完成
```

---

## 五、验证清单

1. 快捷按钮长按弹出置顶/取消置顶菜单
2. 置顶后按钮显示 ★ 标记，排在最前面，有紫色边框
3. 最多置顶 2 个，超出时提示
4. 取消置顶后恢复按频次排序
5. 行为备注输入框无字数限制
6. 首页显示月度目标模块（有目标时），带进度条
7. 目标完成时进度条变绿色
8. 行为页底部有目标管理面板（可展开/收起）
9. 可添加新目标（行为名+目标次数）
10. 可删除已有目标（确认弹窗）
11. 提交行为后，如果触发目标达成，显示 toast 通知
12. 首页"管理→"点击跳转到行为页并自动展开目标面板
13. `api.patch` 和 `api.delete` 方法可用（或后端改为 POST）

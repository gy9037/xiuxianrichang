# Codex 指令：V1.2.7 第四批 - 前端（数据报告系统）

> **需求来源**：策划案-07-数据报告系统
> **技术方案**：tech-v127-数据报告系统.md
> **前置依赖**：先执行 `codex-v30-batch4-report-backend.md`

---

## 一、注册报告页面（修改 miniprogram/app.json）

在 `pages` 数组末尾（`"pages/login/login"` 之前）新增：

```json
"pages/report/report",
```

修改后 pages 数组为：

```json
"pages": [
  "pages/home/home",
  "pages/behavior/behavior",
  "pages/inventory/inventory",
  "pages/wish/wish",
  "pages/family/family",
  "pages/report/report",
  "pages/login/login"
]
```

---

## 二、新建报告页面

### 2.1 miniprogram/pages/report/report.json

```json
{
  "navigationBarTitleText": "修炼报告",
  "navigationBarBackgroundColor": "#0f0f1a",
  "navigationBarTextStyle": "white"
}
```

### 2.2 miniprogram/pages/report/report.wxml

```xml
<view class="page-container">

  <!-- 报告列表视图 -->
  <view wx:if="{{!currentReport}}">
    <view class="card-title" style="margin-bottom:24rpx">修炼报告</view>

    <!-- 加载中 -->
    <view wx:if="{{loading}}" class="empty-state">加载中...</view>

    <!-- 空状态 -->
    <view wx:elif="{{reports.length === 0}}" class="empty-state">
      还没有可查看的报告，继续修炼吧
    </view>

    <!-- 报告列表 -->
    <view wx:else>
      <view wx:for="{{reports}}" wx:key="id"
        class="card report-list-item" bindtap="viewReport" data-id="{{item.id}}">
        <view class="flex-between">
          <view class="flex-row" style="gap:12rpx">
            <text class="report-type-badge report-type-{{item.type}}">{{item.typeLabel}}</text>
            <text class="text-bright" style="font-size:28rpx">{{item.periodLabel}}</text>
          </view>
          <view class="flex-row" style="gap:8rpx">
            <view wx:if="{{!item.is_read}}" class="unread-dot"></view>
            <text class="text-dim" style="font-size:24rpx">></text>
          </view>
        </view>
      </view>
    </view>
  </view>

  <!-- 报告详情视图 -->
  <view wx:if="{{currentReport}}">
    <view class="flex-row" style="margin-bottom:24rpx">
      <text class="text-primary" style="font-size:28rpx" bindtap="backToList">< 返回列表</text>
    </view>

    <!-- 文字版报告（兜底 + Canvas 失败时展示） -->
    <view wx:if="{{!canvasReady}}" class="report-text-view">
      <!-- 标题 -->
      <view class="card">
        <view class="flex-center" style="flex-direction:column;gap:8rpx">
          <text class="text-gold" style="font-size:36rpx;font-weight:700">
            {{currentReport.data.type === 'yearly' ? currentReport.data.year + '年修炼年报' : currentReport.data.type === 'quarterly' ? currentReport.data.year + '年第' + currentReport.data.quarter + '季度总览' : currentReport.data.month + '月修炼月报'}}
          </text>
        </view>
      </view>

      <!-- 修炼天数 + 活跃度 -->
      <view class="card">
        <view class="flex-between">
          <view>
            <text class="text-dim" style="font-size:24rpx">修炼天数</text>
            <view style="margin-top:8rpx">
              <text class="text-bright" style="font-size:44rpx;font-weight:700">{{currentReport.data.activeDays || currentReport.data.totalActiveDays}}</text>
              <text class="text-dim" style="font-size:24rpx"> / {{currentReport.data.totalDays}} 天</text>
            </view>
          </view>
          <view style="text-align:right">
            <text class="text-dim" style="font-size:24rpx">活跃度</text>
            <view style="margin-top:8rpx">
              <text class="text-gold" style="font-size:36rpx;font-weight:700">{{currentReport.data.rating.level}}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 最佳月份（季报/年报） -->
      <view class="card" wx:if="{{currentReport.data.bestMonth}}">
        <text class="text-dim" style="font-size:24rpx">最强月份</text>
        <view style="margin-top:8rpx">
          <text class="text-bright" style="font-size:30rpx">{{currentReport.data.bestMonth.month}}月</text>
          <text class="text-dim" style="font-size:24rpx;margin-left:8rpx">（{{currentReport.data.bestMonth.activeDays}}天活跃）</text>
        </view>
      </view>

      <!-- 五属性成长 -->
      <view class="card">
        <text class="card-title">属性成长</text>
        <view wx:for="{{attrDisplay}}" wx:key="key" style="margin-bottom:16rpx">
          <view class="flex-between" style="margin-bottom:4rpx">
            <text class="text-bright" style="font-size:26rpx">{{item.name}}</text>
            <text class="text-gold" style="font-size:26rpx">+{{item.value}}</text>
          </view>
          <view class="attr-bar-bg">
            <view class="attr-bar-fill" style="width:{{item.pct}}%;background:{{item.color}}"></view>
          </view>
        </view>
      </view>

      <!-- 最长坚持 -->
      <view class="card" wx:if="{{currentReport.data.bestStreak.days > 0}}">
        <text class="text-dim" style="font-size:24rpx">最长坚持</text>
        <view style="margin-top:8rpx">
          <text class="text-bright" style="font-size:30rpx">{{currentReport.data.bestStreak.subType}}</text>
          <text class="text-dim" style="font-size:24rpx;margin-left:8rpx">连续 {{currentReport.data.bestStreak.days}} 天</text>
        </view>
      </view>

      <!-- 道具收获 -->
      <view class="card">
        <text class="text-dim" style="font-size:24rpx">道具收获</text>
        <view style="margin-top:8rpx">
          <text class="text-bright" style="font-size:30rpx">共 {{currentReport.data.itemStats.total}} 件</text>
        </view>
        <view class="flex-row" style="gap:16rpx;margin-top:8rpx;flex-wrap:wrap">
          <text wx:for="{{itemQualityDisplay}}" wx:key="quality"
            class="{{item.colorClass}}" style="font-size:24rpx">{{item.quality}} {{item.count}}</text>
        </view>
      </view>

      <!-- Boss 战绩（季报/年报） -->
      <view class="card" wx:if="{{currentReport.data.bossStats && currentReport.data.bossStats.total > 0}}">
        <text class="text-dim" style="font-size:24rpx">Boss 战绩</text>
        <view style="margin-top:8rpx">
          <text class="text-bright" style="font-size:30rpx">挑战 {{currentReport.data.bossStats.total}} 次</text>
          <text class="text-dim" style="font-size:24rpx;margin-left:12rpx">胜率 {{currentReport.data.bossStats.winRate}}%</text>
        </view>
      </view>

      <!-- 境界 -->
      <view class="card">
        <text class="text-dim" style="font-size:24rpx">当前境界</text>
        <view style="margin-top:8rpx">
          <text class="text-gold" style="font-size:30rpx">{{currentReport.data.realmStage}}</text>
        </view>
      </view>

      <!-- 年度评语（年报） -->
      <view class="card" wx:if="{{currentReport.data.motto}}" style="text-align:center">
        <text class="text-gold" style="font-size:28rpx;font-style:italic">「{{currentReport.data.motto}}」</text>
      </view>

      <!-- 活跃度评语 -->
      <view class="card" wx:if="{{currentReport.data.rating.flavor}}" style="text-align:center">
        <text class="text-dim" style="font-size:26rpx">{{currentReport.data.rating.flavor}}</text>
      </view>
    </view>

    <!-- Canvas 图卡 -->
    <view wx:if="{{canvasReady}}" class="canvas-container">
      <canvas type="2d" id="reportCanvas" style="width:375px;height:500px;"></canvas>
    </view>

    <!-- 操作按钮 -->
    <view style="display:flex;gap:16rpx;margin-top:32rpx">
      <button class="btn btn-secondary" style="flex:1" bindtap="toggleView">
        {{canvasReady ? '查看文字版' : '查看图卡'}}
      </button>
      <button wx:if="{{canvasReady}}" class="btn btn-primary" style="flex:1" bindtap="saveToAlbum">
        保存到相册
      </button>
    </view>
  </view>

</view>
```

### 2.3 miniprogram/pages/report/report.wxss

```css
/* 报告列表 */
.report-list-item {
  margin-bottom: 16rpx;
}

.report-type-badge {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  font-weight: 600;
}

.report-type-monthly {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
}

.report-type-quarterly {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.report-type-yearly {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.unread-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #ef4444;
}

/* 报告详情 - 文字版 */
.report-text-view .card {
  margin-bottom: 16rpx;
}

.attr-bar-bg {
  height: 16rpx;
  background: #252540;
  border-radius: 8rpx;
  overflow: hidden;
}

.attr-bar-fill {
  height: 100%;
  border-radius: 8rpx;
  transition: width 0.3s;
}

/* Canvas 容器 */
.canvas-container {
  display: flex;
  justify-content: center;
  border-radius: 16rpx;
  overflow: hidden;
}
```

### 2.4 miniprogram/pages/report/report.js

```js
const api = require('../../utils/api');

const ATTR_FIELDS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
const ATTR_NAMES = {
  physique: '体魄', comprehension: '悟性', willpower: '心性',
  dexterity: '灵巧', perception: '神识',
};
const ATTR_COLORS = {
  physique: '#e57373', comprehension: '#64b5f6', willpower: '#ba68c8',
  dexterity: '#81c784', perception: '#ffb74d',
};
const QUALITY_COLOR_CLASS = {
  '凡品': 'quality-fan', '良品': 'quality-liang',
  '上品': 'quality-shang', '极品': 'quality-ji',
};
const TYPE_LABELS = { monthly: '月报', quarterly: '季报', yearly: '年报' };
const MONTH_NAMES = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

Page({
  data: {
    loading: true,
    reports: [],
    currentReport: null,
    canvasReady: false,
    attrDisplay: [],
    itemQualityDisplay: [],
  },

  onLoad() {
    this.loadReportList();
  },

  async loadReportList() {
    this.setData({ loading: true });
    try {
      const res = await api.get('/report/list');
      const reports = (res.reports || []).map(r => ({
        ...r,
        typeLabel: TYPE_LABELS[r.type] || r.type,
        periodLabel: this.formatPeriodLabel(r.type, r.period_key),
      }));
      this.setData({ reports, loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  formatPeriodLabel(type, periodKey) {
    if (type === 'monthly') {
      const [y, m] = periodKey.split('-');
      return `${y}年${MONTH_NAMES[parseInt(m)]}月`;
    }
    if (type === 'quarterly') {
      const [y, q] = periodKey.split('-');
      return `${y}年第${q.replace('Q', '')}季度`;
    }
    if (type === 'yearly') {
      return `${periodKey}年`;
    }
    return periodKey;
  },

  async viewReport(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '加载中' });
    try {
      const report = await api.get('/report/' + id);
      const attrDisplay = this.buildAttrDisplay(report.data.attrGrowth);
      const itemQualityDisplay = this.buildItemQualityDisplay(report.data.itemStats);

      this.setData({
        currentReport: report,
        canvasReady: false,
        attrDisplay,
        itemQualityDisplay,
      });
      wx.hideLoading();

      // 尝试初始化 Canvas
      setTimeout(() => this.initCanvas(), 300);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  buildAttrDisplay(attrGrowth) {
    if (!attrGrowth) return [];
    const maxVal = Math.max(...ATTR_FIELDS.map(f => attrGrowth[f] || 0), 1);
    return ATTR_FIELDS.map(f => ({
      key: f,
      name: ATTR_NAMES[f],
      value: attrGrowth[f] || 0,
      pct: Math.min(Math.round(((attrGrowth[f] || 0) / maxVal) * 100), 100),
      color: ATTR_COLORS[f],
    }));
  },

  buildItemQualityDisplay(itemStats) {
    if (!itemStats || !itemStats.byQuality) return [];
    return Object.entries(itemStats.byQuality).map(([quality, count]) => ({
      quality,
      count,
      colorClass: QUALITY_COLOR_CLASS[quality] || 'text-dim',
    }));
  },

  backToList() {
    this.setData({ currentReport: null, canvasReady: false });
    this.canvas = null;
  },

  toggleView() {
    if (this.data.canvasReady) {
      this.setData({ canvasReady: false });
    } else {
      this.initCanvas();
    }
  },

  // ─── Canvas 图卡绘制 ───

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#reportCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          // Canvas 不可用，保持文字版
          return;
        }
        const canvas = res[0].node;
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        canvas.width = 750;
        canvas.height = 1000;

        try {
          this.drawReportCard(ctx, this.data.currentReport);
          this.setData({ canvasReady: true });
        } catch (e) {
          console.error('Canvas 绘制失败:', e);
          this.setData({ canvasReady: false });
        }
      });
  },

  drawReportCard(ctx, report) {
    const data = report.data;
    const type = data.type;

    // 背景
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 750, 1000);

    // 顶部装饰线
    ctx.fillStyle = '#8b5cf6';
    ctx.fillRect(0, 0, 750, 6);

    // 标题
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';

    let title = '';
    if (type === 'monthly') title = `${MONTH_NAMES[data.month]}月修炼月报`;
    else if (type === 'quarterly') title = `${data.year}年第${data.quarter}季度总览`;
    else if (type === 'yearly') title = `${data.year}年修炼年报`;
    ctx.fillText(title, 375, 60);

    // 分隔线
    let y = 90;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(710, y);
    ctx.stroke();

    // 修炼天数 + 活跃度
    y = 130;
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '24px sans-serif';
    const activeDays = data.activeDays || data.totalActiveDays;
    ctx.fillText(`修炼天数 ${activeDays} 天 / ${data.totalDays} 天  ·  ${data.rating.level}`, 375, y);

    // 最佳月份（季报/年报）
    if (data.bestMonth) {
      y += 40;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px sans-serif';
      ctx.fillText(`最强月份：${data.bestMonth.month}月（${data.bestMonth.activeDays}天活跃）`, 375, y);
    }

    // 分隔线
    y += 30;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(710, y);
    ctx.stroke();

    // 属性成长
    y += 35;
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('属性成长', 40, y);

    const maxAttr = Math.max(...ATTR_FIELDS.map(f => data.attrGrowth[f] || 0), 1);
    y += 10;
    for (const f of ATTR_FIELDS) {
      y += 35;
      const val = data.attrGrowth[f] || 0;
      const barWidth = Math.round((val / maxAttr) * 400);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(ATTR_NAMES[f], 40, y);

      // 进度条背景
      ctx.fillStyle = '#252540';
      ctx.fillRect(130, y - 14, 420, 18);

      // 进度条填充
      ctx.fillStyle = ATTR_COLORS[f];
      ctx.fillRect(130, y - 14, barWidth, 18);

      // 数值
      ctx.fillStyle = '#f59e0b';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`+${val}`, 560, y);
    }

    // 分隔线
    y += 30;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(710, y);
    ctx.stroke();

    // 最长坚持 + 道具收获
    y += 35;
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    if (data.bestStreak && data.bestStreak.days > 0) {
      ctx.fillText(`最长坚持  ${data.bestStreak.subType} · 连续 ${data.bestStreak.days} 天`, 375, y);
      y += 35;
    }

    // 道具收获
    const qualityParts = [];
    for (const [q, c] of Object.entries(data.itemStats.byQuality || {})) {
      qualityParts.push(`${q} ${c}`);
    }
    ctx.fillText(`道具收获  共 ${data.itemStats.total} 件  ${qualityParts.join(' · ')}`, 375, y);

    // Boss 战绩（季报/年报）
    if (data.bossStats && data.bossStats.total > 0) {
      y += 35;
      ctx.fillText(`Boss 战绩  挑战 ${data.bossStats.total} 次 · 胜率 ${data.bossStats.winRate}%`, 375, y);
    }

    // 分隔线
    y += 30;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(710, y);
    ctx.stroke();

    // 评语
    y += 40;
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'italic 24px sans-serif';
    ctx.textAlign = 'center';
    const motto = data.motto || data.rating.flavor || '';
    if (motto) {
      ctx.fillText(`「${motto}」`, 375, y);
    }

    // 底部 App 名称
    ctx.fillStyle = '#475569';
    ctx.font = '18px sans-serif';
    ctx.fillText('修仙日常', 375, 970);
  },

  // ─── 保存到相册 ───

  saveToAlbum() {
    if (!this.canvas) {
      wx.showToast({ title: '图卡未就绪', icon: 'none' });
      return;
    }
    wx.canvasToTempFilePath({
      canvas: this.canvas,
      success(res) {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success() {
            wx.showToast({ title: '已保存到相册', icon: 'success' });
          },
          fail(err) {
            if (err.errMsg && err.errMsg.includes('auth deny')) {
              wx.showToast({ title: '请授权相册权限', icon: 'none' });
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
          },
        });
      },
      fail() {
        wx.showToast({ title: '生成图片失败', icon: 'none' });
      },
    });
  },
});
```

---

## 三、首页添加报告入口（修改 home 页）

### 3.1 修改 miniprogram/pages/home/home.wxml

在签到浮动按钮区域（`fab-container`）中，签到按钮之前新增报告入口按钮：

找到：
```xml
  <!-- 签到浮动按钮 -->
  <view class="fab-container">
    <view class="fab-btn {{checkinStatus.checkedInToday ? 'fab-btn-done' : 'fab-btn-active'}}" bindtap="showCheckin">
```

替换为：
```xml
  <!-- 浮动按钮组 -->
  <view class="fab-container">
    <view class="fab-btn fab-btn-secondary" bindtap="goToReport">
      <text class="fab-icon">📊</text>
      <text class="fab-label">报告</text>
    </view>
    <view class="fab-btn {{checkinStatus.checkedInToday ? 'fab-btn-done' : 'fab-btn-active'}}" bindtap="showCheckin">
```

### 3.2 修改 miniprogram/pages/home/home.js

在方法区域（`goToGoalManage` 附近）新增：

```js
goToReport() {
  wx.navigateTo({ url: '/pages/report/report' });
},
```

### 3.3 修改 miniprogram/pages/home/home.wxss

新增浮动按钮次要样式（如果 `fab-btn-secondary` 不存在）：

```css
.fab-btn-secondary {
  background: #252540;
  border: 1rpx solid #334155;
}
```

---

## 四、验证清单

1. `app.json` 中 pages 数组包含 `pages/report/report`
2. 首页浮动按钮区域出现"报告"按钮，点击跳转到报告页
3. 报告页加载时调用 `GET /api/report/list`，展示报告列表
4. 列表中月报/季报/年报有不同颜色的类型标签
5. 未读报告显示红色圆点
6. 点击报告项加载详情，展示文字版报告
7. 文字版包含：修炼天数、活跃度、属性成长（带进度条）、最长坚持、道具收获、境界
8. 季报/年报额外展示：最佳月份、Boss 战绩
9. 年报展示年度评语
10. 点击"查看图卡"切换到 Canvas 图卡视图
11. Canvas 图卡尺寸 750x1000，深色背景 + 金色标题 + 白色正文
12. Canvas 绘制失败时保持文字版，不报错
13. "保存到相册"功能正常（需授权）
14. 点击"返回列表"回到报告列表视图
15. 空数据用户看到"还没有可查看的报告"提示

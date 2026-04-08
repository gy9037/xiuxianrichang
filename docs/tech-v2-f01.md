# 技术方案：V2-F01 行为上报简化

> 需求来源：FB-05（用户反馈：重复行为每次需点击 4-5 步，高频操作摩擦过大）  
> 策划案编号：V2-F01  
> 目标：重复行为压缩到 2 步以内

---

## 一、数据库变更 [V2-F01 / FB-05]

### 1.1 新增字段：behaviors 表记录 sub_category

现有 `behaviors` 表缺少 `sub_category` 字段，导致无法完整还原一次行为的上下文（分组类行为如"身体健康 > 上肢 > 俯卧撑"中的"上肢"未被持久化）。常用行为快捷入口需要完整上下文才能直接跳转到确认步骤。

```sql
-- [V2-F01 / FB-05] 补充 sub_category 字段，用于还原行为完整上下文
ALTER TABLE behaviors ADD COLUMN sub_category TEXT DEFAULT NULL;
```

> 注：现有 POST /api/behavior 已接收 sub_category 参数但未写入 DB，此处补齐。

### 1.2 新增表：user_behavior_shortcuts（常用行为快捷入口）

不依赖实时统计查询，而是维护一张轻量的快捷入口表，在每次行为上报时异步更新频次，查询时直接读取 Top5。

```sql
-- [V2-F01 / FB-05] 常用行为快捷入口表，记录用户各行为的上报频次
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
```

字段说明：
- `use_count`：累计上报次数，用于排序 Top5
- `last_used_at`：最近使用时间，用于同频次时的二次排序
- `sub_category`：记录最近一次使用时的子分类（分组类行为需要）

---

## 二、API 变更 [V2-F01 / FB-05]

### 2.1 修改：POST /api/behavior（行为上报）

在现有上报逻辑末尾，增加对 `user_behavior_shortcuts` 的 upsert 操作。

**变更点：**
- 写入 `behaviors.sub_category` 字段（补齐现有缺失）
- 上报成功后，upsert `user_behavior_shortcuts`：若记录存在则 `use_count + 1` 并更新 `last_used_at` 和 `sub_category`；若不存在则插入新记录

请求/响应格式不变。

### 2.2 新增：GET /api/behavior/shortcuts

获取当前用户的 Top5 常用行为快捷入口。

**请求：**
```
GET /api/behavior/shortcuts
Authorization: (现有 authMiddleware)
```

**响应：**
```json
[
  {
    "category": "身体健康",
    "sub_category": "上肢",
    "sub_type": "俯卧撑",
    "use_count": 42,
    "last_used_at": "2026-04-07T10:00:00"
  },
  ...
]
```

排序规则：`use_count DESC, last_used_at DESC`，最多返回 5 条。

### 2.3 新增：GET /api/behavior/last

获取当前用户最近一次上报的行为，用于"一键重复上次行为"功能。

**请求：**
```
GET /api/behavior/last
Authorization: (现有 authMiddleware)
```

**响应：**
```json
{
  "category": "学习",
  "sub_category": null,
  "sub_type": "读书",
  "duration": 30,
  "quantity": null,
  "description": ""
}
```

从 `behaviors` 表取 `user_id = ?` 的最新一条记录，返回上报所需的完整上下文字段。若无记录返回 `null`。

---

## 三、前端变更 [V2-F01 / FB-05]

### 3.1 页面结构变更

在现有"行为上报"页面顶部（`page-header` 之后、类别选择卡片之前），新增一个"常用行为"卡片区域：

```
[页面标题：行为上报]

[常用行为卡片]          ← 新增
  - Top5 快捷按钮
  - 一键重复上次按钮

[选择行为类型卡片]      ← 现有，保持不变
  - 类别选择
  - 子类别选择（分组类）
  - 具体行为选择

[确认/输入表单卡片]     ← 现有，保持不变

[最近记录卡片]          ← 现有，保持不变
```

### 3.2 常用行为卡片逻辑

**初始化：**
- `BehaviorPage.load()` 时，并行请求 `/api/behavior/shortcuts` 和 `/api/behavior/last`，结果存入 `this.shortcuts` 和 `this.lastBehavior`

**渲染规则：**
- 若 `shortcuts` 为空且 `lastBehavior` 为 null，不渲染该卡片（新用户无历史）
- 若有数据，渲染快捷按钮列表（最多 5 个）+ "重复上次"按钮（仅当 `lastBehavior` 存在时显示）

**快捷按钮点击逻辑（核心：跳过类别选择）：**
1. 从 shortcut 数据中取出 `{ category, sub_category, sub_type }`
2. 直接设置 `this.selectedCategory`、`this.selectedSubCategory`、`this.selectedBehavior`
3. 从 `this.categories`（已缓存）中查找对应的 behaviorDef，获取 template
4. 跳过类别选择步骤，直接渲染 `renderInputForm()`（确认/输入表单）
5. 整个流程：点击快捷按钮 → 填写数值/备注 → 提交，共 2 步

**一键重复上次按钮点击逻辑：**
1. 取 `this.lastBehavior` 的完整字段
2. 设置 `selectedCategory`、`selectedSubCategory`、`selectedBehavior`
3. 预填充上次的 `duration` / `quantity` / `description` 到输入表单
4. 渲染确认表单，用户可直接点提交（最优路径 1 步，通常 2 步）

### 3.3 状态管理变更

`BehaviorPage` 对象新增以下状态字段：
- `shortcuts: null` — 存储 Top5 快捷入口数据
- `lastBehavior: null` — 存储最近一次行为数据

`load()` 完成后刷新这两个字段，`render()` 读取它们渲染快捷区域。

上报成功后（`submit()` 回调），重新请求 `shortcuts` 和 `lastBehavior` 以保持数据最新。

---

## 四、方案边界说明

| 场景 | 处理方式 |
|------|----------|
| 快捷行为对应的 behaviorDef 已被删除（自定义行为） | 点击时在 categories 缓存中找不到，降级为普通选择流程并提示 |
| 打卡型行为今日已打卡 | 后端返回 400，前端 toast 提示，不影响快捷入口展示 |
| 新用户无历史记录 | shortcuts 返回空数组，lastBehavior 返回 null，快捷卡片不渲染 |
| sub_category 历史数据为 null | 快捷入口点击时，若 sub_category 为 null 且该 category 是分组类，自动选第一个子分类 |

# V1.2.7 任务追踪

> 总控 session 与各执行 session 共用此文件。总控负责维护任务列表，执行 session 完成后追加完成摘要。

---

## 任务列表

| 任务 | 状态 | 依赖 |
|------|------|------|
| Batch 1-3 建议修复（问题7时区统一、问题9月度目标去重） | 已完成 | 无 |
| Batch 1-3 Codex 指令执行 | 已完成 | 无 |
| 节气事件系统技术方案审阅 | 已取消 | 策划案需从头重做 |
| 数据报告系统技术方案编写 | 已完成 | 无 |
| 第四批 Codex 指令生成（节气事件） | 已取消 | 策划案需重写 |
| 第四批 Codex 指令生成（数据报告） | 已完成 | 无 |
| 统一任务系统技术方案编写 | 已完成 | 无 |
| 擂台系统技术方案编写 | 已完成 | 无 |
| 节气事件系统策划案重写 | 进行中 | 无 |
| 节气事件系统技术方案编写 | 待开始 | 节气策划案重写完成并审阅通过 |
| 节气事件系统 Codex 指令生成 | 待开始 | 节气技术方案完成并审阅通过 |
| 统一任务系统 Codex 指令生成 | 已完成 | 统一任务系统技术方案完成并审阅通过 |
| 擂台系统 Codex 指令生成 | 已完成 | 擂台系统技术方案完成并审阅通过 |
| Batch 1-3 Codex 执行 + 验收测试 | 已完成 | 无 |
| 数据报告系统 Codex 执行 + 验收测试 | 已完成 | 无 |
| 擂台系统 Codex 执行 + 验收测试 | 已完成 | 无 |
| 统一任务系统 Codex 执行 + 验收测试 | 已完成 | 无 |

---

## 完成摘要

### Batch 1-3 建议修复（2026-04-24）

- 状态：已完成
- 改动文件：
  - server/utils/time.js（新建）
  - server/services/behaviorGoalService.js（新建）
  - server/services/checkinService.js
  - server/services/cultivation.js
  - server/routes/character.js
  - server/routes/behaviorGoal.js
  - server/routes/behavior.js
- 关键决策：SQL 时区从 'localtime' 改为显式 '+8 hours'，不依赖服务器本地时区设置
- 遗留问题：无

### Batch 1-3 Codex 指令执行（2026-04-24）

- 状态：已完成
- 改动文件：server/services/checkinService.js（修复 getStreak 缺少 today 参数的 bug）
- 关键决策：6 份 Codex 指令代码已全部实现到位，本次为验证+bug fix，非全量执行
- 遗留问题：无

### 节气事件系统技术方案审阅（2026-04-24）

- 状态：已取消
- 改动文件：docs/策划案-06-节气事件系统.md（精简重写，保留已确认内容，标记待决策问题）
- 关键决策：策划案存在多处矛盾（效果持续时间、效果类型未落实、冬至特殊设计为AI误解），需重写策划案后重新编写技术方案
- 遗留问题：3 个核心设计问题待 Gavin 决策（效果持续时间、效果类型数量、限定道具定义）；重大节气差异化内容（行为推荐/家庭联动）拆为独立任务

### 数据报告系统技术方案编写（2026-04-24）

- 状态：已完成
- 改动文件：
  - docs/tech-v127-数据报告系统.md（补全文字版兜底方案、季报/年报图卡绘制说明）
- 关键决策：SQL 时区用 SQL_TZ（'+8 hours'）而非技术方案原文的 'localtime'，与项目统一规范对齐
- 遗留问题：无

### 第四批 Codex 指令生成 - 数据报告（2026-04-24）

- 状态：已完成
- 改动文件：
  - docs/codex-v30-batch4-report-backend.md（新建）
  - docs/codex-v30-batch4-report-frontend.md（新建）
- 关键决策：report 页面为非 tabBar 页面，用 navigateTo 跳转；首页入口放在浮动按钮组而非新增 tab
- 遗留问题：无

### 擂台系统技术方案编写（2026-04-24）

- 状态：已完成
- 改动文件：
  - docs/tech-v127-擂台系统.md（新建，759行）
- 关键决策：筹码存储在 users.chips 字段而非独立 currencies 表；灵石奖池由系统产出不从参与者扣除；体能成绩统一为整数；V1 不做独立战绩统计页
- 遗留问题：无

### 擂台系统 Codex 指令生成（2026-04-24）

- 状态：已完成
- 改动文件：
  - docs/codex-v30-batch5-arena-backend.md（新建，432行）
  - docs/codex-v30-batch5-arena-frontend.md（新建，906行）
- 关键决策：arena 页面从家庭页 navigateTo 进入，非 tabBar 页；app.json 插入位置不依赖 report 页面是否已注册
- 遗留问题：无

### 统一任务系统技术方案编写（2026-04-25）

- 状态：已完成
- 改动文件：
  - docs/tech-quest-system.md（新建，约780行）
  - docs/策划案-02-同修共炼.md（探索图鉴标记为待补充）
  - server/data/quest-pool-seed.json（新建，85条系统悬赏任务池）
- 关键决策：奖励统一为道具而非灵石，品质按任务类型和周期分梯度（系统悬赏凡品/良品、自我悬赏周良品月上品、挑战周上品月极品）；judging 阶段不设超时；投票阈值基于活跃成员数（is_active字段）解决废弃账号问题；bounty_stones 与 reward_stones 分离
- 遗留问题：探索图鉴策划待补充、里程碑机制待讨论

### 统一任务系统 Codex 指令生成（2026-04-25）

- 状态：已完成
- 改动文件：
  - docs/codex-quest-batch1-backend.md（新建，数据库+questService.js）
  - docs/codex-quest-batch2-backend.md（新建，路由+定时任务+挂载）
  - docs/codex-quest-batch3-frontend.md（新建，3个小程序页面+首页/家庭页集成）
- 关键决策：执行顺序 batch1→batch2→batch3；/daily 路由放在 /:id 之前避免参数冲突；定时任务用 setInterval 10分钟而非独立 cron
- 遗留问题：无

### Batch 1-3 Codex 执行 + 验收测试（2026-04-25）

- 状态：已完成
- 验收方式：代码审查（7个文件全部到位）+ API 实测（签到接口、角色接口）
- 关键确认：SQL 时区统一为 '+8 hours'，无残留 'localtime'；getStreak 已有 today 参数；behaviorGoals 字段正常返回
- 遗留问题：无

### 数据报告系统 Codex 执行 + 验收测试（2026-04-25）

- 状态：已完成
- 验收方式：代码审查（9个检查点全部通过）+ API 实测（报告列表、月报/季报生成、详情获取、is_read 标记）
- 关键确认：月报数据聚合正确（活跃天数、五属性成长、最长连续、道具统计）；季报复用月报数据；缓存机制正常；空数据月份不生成报告
- 遗留问题：季报 totalDays 仅累加有数据月份的天数，非整季度天数，属设计行为非 bug，后续可按需调整

### 擂台系统 Codex 执行 + 验收测试（2026-04-25）

- 状态：已完成
- 验收方式：代码审查（12个检查点全部通过）+ API 实测（quiz 完整流程、match 筹码模式、灵石结算、边界校验）
- 关键确认：quiz 创建→加入→提交→判定→结算→完成全流程通过；筹码零和校验生效；灵石奖池按胜者均分正确；已结束擂台拒绝重复结算
- 遗留问题：无

### 统一任务系统 Codex 执行 + 验收测试（2026-04-25）

- 状态：已完成
- 验收方式：代码审查（12个检查点全部通过）+ API 实测（系统悬赏生成、自我悬赏创建、挑战任务完整流程、定时任务挂载）
- 关键确认：创建→投票(approve:bool)→激活→提交(text+photoUrls)→判定(targetUserId+verdict)→完成全流程通过；joinAsChallenger 角色分配正确；系统悬赏每日自动生成；定时任务 10 分钟间隔正常启动
- 遗留问题：无

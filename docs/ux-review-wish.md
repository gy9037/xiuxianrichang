# UX Review — 愿望页（wish.js）

> 用户群：家庭（含老人小孩），移动端为主
> 审查时间：2026-04-09

---

## 操作步骤

`submitCreate()` 提交时按钮无禁用/loading 状态，快速双击可重复提交 | 🔴 | 提交后立即禁用按钮，await 完成后恢复
`startBattle()` 进入战斗后需等待 3 个并行请求，期间无进度提示，只有静态文字"正在推演Boss天机..." | 🔴 | 加 spinner 或骨架屏，明确告知加载中
`redeem()` 兑现奖励无二次确认，老人/小孩误触即触发不可逆操作 | 🔴 | 弹出确认对话框："确认兑现「xxx」奖励？"
`executeBattle()` 开始挑战按钮无 loading 状态，网络慢时用户会反复点击 | 🔴 | 点击后禁用按钮并显示"挑战中..."
创建愿望流程共 5 个字段，老人用户认知负担较重，无步骤指引 | 🟡 | 考虑分步表单或折叠可选项（描述字段默认收起）

## 即时反馈 / Loading

`load()` 初始加载无任何 loading 占位，页面空白直到数据返回 | 🔴 | 渲染前先展示骨架屏或 spinner
`startBattle()` 错误时调用 `App.toast` 后直接 `this.render()`，用户不知道哪一步失败 | 🟡 | toast 错误信息应更具体，区分"道具加载失败"/"Boss生成失败"
`showBattleResult()` 回合动画用 `setTimeout` 逐条追加，但无整体完成提示，用户不知道动画何时结束 | 🟡 | 最后一条回合后显示"战斗结束"分隔线或滚动到结果区
`redeem()` 成功后仅 toast，无视觉状态变化直到 `load()` 完成，存在短暂状态不一致 | 🟡 | toast 后立即在本地更新对应卡片状态为"已兑现"

## 视觉引导

"挑战Boss"按钮使用 `btn-primary`，"开始挑战！"使用 `btn-danger`，同一流程两个主操作按钮样式不统一，语义混乱 | 🟡 | 统一主操作按钮样式，danger 仅用于破坏性操作
战斗结果页"返回愿望池"按钮在回合动画期间即可点击，用户可能在看完动画前离开 | 🟡 | 动画播放完毕前禁用返回按钮，或动画结束后再渲染该按钮
筛选区域标签层级不清晰，"愿望类型"和"愿望状态"两组筛选视觉权重相同，老人用户难以区分 | 🟡 | 增加分组间距或用分割线区隔，字号可适当加大
空状态图标（🌟）和文案偏小，老人用户可能忽略"许下你的第一个愿望吧"的引导 | 🟢 | 增大 empty-state 字号，CTA 按钮直接放在空状态区域内

## 容错性

`wish-name` 和 `wish-reward` 仅做非空校验，未限制最大长度，超长内容可能破坏卡片布局 | 🟡 | 添加 `maxlength` 属性（建议 name≤30，reward≤50），并在 UI 显示字数
难度滑块 `oninput` 直接操作 DOM id，若 `diff-display` 元素不存在（如快速切换页面）会静默失败 | 🟡 | 加 `?.textContent` 安全访问，或改用状态驱动渲染
`canChallenge()` 中 `API.user.id` 若未登录为 undefined，单人愿望判断会静默失败显示"不可挑战" | 🟡 | 登录态检查前置，未登录时给出明确提示
`getOddsText()` 胜算计算依赖 `this.character`，若角色数据加载失败则显示"胜算未知"，但无任何提示说明原因 | 🟢 | "胜算未知"旁加小字"（角色数据加载失败）"

## 移动端适配

`page-header` 中"许愿"按钮用 `float:right` 布局，在小屏设备上与标题文字可能重叠 | 🔴 | 改用 `display:flex; justify-content:space-between` 替代 float
`← ` 返回箭头点击区域仅为文字大小，移动端难以精准点击（建议最小 44×44px） | 🔴 | 将返回区域包裹在 `<button>` 或设置 `min-width/height:44px; padding` 的容器中
道具列表 `item-row` 中 checkbox 原生样式在 iOS 上偏小，老人用户难以勾选 | 🔴 | 自定义 checkbox 样式，点击区域扩展到整行（`label` 包裹整个 item-row）
战斗详情数字信息密集（6行数据），小屏下行高 1.8 仍显拥挤 | 🟡 | 改为卡片式数据展示，每项独占一行并加图标区分
难度滑块在 iOS Safari 上默认样式较小，`accent-color` 支持有限 | 🟡 | 增加滑块高度（`height:6px`）并自定义 thumb 大小提升可操作性

## 状态一致性

`closeBattle()` 后不重置 `battleResult`，若再次进入战斗页残留上次结果数据 | 🟡 | `closeBattle()` 中加 `this.battleResult = null`
`startBattle()` 失败时设置 `this.showBattle = false` 并调用 `this.render()`，但 `this.selectedWish` 未清空 | 🟡 | 失败时同步清空 `this.selectedWish = null`
筛选状态（`typeFilter`/`statusFilter`）在切换到创建/战斗页后返回时保留，符合预期，但无视觉提示当前筛选条件已激活 | 🟢 | 激活筛选时在筛选区域顶部显示"已筛选：xxx"标签，方便用户感知
团队愿望 `teamProgress` 渲染依赖 `w.teamProgress` 存在，若后端未返回该字段则静默不显示，用户无法感知团队状态 | 🟡 | 团队愿望缺少 `teamProgress` 时显示"团队进度加载中"占位

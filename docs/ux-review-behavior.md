# UX Review — 行为上报页（behavior.js）

> 审查时间：2026-04-09
> 用户群：家庭（含老人小孩），移动端为主
> 审查范围：render()、renderShortcuts()、renderInputForm()、submit()、repeatLast()、selectShortcut()

---

## 问题清单

submit() 提交期间无任何 loading 状态，按钮可被多次点击，导致重复上报 | 🔴 | 提交时禁用按钮并显示"提交中…"文字，await 结束后恢复

render() 在 submit() 成功后被调用两次（第 620 行立即 render，Promise.all 回调里再次 render），两次渲染之间存在短暂状态撕裂 | 🔴 | 合并为一次 render：在 Promise.all 回调里统一更新 shortcuts/lastBehavior 后再 render，删除第一次提前调用的 render()

repeatLast() 调用 render() 后立即读取 DOM 元素预填充数值，若 render() 是异步或被浏览器批量处理则元素尚未挂载，预填充静默失败 | 🔴 | 改用 requestAnimationFrame 或 setTimeout(0) 包裹预填充逻辑，确保 DOM 已更新

selectShortcut() 与 repeatLast() 找不到行为时只 toast 报错，但 selectedCategory 已被修改，页面停留在半选中状态，视觉上类别高亮但行为列表为空 | 🔴 | 找不到行为时同步重置 selectedCategory / selectedSubCategory，或在 toast 后 return 前恢复原始状态

submitCustom() 连续发出两个串行 API 请求（POST /behavior/custom → POST /behavior），期间无 loading，用户可重复点击"保存"触发多次提交 | 🔴 | 提交开始时禁用保存按钮，两个请求全部完成后再恢复

loadHistory() 完成后直接操作 innerHTML 重建 tab bar（硬编码按钮状态），与 render() 的 tabBar 模板重复，若 tab 状态变化会出现不一致 | 🟡 | 抽取 renderTabBar() 方法统一复用，loadHistory / selectDate 调用同一方法而非内联字符串

renderInputForm() 的提交按钮（"打卡"/"提交"）高度未显式设置，依赖全局 .btn 样式，在小屏手机上点击区域可能不足 44px | 🟡 | 为主操作按钮添加 min-height:44px，与移动端触控目标规范对齐

renderShortcuts() 快捷按钮和"🔁 重复上次"按钮使用 btn-small，触控区域偏小，老人和小孩操作容易误触或点不中 | 🟡 | 快捷入口改用普通尺寸按钮（去掉 btn-small），或增加 padding 保证最小触控区域 44×44px

renderInputForm() 在移动端键盘弹出后，提交按钮可能被键盘遮挡，用户需手动滚动才能点击 | 🟡 | 提交按钮改为 position:sticky; bottom:0，或在 input focus 时用 scrollIntoView 将表单底部滚入视口

行为选择流程需要：选类别 → （选子类别）→ 选具体行为 → 填写数值 → 提交，共 4-5 步，对老人和小孩认知负担较重 | 🟡 | 考虑在选中具体行为后自动滚动到 renderInputForm 区域，减少用户需要"找到下一步在哪里"的困惑

historyData 在 navMonth() 时被置为 null，render() 立即执行 renderHistory()，此时 data 为空对象导致月历渲染为全空白，无加载提示 | 🟡 | navMonth 切换月份时在月历区域显示骨架屏或"加载中…"占位，与 weeklySummary 的处理方式保持一致

renderHistory() 中日历格子的点击区域仅为数字文本宽度（font-size:13px），在小屏设备上难以精准点击 | 🟡 | 日历格子改为固定尺寸（min-width:36px; min-height:36px），确保每个日期都有足够触控面积

load() 加载失败时只 toast 错误，页面内容为空白，用户不知道是网络问题还是没有数据 | 🟢 | 加载失败时在容器内渲染错误提示卡片，附带"重试"按钮

renderInputForm() 的备注输入框 placeholder 为"简单描述一下"，对不熟悉的用户缺乏引导，不知道该填什么 | 🟢 | placeholder 改为更具体的示例，如"例如：饭后散步、和孩子一起"

loadRecentHistory() 静默吞掉所有错误（catch 为空），最近记录区域在网络异常时永远显示空白，无任何提示 | 🟢 | catch 块中至少渲染一行"加载失败，请刷新重试"文字到 #behavior-history 容器

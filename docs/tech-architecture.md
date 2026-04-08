# 技术架构方案

> 版本：V1.0
> 日期：2026-04-04

## 技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| 后端 | Node.js + Express | 轻量、快速开发、生态成熟 |
| 数据库 | SQLite (better-sqlite3) | 零配置、单文件、本机运行、迁移时替换数据层即可 |
| 前端 | 原生 HTML/CSS/JS | 无构建步骤、移动端优先、迁微信小程序时前端重写 |
| 部署 | 本机局域网 | Express 监听 0.0.0.0，同WiFi设备用IP访问 |

## 项目结构

```
Xiuxianrichang/
├── docs/                    # 文档
├── server/                  # 后端
│   ├── index.js            # 入口，启动Express
│   ├── db.js               # 数据库初始化与连接
│   ├── routes/             # API路由
│   │   ├── auth.js         # 登录注册
│   │   ├── behavior.js     # 行为上报
│   │   ├── item.js         # 道具管理与合成
│   │   ├── character.js    # 角色属性与境界
│   │   ├── wish.js         # 愿望系统
│   │   ├── boss.js         # Boss生成与战斗
│   │   └── family.js       # 家庭动态
│   ├── services/           # 业务逻辑
│   │   ├── battle.js       # 战斗计算
│   │   ├── realm.js        # 境界判定
│   │   ├── decay.js        # 属性衰退
│   │   └── itemGen.js      # 道具生成
│   └── data/               # 预置数据
│       ├── items.json      # 道具名称库
│       ├── bosses.json     # Boss名称库
│       └── behaviors.json  # 初始行为分类
├── public/                  # 前端静态文件
│   ├── index.html          # 主页面（SPA式）
│   ├── css/
│   │   └── style.css       # 全局样式（移动端优先）
│   └── js/
│       ├── app.js          # 路由与页面切换
│       ├── api.js          # API调用封装
│       ├── pages/          # 各页面逻辑
│       │   ├── login.js
│       │   ├── home.js
│       │   ├── behavior.js
│       │   ├── inventory.js
│       │   ├── wish.js
│       │   ├── battle.js
│       │   ├── reward.js
│       │   └── family.js
│       └── components/     # 可复用组件
│           └── nav.js
├── package.json
└── data.db                 # SQLite数据库文件（运行时生成）
```

## API设计概要

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /api/auth/register | 注册 |
| POST | /api/auth/login | 登录 |
| GET | /api/character | 获取当前角色信息 |
| POST | /api/behavior | 上报行为 |
| GET | /api/behavior/list | 行为记录列表 |
| GET | /api/items | 道具背包 |
| POST | /api/items/synthesize | 合成永久属性 |
| GET | /api/wishes | 愿望列表 |
| POST | /api/wishes | 创建愿望 |
| POST | /api/battle/start | 开始Boss战（选择装备道具） |
| GET | /api/battle/:id | 查看战斗结果 |
| GET | /api/rewards | 奖励列表 |
| POST | /api/rewards/:id/redeem | 标记奖励已兑现 |
| GET | /api/family/feed | 家庭动态 |

## 认证方案

- 简易JWT token
- 登录后返回token，前端存localStorage
- 每次请求Header带 Authorization: Bearer <token>
- 预留openid字段，后续微信登录时扩展

## 启动方式

```bash
cd Xiuxianrichang
npm install
npm start
# 控制台输出局域网IP地址，手机浏览器访问
```

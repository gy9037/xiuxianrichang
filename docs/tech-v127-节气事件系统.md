# 技术方案：V1.2.7 节气事件系统

> 需求来源：策划案-06-节气事件系统
> 优先级：P2
> 影响范围：道具生成（itemGen）、行为上报（behavior）、角色信息（character）、签到（checkinService）、首页展示、新增节气图鉴页
> 新增文件：`server/data/solar-terms.json`、`server/services/solarTerm.js`
> 修改文件：`server/services/itemGen.js`、`server/routes/behavior.js`、`server/routes/character.js`、`server/services/checkinService.js`、`server/db.js`

---

## 一、概述

### 1.1 功能目标

为修仙日常引入二十四节气事件系统，每 15 天左右产生一次轻量内容变化：

1. 当前节气期间，关联行为类别的良品掉率绝对值 +15%
2. 节气期间行为产出的道具有概率替换为节气限定道具（仅名称替换，品质不变）
3. 重大节气（冬至/夏至/四立/春分秋分）当天签到额外奖励灵石
4. 首页展示当前节气卡片（古诗词、效果说明、倒计时）
5. 新增节气图鉴页，记录用户收集的限定道具

### 1.2 设计约束

- 节气效果通过参数传入 itemGen，保持 itemGen 为纯函数，不在内部读取节气状态
- 良品率加成是绝对值 +15%（即 goodRate += 0.15），不是乘法
- 限定道具是概率替换产出道具的名称，不是额外产出
- 节气日期采用预计算表方案（2025-2030），约 144 条记录，维护成本极低
- 重大节气分级依据《黄帝内经》：冬至/夏至最重要，四立次之，春分/秋分再次

---

## 二、数据设计

### 2.1 solar-terms.json 完整结构

文件路径：`server/data/solar-terms.json`

文件包含两个顶层字段：`definitions`（24 个节气的静态定义）和 `calendar`（2025-2030 年精确日期表）。

#### definitions 结构

```json
{
  "definitions": [
    {
      "id": "xiaohan",
      "name": "小寒",
      "order": 1,
      "attributes": ["physique"],
      "target_categories": ["身体健康"],
      "theme": "数九寒冬，以寒磨体",
      "flavor": "天寒地冻，正是以寒气淬炼体魄的好时机。",
      "poem": "众芳摇落独暄妍，占尽风情向小园。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "寒铁淬体丸",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "dahan",
      "name": "大寒",
      "order": 2,
      "attributes": ["willpower"],
      "target_categories": ["生活习惯"],
      "theme": "最冷之时，静定凝神",
      "flavor": "大寒极冷，万物蛰伏，唯有道心坚定者方能安然度过。",
      "poem": "岁暮阴阳催短景，天涯霜雪霁寒宵。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "玄冬凝神散",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "lichun",
      "name": "立春",
      "order": 3,
      "attributes": ["willpower"],
      "target_categories": ["生活习惯"],
      "theme": "万物复苏，道心萌发",
      "flavor": "东风解冻，万物复苏，道心随春意萌发。",
      "poem": "春三月，此谓发陈，天地俱生，万物以荣。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "东风解冻丹",
        "replace_probability": 0.20
      },
      "major_term": {
        "level": 2,
        "label": "四立",
        "extra_stones": 3,
        "health_tip": "春三月，此谓发陈，天地俱生，万物以荣。早卧早起，广步于庭。",
        "source": "《素问·四气调神大论》"
      }
    },
    {
      "id": "yushui",
      "name": "雨水",
      "order": 4,
      "attributes": ["comprehension"],
      "target_categories": ["学习"],
      "theme": "润物无声，化雨为智",
      "flavor": "春雨润泽大地，灵气随雨水渗入万物，正是参悟的好时机。",
      "poem": "好雨知时节，当春乃发生。随风潜入夜，润物细无声。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "春雨润智露",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "jingzhe",
      "name": "惊蛰",
      "order": 5,
      "attributes": ["physique"],
      "target_categories": ["身体健康"],
      "theme": "蛰龙苏醒，奋起炼体",
      "flavor": "春雷惊蛰，蛰伏的龙蛇苏醒，正是奋起炼体之时。",
      "poem": "微雨众卉新，一雷惊蛰始。田家几日闲，耕种从此起。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "春雷惊蛰符",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "chunfen",
      "name": "春分",
      "order": 6,
      "attributes": ["dexterity", "perception"],
      "target_categories": ["家务", "社交互助"],
      "theme": "阴阳平衡，万物协调",
      "flavor": "春分日夜等长，阴阳平衡，万物协调生长。",
      "poem": "雪入春分省见稀，半开桃李不胜威。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "阴阳平衡诀",
        "replace_probability": 0.20
      },
      "major_term": {
        "level": 3,
        "label": "二分",
        "extra_stones": 2,
        "health_tip": "春分阴阳相半，宜调和饮食，不偏寒热，以养中和之气。",
        "source": "《素问·至真要大论》"
      }
    },
    {
      "id": "qingming",
      "name": "清明",
      "order": 7,
      "attributes": ["perception"],
      "target_categories": ["社交互助"],
      "theme": "慎终追远，感知情深",
      "flavor": "清明时节，天地清朗，感知力随之精进。",
      "poem": "清明时节雨纷纷，路上行人欲断魂。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "清明感知符",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "guyu",
      "name": "谷雨",
      "order": 8,
      "attributes": ["comprehension"],
      "target_categories": ["学习"],
      "theme": "谷雨润心，学以致用",
      "flavor": "谷雨降临，百谷得雨而生，正是将所学化为实践的时机。",
      "poem": "春山谷雨前，并手摘芳烟。绿嫩难盈笼，清和易晚天。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "谷雨启慧丹",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "lixia",
      "name": "立夏",
      "order": 9,
      "attributes": ["physique"],
      "target_categories": ["身体健康"],
      "theme": "阳气初盛，夏日炼体",
      "flavor": "立夏之后，阳气渐盛，正是炼体的好时节。",
      "poem": "绿树阴浓夏日长，楼台倒影入池塘。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "初阳炼体露",
        "replace_probability": 0.20
      },
      "major_term": {
        "level": 2,
        "label": "四立",
        "extra_stones": 3,
        "health_tip": "夏三月，此谓蕃秀，天地气交，万物华实。夜卧早起，无厌于日。",
        "source": "《素问·四气调神大论》"
      }
    },
    {
      "id": "xiaoman",
      "name": "小满",
      "order": 10,
      "attributes": ["dexterity"],
      "target_categories": ["家务"],
      "theme": "小得盈满，精进百艺",
      "flavor": "小满时节，万物小得盈满，正是精进技艺的好时机。",
      "poem": "夜莺啼绿柳，皓月醒长空。最爱垄头麦，迎风笑落红。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "小满精巧丸",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "mangzhong",
      "name": "芒种",
      "order": 11,
      "attributes": ["dexterity"],
      "target_categories": ["家务"],
      "theme": "勤耕不辍，事必躬亲",
      "flavor": "芒种忙种，勤耕不辍，事必躬亲方能有所收获。",
      "poem": "时雨及芒种，四野皆插秧。家家麦饭美，处处菱歌长。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "芒种勤耕符",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "xiazhi",
      "name": "夏至",
      "order": 12,
      "attributes": ["physique"],
      "target_categories": ["身体健康"],
      "theme": "一阳盛极，淬体最佳",
      "flavor": "夏至阳气最盛，正是以烈阳淬炼体魄的最佳时机。",
      "poem": "夏至一阴生，宜使志无怒，使气得泄。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "盛阳金身丹",
        "replace_probability": 0.20
      },
      "major_term": {
        "level": 1,
        "label": "二至",
        "extra_stones": 5,
        "health_tip": "夏至一阴生，宜使志无怒，使气得泄，若所爱在外。",
        "source": "《素问·四气调神大论》"
      }
    },
    {
      "id": "xiaoshu",
      "name": "小暑",
      "order": 13,
      "attributes": ["willpower"],
      "target_categories": ["生活习惯"],
      "theme": "暑气渐盛，静心定气",
      "flavor": "小暑暑气渐盛，唯有静心定气方能安然度夏。",
      "poem": "倏忽温风至，因循小暑来。竹喧先觉雨，山暗已闻雷。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "暑气静心散",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "dashu",
      "name": "大暑",
      "order": 14,
      "attributes": ["physique"],
      "target_categories": ["身体健康"],
      "theme": "烈阳如炉，百炼成钢",
      "flavor": "大暑酷热，如同天地间的炼丹炉，百炼方能成钢。",
      "poem": "赤日几时过，清风无处寻。经书聊枕籍，瓜李漫浮沉。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "赤炎百炼丸",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "liqiu",
      "name": "立秋",
      "order": 15,
      "attributes": ["comprehension"],
      "target_categories": ["学习"],
      "theme": "秋收启智，硕果累累",
      "flavor": "金风送爽，天地间灵气随之收敛，正是参悟道法的最佳时机。",
      "poem": "自古逢秋悲寂寥，我言秋日胜春朝。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "金秋悟道露",
        "replace_probability": 0.20
      },
      "major_term": {
        "level": 2,
        "label": "四立",
        "extra_stones": 3,
        "health_tip": "秋三月，此谓容平，天气以急，地气以明。早卧早起，与鸡俱兴。",
        "source": "《素问·四气调神大论》"
      }
    },
    {
      "id": "chushu",
      "name": "处暑",
      "order": 16,
      "attributes": ["perception"],
      "target_categories": ["社交互助"],
      "theme": "暑退天清，感知精进",
      "flavor": "处暑暑气渐退，天高气清，感知力随之精进。",
      "poem": "处暑无三日，新凉直万金。白头更世事，青草印禅心。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "天清感应符",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "bailu",
      "name": "白露",
      "order": 17,
      "attributes": ["comprehension"],
      "target_categories": ["学习"],
      "theme": "露凝成珠，灵感凝练",
      "flavor": "白露凝结，如同灵感凝练成珠，正是苦读参悟之时。",
      "poem": "蒹葭苍苍，白露为霜。所谓伊人，在水一方。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "白露凝珠丹",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "qiufen",
      "name": "秋分",
      "order": 18,
      "attributes": ["comprehension", "dexterity"],
      "target_categories": ["学习", "家务"],
      "theme": "金秋丰收，学艺双修",
      "flavor": "秋分日夜等长，阴阳再次平衡，学艺双修正当时。",
      "poem": "金气秋分，风清露冷秋期半。凉蟾光满，桂子飘香远。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "金秋双修诀",
        "replace_probability": 0.20
      },
      "major_term": {
        "level": 3,
        "label": "二分",
        "extra_stones": 2,
        "health_tip": "秋分阴阳相半，宜收敛神气，使秋气平，无外其志，使肺气清。",
        "source": "《素问·四气调神大论》"
      }
    },
    {
      "id": "hanlu",
      "name": "寒露",
      "order": 19,
      "attributes": ["willpower"],
      "target_categories": ["生活习惯"],
      "theme": "寒露凝神，道心愈固",
      "flavor": "寒露降临，天气转凉，正是凝神固心的好时机。",
      "poem": "袅袅凉风动，凄凄寒露零。兰衰花始白，荷破叶犹青。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "寒露固心丸",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "shuangjang",
      "name": "霜降",
      "order": 20,
      "attributes": ["physique", "willpower"],
      "target_categories": ["身体健康", "生活习惯"],
      "theme": "霜降强体，内外兼修",
      "flavor": "霜降时节，天地肃杀，正是内外兼修、强化体魄与心性的时机。",
      "poem": "霜降水返壑，风落木归山。冉冉岁将宴，物皆复本源。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "霜降强魄符",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "lidong",
      "name": "立冬",
      "order": 21,
      "attributes": ["perception"],
      "target_categories": ["社交互助"],
      "theme": "冬藏温情，守望相助",
      "flavor": "立冬之后，万物收藏，正是守望相助、温暖彼此的时节。",
      "poem": "冻笔新诗懒写，寒炉美酒时温。醉看墨花月白，恍疑雪满前村。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "立冬温情露",
        "replace_probability": 0.20
      },
      "major_term": {
        "level": 2,
        "label": "四立",
        "extra_stones": 3,
        "health_tip": "冬三月，此谓闭藏，水冰地坼，无扰乎阳。早卧晚起，必待日光。",
        "source": "《素问·四气调神大论》"
      }
    },
    {
      "id": "xiaoxue",
      "name": "小雪",
      "order": 22,
      "attributes": ["comprehension"],
      "target_categories": ["学习"],
      "theme": "雪中独行，沉心苦读",
      "flavor": "小雪纷飞，天地寂静，正是沉心苦读的好时光。",
      "poem": "六出飞花入户时，坐看青竹变琼枝。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "雪中苦读散",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "daxue",
      "name": "大雪",
      "order": 23,
      "attributes": ["willpower"],
      "target_categories": ["生活习惯"],
      "theme": "大雪封路，内守道心",
      "flavor": "大雪封山，万径人踪灭，正是内守道心、磨炼心性之时。",
      "poem": "千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。",
      "effect": {
        "type": "quality_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "冰心守道丹",
        "replace_probability": 0.20
      },
      "major_term": null
    },
    {
      "id": "dongzhi",
      "name": "冬至",
      "order": 24,
      "attributes": ["physique", "comprehension", "willpower", "dexterity", "perception"],
      "target_categories": ["身体健康", "学习", "生活习惯", "家务", "社交互助"],
      "theme": "天地归元，一阳初生",
      "flavor": "冬至一阳生，天地归元，万物蕴含新生之力，修炼之路迎来新的轮回。",
      "poem": "天时人事日相催，冬至阳生春又来。",
      "effect": {
        "type": "all_boost",
        "liang_rate_bonus": 0.15
      },
      "limited_item": {
        "name": "天地归元丹",
        "replace_probability": 0.25
      },
      "major_term": {
        "level": 1,
        "label": "二至",
        "extra_stones": 5,
        "health_tip": "冬至一阳生，宜早卧晚起，养藏阳气，不可妄耗精神。",
        "source": "《素问·四气调神大论》"
      }
    }
  ],
  "calendar": {
    "2025": {
      "xiaohan": "2025-01-05", "dahan": "2025-01-20",
      "lichun": "2025-02-03", "yushui": "2025-02-18",
      "jingzhe": "2025-03-05", "chunfen": "2025-03-20",
      "qingming": "2025-04-04", "guyu": "2025-04-20",
      "lixia": "2025-05-05", "xiaoman": "2025-05-21",
      "mangzhong": "2025-06-05", "xiazhi": "2025-06-21",
      "xiaoshu": "2025-07-07", "dashu": "2025-07-22",
      "liqiu": "2025-08-07", "chushu": "2025-08-23",
      "bailu": "2025-09-07", "qiufen": "2025-09-23",
      "hanlu": "2025-10-08", "shuangjang": "2025-10-23",
      "lidong": "2025-11-07", "xiaoxue": "2025-11-22",
      "daxue": "2025-12-07", "dongzhi": "2025-12-22"
    },
    "2026": {
      "xiaohan": "2026-01-05", "dahan": "2026-01-20",
      "lichun": "2026-02-04", "yushui": "2026-02-18",
      "jingzhe": "2026-03-05", "chunfen": "2026-03-20",
      "qingming": "2026-04-05", "guyu": "2026-04-20",
      "lixia": "2026-05-05", "xiaoman": "2026-05-21",
      "mangzhong": "2026-06-05", "xiazhi": "2026-06-21",
      "xiaoshu": "2026-07-07", "dashu": "2026-07-23",
      "liqiu": "2026-08-07", "chushu": "2026-08-23",
      "bailu": "2026-09-07", "qiufen": "2026-09-23",
      "hanlu": "2026-10-08", "shuangjang": "2026-10-23",
      "lidong": "2026-11-07", "xiaoxue": "2026-11-22",
      "daxue": "2026-12-07", "dongzhi": "2026-12-22"
    },
    "2027": {
      "xiaohan": "2027-01-05", "dahan": "2027-01-20",
      "lichun": "2027-02-04", "yushui": "2027-02-19",
      "jingzhe": "2027-03-06", "chunfen": "2027-03-21",
      "qingming": "2027-04-05", "guyu": "2027-04-20",
      "lixia": "2027-05-06", "xiaoman": "2027-05-21",
      "mangzhong": "2027-06-06", "xiazhi": "2027-06-22",
      "xiaoshu": "2027-07-07", "dashu": "2027-07-23",
      "liqiu": "2027-08-07", "chushu": "2027-08-23",
      "bailu": "2027-09-08", "qiufen": "2027-09-23",
      "hanlu": "2027-10-08", "shuangjang": "2027-10-24",
      "lidong": "2027-11-07", "xiaoxue": "2027-11-22",
      "daxue": "2027-12-07", "dongzhi": "2027-12-22"
    },
    "2028": {
      "xiaohan": "2028-01-06", "dahan": "2028-01-21",
      "lichun": "2028-02-04", "yushui": "2028-02-19",
      "jingzhe": "2028-03-05", "chunfen": "2028-03-20",
      "qingming": "2028-04-04", "guyu": "2028-04-19",
      "lixia": "2028-05-05", "xiaoman": "2028-05-20",
      "mangzhong": "2028-06-05", "xiazhi": "2028-06-21",
      "xiaoshu": "2028-07-06", "dashu": "2028-07-22",
      "liqiu": "2028-08-07", "chushu": "2028-08-22",
      "bailu": "2028-09-07", "qiufen": "2028-09-22",
      "hanlu": "2028-10-07", "shuangjang": "2028-10-23",
      "lidong": "2028-11-07", "xiaoxue": "2028-11-22",
      "daxue": "2028-12-06", "dongzhi": "2028-12-21"
    },
    "2029": {
      "xiaohan": "2029-01-05", "dahan": "2029-01-20",
      "lichun": "2029-02-03", "yushui": "2029-02-18",
      "jingzhe": "2029-03-05", "chunfen": "2029-03-20",
      "qingming": "2029-04-04", "guyu": "2029-04-20",
      "lixia": "2029-05-05", "xiaoman": "2029-05-21",
      "mangzhong": "2029-06-05", "xiazhi": "2029-06-21",
      "xiaoshu": "2029-07-07", "dashu": "2029-07-22",
      "liqiu": "2029-08-07", "chushu": "2029-08-23",
      "bailu": "2029-09-07", "qiufen": "2029-09-22",
      "hanlu": "2029-10-08", "shuangjang": "2029-10-23",
      "lidong": "2029-11-07", "xiaoxue": "2029-11-22",
      "daxue": "2029-12-07", "dongzhi": "2029-12-21"
    },
    "2030": {
      "xiaohan": "2030-01-05", "dahan": "2030-01-20",
      "lichun": "2030-02-04", "yushui": "2030-02-19",
      "jingzhe": "2030-03-06", "chunfen": "2030-03-21",
      "qingming": "2030-04-05", "guyu": "2030-04-20",
      "lixia": "2030-05-06", "xiaoman": "2030-05-21",
      "mangzhong": "2030-06-06", "xiazhi": "2030-06-21",
      "xiaoshu": "2030-07-07", "dashu": "2030-07-23",
      "liqiu": "2030-08-08", "chushu": "2030-08-23",
      "bailu": "2030-09-08", "qiufen": "2030-09-23",
      "hanlu": "2030-10-08", "shuangjang": "2030-10-23",
      "lidong": "2030-11-08", "xiaoxue": "2030-11-22",
      "daxue": "2030-12-07", "dongzhi": "2030-12-22"
    }
  }
}
```

字段说明：

- `definitions[].id`：节气拼音 ID，与 calendar 中的 key 对应
- `definitions[].order`：节气序号（1-24），用于排序和图鉴展示
- `definitions[].attributes`：关联的属性字段名数组（对应 characters 表字段）
- `definitions[].target_categories`：关联的行为类别数组（对应 behaviors.category）
- `definitions[].effect.liang_rate_bonus`：良品率绝对加成值（0.15 = +15%）
- `definitions[].limited_item.replace_probability`：限定道具替换概率（0.20 = 20%）
- `definitions[].major_term`：重大节气标记，null 表示普通节气
  - `level`：重要程度（1=最重要/二至，2=重要/四立，3=次重要/二分）
  - `extra_stones`：额外灵石奖励
  - `health_tip`：《黄帝内经》养生提示
  - `source`：出处

#### 重大节气灵石奖励汇总

| 等级 | 节气 | 额外灵石 |
|------|------|---------|
| 1（二至） | 冬至、夏至 | 5 |
| 2（四立） | 立春、立夏、立秋、立冬 | 3 |
| 3（二分） | 春分、秋分 | 2 |

### 2.2 节气图鉴表

在 `db.js` 的 `initDB()` 中新增：

```sql
CREATE TABLE IF NOT EXISTS solar_term_collection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  term_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  obtained_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, term_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

字段说明：
- `term_id`：节气 ID（如 `liqiu`），与 solar-terms.json 中的 definitions[].id 对应
- `item_name`：获得的限定道具名称
- `UNIQUE(user_id, term_id)`：每个用户每个节气只记录首次获得

---

## 三、后端详细设计

### 3.1 server/services/solarTerm.js（新增）

```js
const solarTermsData = require('../data/solar-terms.json');

const definitions = solarTermsData.definitions;
const calendar = solarTermsData.calendar;

// 构建 id -> definition 的索引
const defMap = {};
for (const def of definitions) {
  defMap[def.id] = def;
}

/**
 * 获取当前节气信息
 * @param {Date|string} [date] - 可选，默认当前 UTC+8 日期
 * @returns {object|null} 当前节气定义对象，不在任何节气期间返回 null
 *
 * 算法：遍历当年 calendar，找到 startDate <= today < nextStartDate 的节气。
 * 跨年处理：如果当前日期早于当年第一个节气（小寒），则属于上一年最后一个节气（冬至）。
 */
function getCurrentSolarTerm(date) {
  const today = toUTC8DateStr(date || new Date());
  const year = parseInt(today.substring(0, 4), 10);

  // 收集当年和相邻年份的节气日期，按日期排序
  const entries = [];
  for (const y of [year - 1, year, year + 1]) {
    const yearCal = calendar[String(y)];
    if (!yearCal) continue;
    for (const [termId, dateStr] of Object.entries(yearCal)) {
      entries.push({ termId, date: dateStr });
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));

  // 找到 today 所属的节气区间
  for (let i = entries.length - 1; i >= 0; i--) {
    if (today >= entries[i].date) {
      const def = defMap[entries[i].termId];
      if (!def) return null;

      const nextDate = entries[i + 1]?.date || null;
      const daysLeft = nextDate ? daysBetween(today, nextDate) - 1 : 0;

      return {
        ...def,
        startDate: entries[i].date,
        endDate: nextDate || null,
        daysLeft,
      };
    }
  }
  return null;
}

/**
 * 获取节气对行为的效果
 * @param {string} category - 行为类别（如 '身体健康'）
 * @param {object|null} term - getCurrentSolarTerm() 的返回值
 * @returns {{ liangRateBonus: number, limitedItem: object|null }}
 */
function getEffect(category, term) {
  if (!term) return { liangRateBonus: 0, limitedItem: null };

  const isTargetCategory = term.target_categories.includes(category);
  if (!isTargetCategory) return { liangRateBonus: 0, limitedItem: null };

  return {
    liangRateBonus: term.effect.liang_rate_bonus,
    limitedItem: term.limited_item,
  };
}

/**
 * 判断是否为重大节气（用于签到额外灵石）
 * @param {object|null} term - getCurrentSolarTerm() 的返回值
 * @param {string} today - 当天日期 YYYY-MM-DD
 * @returns {{ isMajor: boolean, extraStones: number, healthTip: string|null, source: string|null }}
 */
function isMajorTerm(term, today) {
  if (!term || !term.major_term) {
    return { isMajor: false, extraStones: 0, healthTip: null, source: null };
  }
  // 仅在节气当天发放额外灵石
  if (term.startDate !== today) {
    return { isMajor: false, extraStones: 0, healthTip: null, source: null };
  }
  return {
    isMajor: true,
    extraStones: term.major_term.extra_stones,
    healthTip: term.major_term.health_tip,
    source: term.major_term.source,
  };
}

// --- 工具函数 ---

function toUTC8DateStr(date) {
  if (typeof date === 'string') return date;
  const d = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00Z');
  const d2 = new Date(dateStr2 + 'T00:00:00Z');
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

module.exports = { getCurrentSolarTerm, getEffect, isMajorTerm };
```

接口说明：

| 函数 | 入参 | 返回 | 用途 |
|------|------|------|------|
| `getCurrentSolarTerm(date?)` | 可选日期 | 节气定义对象（含 startDate/endDate/daysLeft）或 null | 获取当前节气，供 character.js 和 behavior.js 调用 |
| `getEffect(category, term)` | 行为类别 + 节气对象 | `{ liangRateBonus, limitedItem }` | 获取节气对特定行为类别的效果，供 behavior.js 传入 itemGen |
| `isMajorTerm(term, today)` | 节气对象 + 当天日期 | `{ isMajor, extraStones, healthTip, source }` | 判断是否重大节气当天，供 checkinService 使用 |

设计要点：
- `getCurrentSolarTerm` 是唯一读取 solar-terms.json 的入口，其他模块通过参数接收节气信息
- `getEffect` 是纯函数，不访问任何外部状态
- `isMajorTerm` 严格限制为节气当天才发放额外灵石，避免重复发放


### 3.2 server/services/itemGen.js 改动

#### 3.2.1 determineQuality 增加 liangRateBonus 参数

现有签名：`determineQuality(category, intensity, cultivationDropBonus = 0)`

改为：`determineQuality(category, intensity, cultivationDropBonus = 0, liangRateBonus = 0)`

```js
function determineQuality(category, intensity, cultivationDropBonus = 0, liangRateBonus = 0) {
  let goodRate = 0.2; // 默认 20% 良品

  if (category === '身体健康' && intensity) {
    const rateMap = {
      热身: 0.10,
      低强度: 0.20,
      高强度: 0.40,
      拉伸: 0.15,
    };
    goodRate = rateMap[intensity] ?? 0.20;
  }

  // 修炼状态掉率加成
  goodRate += cultivationDropBonus;

  // 节气良品率加成（绝对值 +15%）
  goodRate += liangRateBonus;

  goodRate = Math.min(goodRate, 0.95);

  return Math.random() < goodRate ? '良品' : '凡品';
}
```

变更点：
- 新增第四个参数 `liangRateBonus`，默认 0，由调用方（behavior.js）传入
- 加成方式为绝对值相加（`goodRate += liangRateBonus`），不是乘法
- 上限仍为 0.95，与现有逻辑一致
- 向后兼容：不传第四个参数时行为不变

#### 3.2.2 generateItem 增加限定道具替换逻辑

现有签名：`generateItem(category, quality)`

改为：`generateItem(category, quality, limitedItem = null)`

```js
function generateItem(category, quality, limitedItem = null) {
  const attrType = CATEGORY_TO_ATTR[category];
  if (!attrType) return null;

  const names = itemNames[category] || itemNames['默认'];
  let name = names[Math.floor(Math.random() * names.length)];
  const tempValue = QUALITY_VALUES[quality];

  // 节气限定道具替换：按概率将道具名替换为限定道具名
  let isLimitedItem = false;
  if (limitedItem && Math.random() < limitedItem.replace_probability) {
    name = limitedItem.name;
    isLimitedItem = true;
  }

  const description = itemDescriptions[name] || '';

  return { name, quality, attribute_type: attrType, temp_value: tempValue, description, isLimitedItem };
}
```

变更点：
- 新增第三个参数 `limitedItem`，结构为 `{ name, replace_probability }` 或 null
- 替换逻辑：`Math.random() < limitedItem.replace_probability` 时，将道具名替换为限定道具名
- 仅替换名称，品质（quality）和临时属性值（temp_value）保持不变
- 返回值新增 `isLimitedItem` 字段，供调用方判断是否需要写入图鉴
- 向后兼容：不传第三个参数时行为不变

### 3.3 server/routes/behavior.js 改动

在 `POST /api/behavior` 路由中，获取节气效果并传入 itemGen。

```js
// 文件顶部新增 require
const { getCurrentSolarTerm, getEffect } = require('../services/solarTerm');

// POST /api/behavior 路由内部，在 cultivation 获取之后、determineQuality 之前：

  const cultivation = getCultivationStatus(req.user.id);

  // --- 新增：获取节气效果 ---
  const currentTerm = getCurrentSolarTerm();
  const solarEffect = getEffect(category, currentTerm);

  // Determine quality by probability（增加节气加成参数）
  const quality = determineQuality(
    category,
    intensity || null,
    cultivation.dropBonus,
    solarEffect.liangRateBonus          // 新增：节气良品率加成
  );

  // Generate item（增加限定道具参数）
  const item = generateItem(category, quality, solarEffect.limitedItem);
  if (!item) return res.status(500).json({ error: '道具生成失败' });

  // --- 新增：限定道具写入图鉴（首次获得） ---
  if (item.isLimitedItem && currentTerm) {
    db.prepare(`
      INSERT OR IGNORE INTO solar_term_collection (user_id, term_id, item_name)
      VALUES (?, ?, ?)
    `).run(req.user.id, currentTerm.id, item.name);
  }
```

变更点：
- 引入 solarTerm 服务，获取当前节气和效果
- 将 `solarEffect.liangRateBonus` 作为第四个参数传入 `determineQuality`
- 将 `solarEffect.limitedItem` 作为第三个参数传入 `generateItem`
- 限定道具首次获得时写入 `solar_term_collection` 表（INSERT OR IGNORE 保证幂等）
- 响应体新增 `solarTerm` 字段（见 API 变更清单）

响应体变更（在现有 res.json 中新增）：

```js
  res.json({
    behavior: { /* 不变 */ },
    item: {
      /* 现有字段不变 */
      isLimitedItem: item.isLimitedItem,   // 新增
    },
    cultivationStatus: cultivation,
    checkinResult,
    attrTempTotal,
    solarTerm: currentTerm ? {             // 新增
      name: currentTerm.name,
      theme: currentTerm.theme,
    } : null,
  });
```

### 3.4 server/routes/character.js 改动

在 `GET /api/character` 响应中新增 `currentSolarTerm` 字段。

```js
// 文件顶部新增 require
const { getCurrentSolarTerm } = require('../services/solarTerm');

// GET /api/character 路由内部，在 res.json 之前：
  const currentTerm = getCurrentSolarTerm();

  res.json({
    character: { /* 不变 */ },
    tags,
    trend,
    promotion,
    decayStatus,
    cultivationStatus,
    spiritStones,
    checkinStatus,
    pinnedBehaviors,
    behaviorGoals,
    appVersion: pkg.version,
    // --- 新增 ---
    currentSolarTerm: currentTerm ? {
      id: currentTerm.id,
      name: currentTerm.name,
      theme: currentTerm.theme,
      flavor: currentTerm.flavor,
      poem: currentTerm.poem,
      attributes: currentTerm.attributes,
      target_categories: currentTerm.target_categories,
      effect: {
        type: currentTerm.effect.type,
        liang_rate_bonus: currentTerm.effect.liang_rate_bonus,
      },
      limited_item_name: currentTerm.limited_item.name,
      startDate: currentTerm.startDate,
      daysLeft: currentTerm.daysLeft,
      major_term: currentTerm.major_term,
    } : null,
  });
```

变更点：
- 新增 `currentSolarTerm` 字段，前端用于渲染首页节气卡片和节气变更弹窗
- 包含完整的展示信息：名称、主题、诗词、效果说明、限定道具名、倒计时天数
- 不在节气期间时返回 null（理论上不会出现，因为节气是连续的）

### 3.5 server/services/checkinService.js 改动

在 `doCheckin` 中增加重大节气额外灵石奖励。

```js
// 文件顶部新增 require
const { getCurrentSolarTerm, isMajorTerm } = require('./solarTerm');

// doCheckin 函数内部，在计算 reward 之后、事务之前：

  const prevStreak = getStreak(userId, today);
  const streak = prevStreak + 1;
  const reward = calcReward(streak);

  // --- 新增：重大节气额外灵石 ---
  const currentTerm = getCurrentSolarTerm();
  const majorInfo = isMajorTerm(currentTerm, today);
  const totalReward = reward + majorInfo.extraStones;

  // 事务：插入签到记录 + 增加灵石（使用 totalReward）
  const transaction = db.transaction(() => {
    db.prepare('INSERT INTO checkins (user_id, checkin_date, streak, reward) VALUES (?, ?, ?, ?)')
      .run(userId, today, streak, totalReward);
    db.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?')
      .run(totalReward, userId);
  });
  transaction();

  const user = db.prepare('SELECT spirit_stones FROM users WHERE id = ?').get(userId);

  return {
    alreadyCheckedIn: false,
    streak,
    reward: totalReward,
    baseReward: reward,                    // 新增：基础灵石（连续签到）
    totalStones: user?.spirit_stones || 0,
    // --- 新增：重大节气信息 ---
    majorTerm: majorInfo.isMajor ? {
      termName: currentTerm.name,
      extraStones: majorInfo.extraStones,
      healthTip: majorInfo.healthTip,
      source: majorInfo.source,
    } : null,
  };
```

变更点：
- 引入 solarTerm 服务，判断当天是否为重大节气
- 额外灵石与签到灵石合并发放（`totalReward = reward + majorInfo.extraStones`）
- 返回值新增 `majorTerm` 对象和 `baseReward` 字段，前端据此展示养生提示
- `isMajorTerm` 严格限制为节气当天，避免整个节气期间重复发放
- 已签到用户（`alreadyCheckedIn: true`）的返回路径不受影响，因为灵石已在首次签到时发放

### 3.6 server/db.js 改动

在 `initDB()` 中新增 `solar_term_collection` 表：

```js
  // V1.2.7 - 节气图鉴表
  db.exec(`
    CREATE TABLE IF NOT EXISTS solar_term_collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      term_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      obtained_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, term_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
```

---

## 四、前端详细设计

### 4.1 首页节气卡片

位置：首页（home 页面）现有内容下方，签到卡片之后。

数据来源：`GET /api/character` 返回的 `currentSolarTerm` 字段。

渲染逻辑：
- `currentSolarTerm` 为 null 时不渲染（理论上不会出现）
- 卡片内容：节气名称、flavor 文本、古诗词（poem）、效果说明（target_categories + liang_rate_bonus）、限定道具名、倒计时（daysLeft）
- 卡片样式：与现有卡片风格一致，增加节气主题色（可选，后续迭代）

```
┌────────────────────────────────────┐
│  当前节气：{name}                    │
│  {flavor}                           │
│                                     │
│  「{poem}」                          │
│                                     │
│  ✦ {target_categories}良品掉率 +15%  │
│  ✦ 限定道具「{limited_item_name}」    │
│                                     │
│  距下一节气还有 {daysLeft} 天         │
└────────────────────────────────────┘
```

### 4.2 节气变更弹窗

触发条件：用户打开小程序/Web 时，检查本地存储 `lastShownTermId`，若与 `currentSolarTerm.id` 不同则弹出。

弹窗内容：节气名称、主题（theme）、古诗词（poem）、效果说明。

关闭后将 `currentSolarTerm.id` 写入本地存储，同一节气不再重复弹出。

实现方式：
- 微信小程序：`wx.setStorageSync('lastShownTermId', termId)`
- Web 版：`localStorage.setItem('lastShownTermId', termId)`

### 4.3 节气图鉴页

新增独立页面（或作为道具背包的子 Tab），展示 24 个节气限定道具的收集状态。

数据来源：新增 API `GET /api/character/solar-collection`（见 API 变更清单）。

页面布局：
- 24 格网格，按节气顺序（order 1-24）排列
- 已获得：显示道具名 + 节气名 + 获得日期，高亮样式
- 未获得：显示节气名 + 道具轮廓，灰色样式
- 顶部显示收集进度（如 "已收集 8/24"）
- 全部集齐时显示成就提示「通晓天时」

### 4.4 签到结果展示

当 `checkinResult.majorTerm` 不为 null 时，在签到结果中额外展示：
- 重大节气名称
- 额外灵石数量（如 "+5 灵石（冬至特别奖励）"）
- 养生提示（healthTip + source）

---

## 五、API 变更清单

### 5.1 修改：GET /api/character

响应新增字段：

```json
{
  "character": {},
  "currentSolarTerm": {
    "id": "liqiu",
    "name": "立秋",
    "theme": "秋收启智，硕果累累",
    "flavor": "金风送爽，天地间灵气随之收敛...",
    "poem": "自古逢秋悲寂寥，我言秋日胜春朝。",
    "attributes": ["comprehension"],
    "target_categories": ["学习"],
    "effect": {
      "type": "quality_boost",
      "liang_rate_bonus": 0.15
    },
    "limited_item_name": "金秋悟道露",
    "startDate": "2026-08-07",
    "daysLeft": 8,
    "major_term": {
      "level": 2,
      "label": "四立",
      "extra_stones": 3,
      "health_tip": "秋三月，此谓容平...",
      "source": "《素问·四气调神大论》"
    }
  }
}
```

`currentSolarTerm` 为 null 表示不在任何节气期间（理论上不会出现）。`major_term` 为 null 表示非重大节气。

### 5.2 修改：POST /api/behavior

响应新增字段：

```json
{
  "behavior": {},
  "item": {
    "id": 123,
    "name": "金秋悟道露",
    "quality": "良品",
    "attribute_type": "comprehension",
    "temp_value": 1.5,
    "description": "",
    "isLimitedItem": true
  },
  "solarTerm": {
    "name": "立秋",
    "theme": "秋收启智，硕果累累"
  }
}
```

`item.isLimitedItem`：布尔值，true 表示获得了节气限定道具，前端可据此展示特殊动画/提示。
`solarTerm`：当前节气简要信息，null 表示不在节气期间。

### 5.3 修改：POST /api/behavior（签到结果部分）

`checkinResult` 新增字段：

```json
{
  "checkinResult": {
    "alreadyCheckedIn": false,
    "streak": 7,
    "reward": 7,
    "baseReward": 2,
    "totalStones": 42,
    "majorTerm": {
      "termName": "冬至",
      "extraStones": 5,
      "healthTip": "冬至一阳生，宜早卧晚起，养藏阳气...",
      "source": "《素问·四气调神大论》"
    }
  }
}
```

`baseReward`：连续签到基础灵石。`reward`：总灵石（基础 + 节气额外）。`majorTerm`：重大节气信息，null 表示非重大节气当天。

### 5.4 新增：GET /api/character/solar-collection

获取用户的节气图鉴收集状态。

请求：
```
GET /api/character/solar-collection
Authorization: Bearer <token>
```

响应：
```json
{
  "total": 24,
  "collected": 8,
  "items": [
    {
      "term_id": "xiaohan",
      "term_name": "小寒",
      "order": 1,
      "item_name": "寒铁淬体丸",
      "obtained": true,
      "obtained_at": "2026-01-06T10:30:00"
    },
    {
      "term_id": "dahan",
      "term_name": "大寒",
      "order": 2,
      "item_name": "玄冬凝神散",
      "obtained": false,
      "obtained_at": null
    }
  ]
}
```

后端实现（在 character.js 中新增路由）：

```js
router.get('/solar-collection', (req, res) => {
  const collected = db.prepare(
    'SELECT term_id, item_name, obtained_at FROM solar_term_collection WHERE user_id = ?'
  ).all(req.user.id);

  const collectedMap = {};
  for (const row of collected) {
    collectedMap[row.term_id] = row;
  }

  const items = definitions.map(def => ({
    term_id: def.id,
    term_name: def.name,
    order: def.order,
    item_name: def.limited_item.name,
    obtained: !!collectedMap[def.id],
    obtained_at: collectedMap[def.id]?.obtained_at || null,
  }));

  res.json({
    total: definitions.length,
    collected: collected.length,
    items,
  });
});
```

---

## 六、测试要点

### 6.1 solarTerm.js 单元测试

| 测试场景 | 预期结果 |
|---------|---------|
| 传入 2026-08-07，应返回立秋 | `getCurrentSolarTerm('2026-08-07').id === 'liqiu'` |
| 传入 2026-08-22（立秋最后一天），应仍返回立秋 | `getCurrentSolarTerm('2026-08-22').id === 'liqiu'` |
| 传入 2026-08-23，应返回处暑 | `getCurrentSolarTerm('2026-08-23').id === 'chushu'` |
| 传入 2026-01-01（小寒之前），应返回上一年冬至 | `getCurrentSolarTerm('2026-01-01').id === 'dongzhi'` |
| 传入 2026-12-22（冬至当天），应返回冬至 | `getCurrentSolarTerm('2026-12-22').id === 'dongzhi'` |
| `getEffect('学习', liqiuTerm)` 应返回 liangRateBonus=0.15 | 立秋关联学习类 |
| `getEffect('身体健康', liqiuTerm)` 应返回 liangRateBonus=0 | 立秋不关联身体健康 |
| `getEffect('身体健康', dongzhiTerm)` 应返回 liangRateBonus=0.15 | 冬至关联全属性 |
| `isMajorTerm(dongzhiTerm, '2026-12-22')` 应返回 extraStones=5 | 冬至当天 |
| `isMajorTerm(dongzhiTerm, '2026-12-23')` 应返回 extraStones=0 | 冬至非当天 |

### 6.2 itemGen.js 单元测试

| 测试场景 | 预期结果 |
|---------|---------|
| `determineQuality('学习', null, 0, 0.15)` 多次调用 | 良品率约 35%（基础 20% + 节气 15%） |
| `determineQuality('身体健康', '高强度', 0.10, 0.15)` | 良品率约 65%（40% + 10% + 15%） |
| `determineQuality('学习', null, 0.10, 0.15)` | 良品率约 45%（20% + 10% + 15%） |
| 良品率上限测试：所有加成叠满不超过 95% | `goodRate = Math.min(goodRate, 0.95)` |
| `generateItem('学习', '良品', { name: '金秋悟道露', replace_probability: 1.0 })` | 必定返回限定道具名 |
| `generateItem('学习', '良品', { name: '金秋悟道露', replace_probability: 0 })` | 必定返回普通道具名 |
| `generateItem('学习', '良品', null)` | 向后兼容，返回普通道具 |

### 6.3 集成测试

| 测试场景 | 预期结果 |
|---------|---------|
| 在立秋期间上报学习类行为 | 良品率提升，有概率获得「金秋悟道露」 |
| 在立秋期间上报身体健康类行为 | 良品率不变，不会获得限定道具 |
| 冬至期间上报任意类别行为 | 所有类别良品率 +15%，有概率获得「天地归元丹」 |
| 冬至当天首次签到 | 灵石 = 连续签到基础 + 5（冬至额外），返回养生提示 |
| 冬至当天重复签到 | 返回 alreadyCheckedIn=true，不重复发放 |
| 立春当天签到 | 灵石 = 连续签到基础 + 3（四立额外） |
| 普通节气当天签到 | 灵石 = 连续签到基础，无额外奖励 |
| 首次获得限定道具 | solar_term_collection 写入记录 |
| 重复获得同一节气限定道具 | solar_term_collection 不重复写入（INSERT OR IGNORE） |
| GET /api/character 返回 currentSolarTerm | 包含完整节气信息 |
| GET /api/character/solar-collection | 返回 24 格图鉴，已获得的标记 obtained=true |

### 6.4 边界场景

| 场景 | 处理方式 |
|------|---------|
| calendar 中没有当年数据（2031年） | `getCurrentSolarTerm` 返回 null，所有节气效果不生效，不影响正常功能 |
| 跨年节气（12月冬至持续到1月小寒前） | 通过相邻年份 calendar 合并排序解决 |
| 服务器时区非 UTC+8 | `toUTC8DateStr` 统一转换为 UTC+8 日期 |
| 多属性节气（春分关联灵巧+神识） | `target_categories` 为数组，`getEffect` 用 `includes` 判断 |

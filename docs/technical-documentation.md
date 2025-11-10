# InfoBattle 技术速览

## 1. 架构
- 前端：React 18 + Vite + TailwindCSS（`pnpm run dev`）。
- 后端：Express + better-sqlite3（`pnpm run dev:server`）。
- 数据库：`server/data/infobattle.sqlite3`，启动时自动建表并写入 3 个脚本场景。

## 2. 数据模型
- `players`：学号、姓名、各角色轮次统计、最近登录。
- `scenarios`：场景名称、背景、钓鱼/官方任务和风险提示。
- `rounds`：回合序号、场景、状态(`drafting/judging/retro/completed`)、角色分配、所用模板、挑战卡(`challenge_card_id`)、时间戳。
- `round_participants`：记录每人本轮身份（钓鱼大师/城市领袖/市民）。
- `messages`：邮件主题、纯文本、HTML、发件人别名、Reply-To、附件占位、分发策略（广播/群组/定向名单）。
- `judgements`：市民针对具体邮件的可信/存疑及理由。
- `email_templates`：模板库（场景 + 角色 + HTML 内容 + 难度/关键词）。

## 3. API 入口（http://localhost:5678/api）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 存活检测 |
| GET | `/players` | 列出玩家与排行榜 |
| POST | `/players/bulk` | 批量导入 `{"players":[{studentId,name}]}`（自动跳过学号后四位为 `0000` 的记录） |
| GET | `/rounds` | 最近回合列表（场景、状态、时间戳） |
| GET | `/rounds/current` | 当前回合（含场景、参赛者、邮件、判断） |
| GET | `/rounds/:id/report` | 指定回合的场景配置 + 邮件 + 判断 + 时间线（后台查看使用） |
| GET | `/rounds/:id/export` | 与上相同，但返回值带 `Content-Disposition`，便于直接下载 JSON 档案 |
| POST | `/rounds/start` | 开启新回合，上一轮未完成返回 409 |
| POST | `/rounds/:id/phase` | 切换阶段（校验草稿/判断/顺序） |
| GET | `/templates` | 查询邮件模板（支持 `scenarioId`/`role` 过滤） |
| GET | `/challenges` | 查询挑战卡列表（每张卡包含摘要、压测规则及三类角色提示） |
| POST | `/assistant` | 代理调用 Ollama `qwen3:latest`，根据角色/回合上下文返回 HTML 建议 |
| POST | `/messages` | 钓鱼大师/城市领袖提交邮件，仅 `drafting` 可写 |
| GET | `/mailbox?roundId=&playerId=` | 市民邮箱（仅返回其可见邮件 + 个人判断） |
| POST | `/judgements` | 市民判断，仅 `judging/retro` 可写 |
| GET | `/statistics` | 汇总积分 + 角色覆盖率 + 当前回合号 |
| GET | `/analytics` | 高级统计（场景表现、分发策略、判断准确率） |
| POST | `/admin/reset` | 一键清空玩家/回合/日志，保留场景与模板 |

## 4. 高级统计与回合报告
- **/analytics**：返回 `{ scenarioStats, messageStats, judgementStats }`。  
  - `scenarioStats`：每个场景的累计回合数、上次使用时间、平均判断量、官方可信率、钓鱼识别率。  
  - `messageStats`：邮件总数、图文邮件数、别名使用数、附件次数、分发策略分布。  
  - `judgementStats`：判断总数、可信/存疑数量、填写理由次数、官方可信率、钓鱼识别率。
- **/rounds/:id/report**：返回结构 `{ generated_at, round, metrics, scenarioConfig, timeline }`：  
  - `round`：与 `/rounds/current` 相同的数据结构。  
  - `metrics`：该回合的邮件数、判断数、官方可信率、钓鱼识别率、理由填写率。  
  - `scenarioConfig`：场景背景/任务、角色分配、邮件配置（别名、分发策略、附件）。  
  - `timeline`：事件序列（回合开始、角色分配、邮件提交、判断、结束）用于主持人查看或导出。
- **/rounds/:id/export**：与 `report` 内容一致，但携带下载 Header，可直接保存 JSON 档案。后台还提供“导出情景配置”“导出流程日志”“完整报告”三个按钮，分别对应 `scenarioConfig`、`timeline` 与 `/rounds/:id/export`。
- **/admin/reset**：主持人 UI 中的“重置数据库”即调用此接口，删除玩家/回合/邮件/判断，再次导入即可重新开局。
- **挑战卡**：`challengeCards` 为本地配置列表，通过 `/challenges` 提供给前端；开启回合时可指定 `challengeCardId`（否则随机），`rounds.challenge_card_id` 与 `round.challenge_card` 将被携带至所有回合数据、报告与复盘界面。

## 5. 状态机规则
- `drafting` → `judging`：必须两封邮件都已提交。
- `judging` → `retro`：至少收到一条判断。
- `retro` / `judging` → `completed`：自动记录 `finished_at`。
- 未完成的回合无法再次 `start`。
- `messages`/`judgements` 在非法阶段写入会返回 409。

## 6. 前端路由
| 路径 | 说明 |
|------|------|
| `/` | 登录入口 + 实时战况（排行榜、最新场景） |
| `/admin` | 主持人控制台：导入玩家、选场景、阶段控制、排行榜 |
| `/phisher` | 钓鱼大师面板：模板库、富文本/HTML 邮件、附件占位、收件人策略、判断反馈 |
| `/leader` | 城市领袖面板：同上，强调法规引用与官方别名 |
| `/citizen` | 市民面板：仿邮箱界面、HTML 渲染、原文查看、逐封判断、排行榜 |

## 7. 本地运行
```bash
pnpm install
pnpm run dev:server   # 启动 API（SQLite 自动创建）
pnpm run dev          # 启动前端
```

## 8. 实战验证
- 角色轮换：得分、覆盖率、阶段守卫均在 API 测试中验证。
- 典型流程：导入玩家 → 开局 → 角色提交草稿 → 市民判断 → 复盘 → 归档 → 下一轮。

## 9. 资产与风格指南（图像占位）
- 目录：`public/assets/info-battle/<模块>/<文件名>.webp`，例如 `public/assets/info-battle/scenarios/health-subsidy/intro.webp`。
- 建议尺寸：Hero 图 1920×1080；场景/角色图 1200×900；卡片图 1024×768。
- 风格关键词：*Cyberpunk city, neon control room, Chinese signage, security briefing*。
- 生成后在 README/使用文档中注明 “由 Qwen-Image 生成，仅用于教学演示”。

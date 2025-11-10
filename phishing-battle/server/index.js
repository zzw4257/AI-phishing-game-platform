import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.join(__dirname, 'data')
const dbPath = path.join(dataDir, 'infobattle.sqlite3')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 5678

const scenarios = [
  {
    id: 'health-subsidy',
    name: '赛博城健康图谱研究',
    background:
      '赛博城大学开展全民健康研究，提交体检报告与基因检测数据即可获得500元补贴，需通过官方渠道收集数据。',
    cityLeaderTask:
      '以城市领袖身份，发布一封正式通知，解释研究目标、数据用途、收集方式和合规依据，让市民安心提交真实信息。',
    phisherTask:
      '伪装城市领袖或科研机构，诱导市民通过虚假链接上传敏感基因数据并缴纳“加急费”或上传银行卡信息。',
    riskHints:
      '留意要求一次性上传完整基因/财务信息、带有压迫性时间限制的字眼，以及非.gov.cn域名。'
  },
  {
    id: 'facial-database',
    name: '智慧城市人脸库建设',
    background:
      '赛博城推进公共安防系统升级，要求居民提交人脸信息建立智慧城市人脸库，官方强调仅用于安全用途。',
    cityLeaderTask:
      '以官方身份说明采集流程、数据脱敏方式和法律依据，强调提交渠道与隐私保护，安抚市民顾虑。',
    phisherTask:
      '假借安防项目名义收集人脸数据和家庭住址，附带攻击性链接或二维码，引导受害者下载木马会或缴纳“审核费用”。',
    riskHints:
      '警惕要求转账/扫码、域名与官方不符、过度索要家庭信息、承诺额外现金奖励等信号。'
  },
  {
    id: 'epidemic-tracing',
    name: '疫情密接者流调通知',
    background:
      '赛博城爆发新型病毒，需要24小时内追踪密接者并补录行程信息。',
    cityLeaderTask:
      '引用《公共卫生应急条例》第12条，要求市民通过官方链接上报7日行程，提醒隐私加密与红码后果。',
    phisherTask:
      '伪造“赛博城官方”短信，宣称补录行程前1万名奖励话费，诱导市民在钓鱼页面填写身份证与银行卡。',
    riskHints:
      '官方流程不会给现金奖励，注意链接是否采用.gov.cn域名以及是否索要与流调无关的支付信息。'
  }
]

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  const exists = columns.some((col) => col.name === column)
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      student_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login TEXT,
      rounds_as_phisher INTEGER DEFAULT 0,
      rounds_as_leader INTEGER DEFAULT 0,
      rounds_as_citizen INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      background TEXT,
      city_leader_task TEXT,
      phisher_task TEXT,
      risk_hints TEXT
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      round_number INTEGER NOT NULL,
      scenario_id TEXT NOT NULL,
      status TEXT NOT NULL,
      phisher_id TEXT,
      leader_id TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      template_bundle TEXT,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
      FOREIGN KEY (phisher_id) REFERENCES players(id) ON DELETE SET NULL,
      FOREIGN KEY (leader_id) REFERENCES players(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS round_participants (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      role TEXT NOT NULL,
      UNIQUE(round_id, player_id),
      FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      role TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      content_html TEXT,
      from_alias TEXT,
      reply_to TEXT,
      distribution_type TEXT DEFAULT 'broadcast',
      recipient_ids TEXT,
      attachments TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(round_id, role),
      FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS judgements (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      verdict TEXT NOT NULL,
      reasoning TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, player_id),
      FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );
  `)

  ensureColumn('rounds', 'template_bundle', 'TEXT')
  ensureColumn('messages', 'content_html', 'TEXT')
  ensureColumn('messages', 'from_alias', 'TEXT')
  ensureColumn('messages', 'reply_to', 'TEXT')
  ensureColumn('messages', 'distribution_type', "TEXT DEFAULT 'broadcast'")
  ensureColumn('messages', 'recipient_ids', 'TEXT')
  ensureColumn('messages', 'attachments', 'TEXT')

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      role TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      content_html TEXT NOT NULL,
      difficulty TEXT,
      keywords TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
    );
  `)
}

function seedScenarios() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM scenarios')
  const count = stmt.get().count
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO scenarios (id, name, background, city_leader_task, phisher_task, risk_hints)
      VALUES (@id, @name, @background, @cityLeaderTask, @phisherTask, @riskHints)
    `)
    const tx = db.transaction((items) => {
      items.forEach((scenario) => insert.run(scenario))
    })
    tx(scenarios)
  }
}

const templateSeeds = [
  {
    id: 'health-official-brief',
    scenario_id: 'health-subsidy',
    role: 'leader',
    title: '官方补贴说明',
    subject: '【赛博城卫健委】健康图谱数据补贴指引',
    content_html: `<p>尊敬的市民：</p>
<p>为落实《公共卫生应急条例》第 12 条，赛博城卫健委现启动健康图谱专项补贴。请在 <strong>https://gov.cyber/health-map</strong> 内完成资料补录。</p>
<ol>
  <li>仅通过官方域名提交，勿转发第三方链接。</li>
  <li>上传体检报告和基因检测编号即可完成审核，全程不收取任何费用。</li>
  <li>如有疑问，请拨打 12345 或联系 report@saibo.gov.cn。</li>
</ol>
<p>赛博城卫健委</p>`,
    difficulty: 'normal',
    keywords: '官方, 补贴, gov 域名'
  },
  {
    id: 'health-phish-fastcash',
    scenario_id: 'health-subsidy',
    role: 'phisher',
    title: '加急补贴诈骗',
    subject: '紧急：补贴额度即将失效，请立即缴纳加急费',
    content_html: `<p>赛博城大学提醒：您的 500 元健康图谱补贴即将失效，需在 30 分钟内提交资料。</p>
<p>为了加快审核，请通过 <a href="http://health-fastbonus.com">health-fastbonus.com</a> 上传以下信息：</p>
<ul>
  <li>身份证号 &amp; 银行卡后八位</li>
  <li>基因检测原始数据（ZIP）</li>
  <li>加急手续费 200 元（支持转账/二维码）</li>
</ul>
<p>前 100 名成功提交者额外奖励 188 元话费。</p>`,
    difficulty: 'hard',
    keywords: '加急费, 非官方域名, 奖励'
  },
  {
    id: 'trace-official-alert',
    scenario_id: 'epidemic-tracing',
    role: 'leader',
    title: '流调官方播报',
    subject: '【赛博城疾控】24 小时行程补录提醒',
    content_html: `<p>您好，依据《公共卫生应急条例》第 12 条，请在 24 小时内登录 <strong>https://health.saibo.gov.cn/trace</strong> 补录近 7 日行程。</p>
<p>官方渠道不会索要验证码/红包，如收到奖励信息请立即举报。</p>`,
    difficulty: 'normal',
    keywords: '流调, gov 域名, 举报邮箱'
  },
  {
    id: 'trace-phish-reward',
    scenario_id: 'epidemic-tracing',
    role: 'phisher',
    title: '话费奖励诱导',
    subject: '赛博城流调抽奖：补录即可领取 100 元话费',
    content_html: `<p>赛博城疾控紧急通知：为感谢配合疫情防控，前 1 万名补录行程的市民将获得 <strong>100 元话费</strong>。</p>
<p>立即访问 <a href="http://trace.saiboreward.com">trace.saiboreward.com</a> 补录行程，并上传支付截图以便发放奖励。</p>`,
    difficulty: 'medium',
    keywords: '奖励, 第三方域名, 上传支付截图'
  },
  {
    id: 'face-official-brief',
    scenario_id: 'facial-database',
    role: 'leader',
    title: '人脸库建设说明',
    subject: '【公安安防】智慧人脸库采集须知',
    content_html: `<p>赛博城公安局正开展公共安防升级。请通过 <strong>https://secure.saibo.gov.cn/face</strong> 上传人脸数据，系统自动脱敏。</p>
<p>参与渠道仅限公安门户及指定线下窗口，任何扫码领奖信息均为诈骗。</p>`,
    difficulty: 'normal',
    keywords: '公安, 脱敏, gov 域名'
  },
  {
    id: 'face-phish-scan',
    scenario_id: 'facial-database',
    role: 'phisher',
    title: '扫码领奖钓鱼',
    subject: '智慧城市摄像头升级，扫码登记领 300 元',
    content_html: `<p>赛博城智慧安防项目现向重点小区发放 300 元补贴。请扫描下方二维码，上传人脸照片和家庭住址，完成后 24 小时内到账。</p>
<p><em>二维码：{{attachment: qrcode.png}}</em></p>`,
    difficulty: 'hard',
    keywords: '扫码, 家庭住址, 现金补贴'
  }
]

function seedTemplates() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM email_templates')
  const count = stmt.get().count
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO email_templates (id, scenario_id, role, title, subject, content_html, difficulty, keywords)
      VALUES (@id, @scenario_id, @role, @title, @subject, @content_html, @difficulty, @keywords)
    `)
    const tx = db.transaction((items) => items.forEach((tpl) => insert.run(tpl)))
    tx(templateSeeds)
  }
}

function listPlayers() {
  return db.prepare('SELECT * FROM players ORDER BY created_at ASC').all()
}

function getScenarioById(id) {
  return db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id)
}

function getLatestRoundRow() {
  return db.prepare('SELECT * FROM rounds ORDER BY round_number DESC LIMIT 1').get()
}

function getRoundById(id) {
  const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(id)
  if (!round) return null
  return hydrateRound(round)
}

function hydrateRound(roundRow) {
  if (!roundRow) return null
  const scenario = getScenarioById(roundRow.scenario_id)
  const participants = db.prepare(`
    SELECT rp.*, p.name, p.student_id
    FROM round_participants rp
    JOIN players p ON p.id = rp.player_id
    WHERE rp.round_id = ?
    ORDER BY rp.role DESC, p.created_at ASC
  `).all(roundRow.id)
  const messagesRaw = db.prepare(`
    SELECT m.*, p.name, p.student_id
    FROM messages m
    JOIN players p ON p.id = m.author_id
    WHERE m.round_id = ?
    ORDER BY m.created_at ASC
  `).all(roundRow.id)
  const messages = messagesRaw.map((msg) => ({
    ...msg,
    attachments: msg.attachments ? JSON.parse(msg.attachments) : [],
    recipient_descriptor: msg.recipient_ids ? JSON.parse(msg.recipient_ids) : { roles: [], playerIds: [] }
  }))
  const judgements = db.prepare(`
    SELECT j.*, p.name, p.student_id, m.role as message_role
    FROM judgements j
    JOIN players p ON p.id = j.player_id
    JOIN messages m ON m.id = j.message_id
    WHERE j.round_id = ?
    ORDER BY j.created_at ASC
  `).all(roundRow.id)
  return { ...roundRow, scenario, participants, messages, judgements }
}

function computeScoreboard() {
  const players = listPlayers()
  const authorPoints = db.prepare(`
    SELECT m.author_id as player_id,
           SUM(CASE WHEN m.role = 'leader' AND j.verdict = 'trust' THEN 2
                    WHEN m.role = 'phisher' AND j.verdict = 'trust' THEN 2
                    ELSE 0 END) as points
    FROM messages m
    LEFT JOIN judgements j ON j.message_id = m.id
    GROUP BY m.author_id
  `).all()
  const authorMap = new Map(authorPoints.map((row) => [row.player_id, row.points || 0]))

  const citizenPoints = db.prepare(`
    SELECT j.player_id,
           SUM(CASE WHEN m.role = 'leader' AND j.verdict = 'trust' THEN 1
                    WHEN m.role = 'phisher' AND j.verdict = 'suspect' THEN 1
                    ELSE 0 END) as points
    FROM judgements j
    JOIN messages m ON m.id = j.message_id
    GROUP BY j.player_id
  `).all()
  const citizenMap = new Map(citizenPoints.map((row) => [row.player_id, row.points || 0]))

  return players.map((player) => ({
    ...player,
    points: (authorMap.get(player.id) || 0) + (citizenMap.get(player.id) || 0)
  }))
}

function roleLabel(role) {
  switch (role) {
    case 'phisher':
      return '钓鱼大师'
    case 'leader':
      return '城市领袖'
    default:
      return '普通市民'
  }
}

function buildRoundTimeline(round) {
  const timeline = []
  if (round.started_at) {
    timeline.push({
      id: `round-${round.id}-start`,
      type: 'round_started',
      timestamp: round.started_at,
      summary: `第 ${round.round_number} 回合开启`,
      details: {
        scenario: round.scenario.name,
        background: round.scenario.background
      }
    })
  }

  round.participants.forEach((participant) => {
    timeline.push({
      id: `participant-${participant.id}`,
      type: 'role_assigned',
      timestamp: round.started_at,
      summary: `${participant.name} 被分配为 ${roleLabel(participant.role)}`,
      details: {
        player: participant.name,
        role: participant.role,
        student_id: participant.student_id
      }
    })
  })

  round.messages.forEach((message) => {
    timeline.push({
      id: `message-${message.id}`,
      type: 'message_submitted',
      timestamp: message.created_at,
      summary: `${message.name} 提交了${message.role === 'leader' ? '官方通知' : '钓鱼邮件'}`,
      details: {
        role: message.role,
        subject: message.subject,
        distributionType: message.distribution_type || 'broadcast',
        recipients: message.recipient_descriptor,
        attachments: (message.attachments || []).length
      }
    })
  })

  round.judgements.forEach((judgement) => {
    timeline.push({
      id: `judgement-${judgement.id}`,
      type: 'judgement_submitted',
      timestamp: judgement.created_at,
      summary: `${judgement.name} 将 ${judgement.message_role === 'leader' ? '官方通知' : '钓鱼邮件'} 判为 ${
        judgement.verdict === 'trust' ? '可信' : '存疑'
      }`,
      details: {
        player: judgement.name,
        verdict: judgement.verdict,
        messageRole: judgement.message_role,
        reasoning: judgement.reasoning
      }
    })
  })

  if (round.finished_at) {
    timeline.push({
      id: `round-${round.id}-end`,
      type: 'round_completed',
      timestamp: round.finished_at,
      summary: `第 ${round.round_number} 回合已结束`,
      details: {
        status: round.status
      }
    })
  }

  return timeline.sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
    return timeA - timeB
  })
}

function buildRoundMetrics(round) {
  const totalMessages = round.messages.length
  const totalJudgements = round.judgements.length
  const leaderJudgements = round.judgements.filter((j) => j.message_role === 'leader')
  const phisherJudgements = round.judgements.filter((j) => j.message_role === 'phisher')

  const leaderTrust = leaderJudgements.filter((j) => j.verdict === 'trust').length
  const phisherCaught = phisherJudgements.filter((j) => j.verdict === 'suspect').length

  return {
    totalMessages,
    totalJudgements,
    leaderTrustRate: leaderJudgements.length ? leaderTrust / leaderJudgements.length : null,
    phisherCatchRate: phisherJudgements.length ? phisherCaught / phisherJudgements.length : null,
    reasoningCoverage: totalJudgements
      ? round.judgements.filter((j) => j.reasoning && j.reasoning.trim().length > 0).length / totalJudgements
      : null
  }
}

function buildRoundScenarioConfig(round) {
  return {
    round_number: round.round_number,
    scenario_id: round.scenario.id,
    scenario_name: round.scenario.name,
    objectives: {
      leader: round.scenario.city_leader_task,
      phisher: round.scenario.phisher_task,
      risk_hints: round.scenario.risk_hints
    },
    participants: round.participants.map((p) => ({
      id: p.player_id,
      name: p.name,
      student_id: p.student_id,
      role: p.role
    })),
    messages: round.messages.map((message) => ({
      id: message.id,
      role: message.role,
      subject: message.subject,
      from_alias: message.from_alias,
      reply_to: message.reply_to,
      distribution_type: message.distribution_type || 'broadcast',
      recipients: message.recipient_descriptor || parseRecipientDescriptor(message.recipient_ids),
      attachments: message.attachments || [],
      created_at: message.created_at
    }))
  }
}

function buildRoundReport(round) {
  return {
    generated_at: new Date().toISOString(),
    round,
    timeline: buildRoundTimeline(round),
    metrics: buildRoundMetrics(round),
    scenarioConfig: buildRoundScenarioConfig(round)
  }
}

function computeAdvancedAnalytics() {
  const scenarioRows = db.prepare('SELECT id, name FROM scenarios ORDER BY name ASC').all()
  const statsMap = new Map(
    scenarioRows.map((row) => [
      row.id,
      {
        scenarioId: row.id,
        scenarioName: row.name,
        roundsPlayed: 0,
        lastPlayedAt: null,
        totalJudgements: 0,
        leaderTrustVotes: 0,
        leaderTotal: 0,
        phisherCaughtVotes: 0,
        phisherTotal: 0
      }
    ])
  )

  const roundRows = db
    .prepare(
      `
    SELECT r.id, r.round_number, r.scenario_id, r.started_at, r.finished_at
    FROM rounds r
  `
    )
    .all()

  roundRows.forEach((row) => {
    const entry = statsMap.get(row.scenario_id)
    if (entry) {
      entry.roundsPlayed += 1
      const lastTime = entry.lastPlayedAt ? new Date(entry.lastPlayedAt).getTime() : 0
      const currentTime = new Date(row.finished_at || row.started_at || new Date().toISOString()).getTime()
      if (currentTime > lastTime) {
        entry.lastPlayedAt = row.finished_at || row.started_at
      }
    }
  })

  const scenarioJudgements = db
    .prepare(
      `
    SELECT r.scenario_id as scenario_id, m.role as role, j.verdict as verdict, COUNT(*) as count
    FROM judgements j
    JOIN messages m ON m.id = j.message_id
    JOIN rounds r ON r.id = j.round_id
    GROUP BY r.scenario_id, m.role, j.verdict
  `
    )
    .all()

  scenarioJudgements.forEach((row) => {
    const entry = statsMap.get(row.scenario_id)
    if (!entry) return
    entry.totalJudgements += row.count
    if (row.role === 'leader') {
      entry.leaderTotal += row.count
      if (row.verdict === 'trust') {
        entry.leaderTrustVotes += row.count
      }
    } else if (row.role === 'phisher') {
      entry.phisherTotal += row.count
      if (row.verdict === 'suspect') {
        entry.phisherCaughtVotes += row.count
      }
    }
  })

  const scenarioStats = Array.from(statsMap.values()).map((entry) => ({
    scenarioId: entry.scenarioId,
    scenarioName: entry.scenarioName,
    roundsPlayed: entry.roundsPlayed,
    lastPlayedAt: entry.lastPlayedAt,
    avgJudgementsPerRound:
      entry.roundsPlayed > 0 ? Number((entry.totalJudgements / entry.roundsPlayed).toFixed(2)) : 0,
    leaderTrustRate:
      entry.leaderTotal > 0 ? Number(((entry.leaderTrustVotes / entry.leaderTotal) * 100).toFixed(1)) : null,
    phisherCatchRate:
      entry.phisherTotal > 0 ? Number(((entry.phisherCaughtVotes / entry.phisherTotal) * 100).toFixed(1)) : null
  }))

  const messageRows = db
    .prepare(
      `
    SELECT distribution_type, content_html, from_alias, attachments
    FROM messages
  `
    )
    .all()
  const totalMessages = messageRows.length
  const distributionBreakdown = { broadcast: 0, groups: 0, direct: 0 }
  let richHtmlMessages = 0
  let aliasMessages = 0
  let attachmentCount = 0
  messageRows.forEach((row) => {
    const key = row.distribution_type || 'broadcast'
    distributionBreakdown[key] = (distributionBreakdown[key] || 0) + 1
    if (row.content_html && row.content_html.trim().length > 0) {
      richHtmlMessages += 1
    }
    if (row.from_alias && row.from_alias.trim().length > 0) {
      aliasMessages += 1
    }
    if (row.attachments) {
      try {
        const parsed = JSON.parse(row.attachments)
        if (Array.isArray(parsed)) {
          attachmentCount += parsed.length
        }
      } catch (_) {
        // ignore malformed JSON
      }
    }
  })

  const judgementRows = db
    .prepare(
      `
    SELECT j.verdict, j.reasoning, m.role
    FROM judgements j
    JOIN messages m ON m.id = j.message_id
  `
    )
    .all()
  const totalJudgements = judgementRows.length
  const trustCount = judgementRows.filter((row) => row.verdict === 'trust').length
  const suspectCount = totalJudgements - trustCount
  const reasoningCount = judgementRows.filter((row) => row.reasoning && row.reasoning.trim().length > 0).length
  const leaderJudgements = judgementRows.filter((row) => row.role === 'leader')
  const phisherJudgements = judgementRows.filter((row) => row.role === 'phisher')
  const leaderTrusts = leaderJudgements.filter((row) => row.verdict === 'trust').length
  const phisherSuspects = phisherJudgements.filter((row) => row.verdict === 'suspect').length

  return {
    scenarioStats,
    messageStats: {
      totalMessages,
      richHtmlMessages,
      aliasMessages,
      attachmentCount,
      distributionBreakdown
    },
    judgementStats: {
      totalJudgements,
      trustCount,
      suspectCount,
      reasoningCount,
      leaderTrustRate:
        leaderJudgements.length > 0 ? Number(((leaderTrusts / leaderJudgements.length) * 100).toFixed(1)) : null,
      phisherDetectionRate:
        phisherJudgements.length > 0 ? Number(((phisherSuspects / phisherJudgements.length) * 100).toFixed(1)) : null
    }
  }
}

function parseRecipientDescriptor(text) {
  if (!text) return { roles: [], playerIds: [] }
  try {
    const parsed = JSON.parse(text)
    return {
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
      playerIds: Array.isArray(parsed.playerIds) ? parsed.playerIds : []
    }
  } catch (_) {
    return { roles: [], playerIds: [] }
  }
}

function serializeRecipientDescriptor(descriptor) {
  if (!descriptor) return null
  const roles = Array.isArray(descriptor.roles) ? descriptor.roles : []
  const playerIds = Array.isArray(descriptor.playerIds) ? descriptor.playerIds : []
  if (roles.length === 0 && playerIds.length === 0) {
    return null
  }
  return JSON.stringify({ roles, playerIds })
}

function canMessageReachParticipant(message, participant) {
  if (!message.distribution_type || message.distribution_type === 'broadcast') {
    return true
  }
  const descriptor = message.recipient_descriptor || parseRecipientDescriptor(message.recipient_ids)
  if (descriptor.playerIds?.includes(participant.player_id)) {
    return true
  }
  if (descriptor.roles?.includes(participant.role)) {
    return true
  }
  return false
}

migrate()
seedScenarios()
seedTemplates()

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/scenarios', (_req, res) => {
  const rows = db.prepare('SELECT * FROM scenarios ORDER BY name ASC').all()
  res.json({ scenarios: rows })
})

app.get('/api/templates', (req, res) => {
  const { scenarioId, role } = req.query
  let query = 'SELECT * FROM email_templates WHERE 1=1'
  const params = []
  if (scenarioId) {
    query += ' AND scenario_id = ?'
    params.push(scenarioId)
  }
  if (role) {
    query += ' AND role = ?'
    params.push(role)
  }
  query += ' ORDER BY created_at ASC'
  const templates = db.prepare(query).all(...params)
  res.json({ templates })
})

app.get('/api/players', (_req, res) => {
  res.json({ players: listPlayers(), scoreboard: computeScoreboard() })
})

app.post('/api/players/bulk', (req, res) => {
  const { players } = req.body || {}
  if (!Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: 'players array is required' })
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO players (id, student_id, name)
    VALUES (@id, @student_id, @name)
  `)

  const tx = db.transaction((items) => {
    return items.map((player) => {
      const trimmedId = String(player.studentId || player.student_id || '').trim()
      const trimmedName = String(player.name || '').trim() || trimmedId
      if (!trimmedId) {
        return { student_id: trimmedId, name: trimmedName, inserted: false, reason: '缺少学号' }
      }
      if (trimmedId.slice(-4) === '0000') {
        return { student_id: trimmedId, name: trimmedName, inserted: false, reason: '学号后四位 0000 已保留给管理员' }
      }
      const payload = { id: randomUUID(), student_id: trimmedId, name: trimmedName }
      const info = insert.run(payload)
      return {
        ...payload,
        inserted: info.changes === 1,
        reason: info.changes === 1 ? null : '学号已存在或重复导入'
      }
    })
  })

  const results = tx(players)
  res.json({ added: results, total: listPlayers().length })
})

app.get('/api/login', (req, res) => {
  const last4 = String(req.query.last4 || '').trim()
  if (!last4) {
    return res.status(400).json({ error: 'last4 query parameter is required' })
  }
  if (last4 === '0000') {
    return res.json({ role: 'admin' })
  }
  const row = db.prepare('SELECT * FROM players WHERE student_id LIKE ? ORDER BY created_at ASC LIMIT 1').get(`%${last4}`)
  if (!row) {
    return res.status(404).json({ error: '未找到匹配的玩家' })
  }
  db.prepare('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(row.id)

  const currentRound = getLatestRoundRow()
  let assignment = null
  if (currentRound) {
    assignment = db.prepare('SELECT role FROM round_participants WHERE round_id = ? AND player_id = ?').get(currentRound.id, row.id)
  }
  res.json({ player: row, assignment: assignment?.role || 'citizen' })
})

app.get('/api/rounds/current', (_req, res) => {
  const round = getLatestRoundRow()
  if (!round) {
    return res.json({ round: null })
  }
  res.json({ round: hydrateRound(round) })
})

app.post('/api/rounds/start', (req, res) => {
  const allPlayers = listPlayers()
  if (allPlayers.length < 3) {
    return res.status(400).json({ error: '至少需要3名玩家才能开始新回合' })
  }
  const lastRound = getLatestRoundRow()
  if (lastRound && lastRound.status !== 'completed') {
    return res.status(409).json({ error: '上一轮尚未结束，请先完成当前回合' })
  }
  const roundNumber = lastRound ? lastRound.round_number + 1 : 1

  // pick scenario
  const { scenarioId } = req.body || {}
  let scenario = scenarioId ? getScenarioById(scenarioId) : null
  if (!scenario) {
    scenario = db.prepare(`
      SELECT s.*
      FROM scenarios s
      LEFT JOIN (
        SELECT scenario_id, COUNT(*) as usage
        FROM rounds
        GROUP BY scenario_id
      ) r ON r.scenario_id = s.id
      ORDER BY IFNULL(r.usage, 0) ASC, RANDOM()
      LIMIT 1
    `).get()
  }
  if (!scenario) {
    return res.status(400).json({ error: '缺少场景配置' })
  }

  const pickPlayer = (column) => {
    const row = db.prepare(`
      SELECT * FROM players
      ORDER BY ${column} ASC, RANDOM()
      LIMIT 1
    `).get()
    return row
  }

  let phisher = pickPlayer('rounds_as_phisher')
  let leader = pickPlayer('rounds_as_leader')
  const maxRetries = 5
  let tries = 0
  while (phisher.id === leader.id && tries < maxRetries) {
    leader = pickPlayer('rounds_as_leader')
    tries += 1
  }
  if (phisher.id === leader.id) {
    // fallback: pick another player by random for leader
    const others = allPlayers.filter((p) => p.id !== phisher.id)
    leader = others[Math.floor(Math.random() * others.length)]
  }

  const roundId = randomUUID()
  const insertRound = db.prepare(`
    INSERT INTO rounds (id, round_number, scenario_id, status, phisher_id, leader_id)
    VALUES (?, ?, ?, 'drafting', ?, ?)
  `)

  const insertParticipant = db.prepare(`
    INSERT INTO round_participants (id, round_id, player_id, role)
    VALUES (?, ?, ?, ?)
  `)

  const updatePlayerColumn = (id, column) => {
    db.prepare(`UPDATE players SET ${column} = ${column} + 1 WHERE id = ?`).run(id)
  }

  const tx = db.transaction(() => {
    insertRound.run(roundId, roundNumber, scenario.id, phisher.id, leader.id)
    insertParticipant.run(randomUUID(), roundId, phisher.id, 'phisher')
    insertParticipant.run(randomUUID(), roundId, leader.id, 'leader')
    allPlayers
      .filter((p) => p.id !== phisher.id && p.id !== leader.id)
      .forEach((player) => {
        insertParticipant.run(randomUUID(), roundId, player.id, 'citizen')
        updatePlayerColumn(player.id, 'rounds_as_citizen')
      })
    updatePlayerColumn(phisher.id, 'rounds_as_phisher')
    updatePlayerColumn(leader.id, 'rounds_as_leader')
  })

  tx()
  const round = getRoundById(roundId)
  res.json({ round })
})

app.post('/api/rounds/:roundId/phase', (req, res) => {
  const { roundId } = req.params
  const { status } = req.body || {}
  const allowed = ['drafting', 'judging', 'retro', 'completed']
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: '非法状态' })
  }
  const round = getRoundById(roundId)
  if (!round) {
    return res.status(404).json({ error: '回合不存在' })
  }
  if (round.status === status) {
    return res.json({ round })
  }

  const transitions = {
    drafting: ['judging'],
    judging: ['retro', 'completed'],
    retro: ['completed'],
    completed: []
  }

  const nextOptions = transitions[round.status] || []
  if (!nextOptions.includes(status)) {
    return res.status(409).json({ error: `无法从 ${round.status} 切换到 ${status}` })
  }

  if (status === 'judging') {
    const requiredRoles = ['phisher', 'leader']
    const missing = requiredRoles.filter((role) => !round.messages.some((m) => m.role === role))
    if (missing.length > 0) {
      return res.status(400).json({ error: '钓鱼大师与城市领袖都需提交邮件后才能进入判断阶段' })
    }
  }

  if (status === 'retro' && round.judgements.length === 0) {
    return res.status(400).json({ error: '至少收到一条市民判断后才能进入复盘阶段' })
  }

  db.prepare("UPDATE rounds SET status = ?, finished_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE finished_at END WHERE id = ?")
    .run(status, status, roundId)
  res.json({ round: getRoundById(roundId) })
})

app.post('/api/messages', (req, res) => {
  const {
    roundId,
    authorId,
    subject,
    body,
    contentHtml,
    fromAlias,
    replyTo,
    distribution,
    attachments
  } = req.body || {}
  if (!roundId || !authorId || !subject || !body) {
    return res.status(400).json({ error: '缺少必要字段' })
  }
  const round = getRoundById(roundId)
  if (!round) {
    return res.status(404).json({ error: '回合不存在' })
  }
  if (round.status !== 'drafting') {
    return res.status(409).json({ error: '当前阶段已锁定，无法再编辑邮件' })
  }
  const participant = db
    .prepare('SELECT * FROM round_participants WHERE round_id = ? AND player_id = ?')
    .get(roundId, authorId)
  if (!participant || (participant.role !== 'phisher' && participant.role !== 'leader')) {
    return res.status(403).json({ error: '只有钓鱼大师或城市领袖可提交邮件' })
  }

  const distributionType = distribution?.type || 'broadcast'
  const normalizedDescriptor = {
    roles: Array.isArray(distribution?.roles) ? distribution.roles : [],
    playerIds: Array.isArray(distribution?.playerIds) ? distribution.playerIds : []
  }

  if (distributionType === 'direct' && normalizedDescriptor.playerIds.length === 0) {
    return res.status(400).json({ error: '请至少选择一个收件人' })
  }
  if (distributionType === 'groups' && normalizedDescriptor.roles.length === 0) {
    return res.status(400).json({ error: '请至少选择一个群体' })
  }

  // 校验目标玩家是否在本轮
  if (normalizedDescriptor.playerIds.length > 0) {
    const ids = new Set(normalizedDescriptor.playerIds)
    const validIds = new Set(round.participants.map((p) => p.player_id))
    for (const id of ids) {
      if (!validIds.has(id)) {
        return res.status(400).json({ error: '存在无效收件人' })
      }
    }
  }

  const attachmentsPayload = Array.isArray(attachments) ? attachments : []
  const existing = db
    .prepare('SELECT * FROM messages WHERE round_id = ? AND role = ?')
    .get(roundId, participant.role)

  if (existing) {
    db.prepare(
      'UPDATE messages SET subject = ?, body = ?, content_html = ?, from_alias = ?, reply_to = ?, distribution_type = ?, recipient_ids = ?, attachments = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
      subject,
      body,
      contentHtml || null,
      fromAlias || null,
      replyTo || null,
      distributionType,
      serializeRecipientDescriptor(
        distributionType === 'broadcast' ? null : normalizedDescriptor
      ),
      attachmentsPayload.length > 0 ? JSON.stringify(attachmentsPayload) : null,
      existing.id
    )
  } else {
    db.prepare(
      `
      INSERT INTO messages (id, round_id, author_id, role, subject, body, content_html, from_alias, reply_to, distribution_type, recipient_ids, attachments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      randomUUID(),
      roundId,
      authorId,
      participant.role,
      subject,
      body,
      contentHtml || null,
      fromAlias || null,
      replyTo || null,
      distributionType,
      serializeRecipientDescriptor(
        distributionType === 'broadcast' ? null : normalizedDescriptor
      ),
      attachmentsPayload.length > 0 ? JSON.stringify(attachmentsPayload) : null
    )
  }

  const updatedRound = getRoundById(roundId)
  res.json({ round: updatedRound })
})

app.post('/api/judgements', (req, res) => {
  const { roundId, messageId, playerId, verdict, reasoning } = req.body || {}
  if (!roundId || !messageId || !playerId || !verdict) {
    return res.status(400).json({ error: '缺少必要字段' })
  }
  if (!['trust', 'suspect'].includes(verdict)) {
    return res.status(400).json({ error: '非法判断选项' })
  }

  const round = getRoundById(roundId)
  if (!round) {
    return res.status(404).json({ error: '回合不存在' })
  }
  if (!['judging', 'retro'].includes(round.status)) {
    return res.status(409).json({ error: '当前阶段不可提交判断' })
  }

  const participant = db
    .prepare('SELECT * FROM round_participants WHERE round_id = ? AND player_id = ?')
    .get(roundId, playerId)
  if (!participant || participant.role !== 'citizen') {
    return res.status(403).json({ error: '只有普通市民可以提交判断' })
  }

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)
  if (!message || message.round_id !== roundId) {
    return res.status(404).json({ error: '邮件不存在或不属于该回合' })
  }

  const existing = db
    .prepare('SELECT * FROM judgements WHERE message_id = ? AND player_id = ?')
    .get(messageId, playerId)

  if (existing) {
    db.prepare('UPDATE judgements SET verdict = ?, reasoning = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(verdict, reasoning || null, existing.id)
  } else {
    db.prepare(`
      INSERT INTO judgements (id, round_id, message_id, player_id, verdict, reasoning)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), roundId, messageId, playerId, verdict, reasoning || null)
  }

  res.json({ round: getRoundById(roundId), scoreboard: computeScoreboard() })
})

app.get('/api/rounds', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50)
  const rows = db
    .prepare(
      `
    SELECT r.*, s.name as scenario_name
    FROM rounds r
    JOIN scenarios s ON s.id = r.scenario_id
    ORDER BY r.round_number DESC
    LIMIT ?
  `
    )
    .all(limit)
  const rounds = rows.map((row) => ({
    id: row.id,
    round_number: row.round_number,
    status: row.status,
    scenario_id: row.scenario_id,
    scenario_name: row.scenario_name,
    started_at: row.started_at,
    finished_at: row.finished_at
  }))
  res.json({ rounds })
})

app.get('/api/rounds/:roundId/report', (req, res) => {
  const round = getRoundById(req.params.roundId)
  if (!round) {
    return res.status(404).json({ error: '未找到对应回合' })
  }
  res.json(buildRoundReport(round))
})

app.get('/api/rounds/:roundId/export', (req, res) => {
  const round = getRoundById(req.params.roundId)
  if (!round) {
    return res.status(404).json({ error: '未找到对应回合' })
  }
  const payload = buildRoundReport(round)
  res.setHeader('Content-Disposition', `attachment; filename="infobattle-round-${round.round_number}-report.json"`)
  res.json(payload)
})

app.post('/api/admin/reset', (_req, res) => {
  const reset = db.transaction(() => {
    db.exec(`
      DELETE FROM judgements;
      DELETE FROM messages;
      DELETE FROM round_participants;
      DELETE FROM rounds;
      DELETE FROM players;
    `)
  })
  reset()
  res.json({ ok: true, message: '数据已重置' })
})

app.get('/api/analytics', (_req, res) => {
  res.json(computeAdvancedAnalytics())
})

app.get('/api/statistics', (_req, res) => {
  const scoreboard = computeScoreboard()
  const round = getLatestRoundRow()
  const summary = {
    totalPlayers: listPlayers().length,
    playedAsPhisher: scoreboard.filter((p) => p.rounds_as_phisher > 0).length,
    playedAsLeader: scoreboard.filter((p) => p.rounds_as_leader > 0).length,
    currentRound: round ? round.round_number : 0
  }
  res.json({ scoreboard, summary })
})

app.get('/api/mailbox', (req, res) => {
  const { roundId, playerId } = req.query
  if (!roundId || !playerId) {
    return res.status(400).json({ error: '缺少参数' })
  }
  const participant = db
    .prepare('SELECT * FROM round_participants WHERE round_id = ? AND player_id = ?')
    .get(roundId, playerId)
  if (!participant) {
    return res.status(404).json({ error: '未找到玩家或该玩家不在当前回合' })
  }

  const messagesRaw = db.prepare(
    `
    SELECT m.*, p.name as author_name, p.student_id as author_student_id
    FROM messages m
    JOIN players p ON p.id = m.author_id
    WHERE m.round_id = ?
    ORDER BY m.created_at DESC
  `
  ).all(roundId)

  const judgements = db
    .prepare('SELECT * FROM judgements WHERE round_id = ? AND player_id = ?')
    .all(roundId, playerId)
  const judgementMap = new Map(judgements.map((j) => [j.message_id, j]))

  const mailbox = messagesRaw
    .map((msg) => ({
      message: {
        ...msg,
        name: msg.author_name,
        student_id: msg.author_student_id,
        attachments: msg.attachments ? JSON.parse(msg.attachments) : [],
        recipient_descriptor: parseRecipientDescriptor(msg.recipient_ids)
      },
      author: { id: msg.author_id, name: msg.author_name },
      judgement: judgementMap.get(msg.id)
    }))
    .filter((item) => canMessageReachParticipant(item.message, participant))

  res.json({ mailbox })
})

app.listen(PORT, () => {
  console.log(`InfoBattle API running on http://localhost:${PORT}`)
})

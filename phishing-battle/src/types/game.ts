export type RoundRole = 'phisher' | 'leader' | 'citizen'

export interface Player {
  id: string
  student_id: string
  name: string
  created_at: string
  last_login?: string
  rounds_as_phisher: number
  rounds_as_leader: number
  rounds_as_citizen: number
  points?: number
}

export interface Scenario {
  id: string
  name: string
  background: string
  city_leader_task: string
  phisher_task: string
  risk_hints: string
}

export interface RoundParticipant {
  id: string
  round_id: string
  player_id: string
  role: RoundRole
  name: string
  student_id: string
}

export interface Message {
  id: string
  round_id: string
  author_id: string
  role: 'phisher' | 'leader'
  subject: string
  body: string
  content_html?: string
  from_alias?: string
  reply_to?: string
  distribution_type?: 'broadcast' | 'groups' | 'direct'
  recipient_descriptor?: RecipientDescriptor
  attachments?: MailAttachment[]
  created_at: string
  name: string
  student_id: string
}

export interface Judgement {
  id: string
  round_id: string
  message_id: string
  player_id: string
  verdict: 'trust' | 'suspect'
  reasoning?: string
  created_at: string
  name: string
  student_id: string
  message_role: 'phisher' | 'leader'
}

export interface Round {
  id: string
  round_number: number
  scenario_id: string
  status: 'drafting' | 'judging' | 'retro' | 'completed'
  phisher_id: string
  leader_id: string
  started_at: string
  finished_at?: string
  scenario: Scenario
  participants: RoundParticipant[]
  messages: Message[]
  judgements: Judgement[]
}

export interface RoundMeta {
  id: string
  round_number: number
  scenario_id: string
  scenario_name: string
  status: Round['status']
  started_at: string
  finished_at?: string | null
}

export interface ScoreboardEntry extends Player {
  points: number
}

export interface MailAttachment {
  name: string
  type?: string
  url?: string
  description?: string
}

export interface RecipientDescriptor {
  roles: RoundRole[]
  playerIds: string[]
}

export interface EmailTemplate {
  id: string
  scenario_id: string
  role: RoundRole | 'phisher' | 'leader'
  title: string
  subject: string
  content_html: string
  difficulty?: string
  keywords?: string
}

export interface MailboxMessage {
  message: Message
  recipients: RecipientDescriptor
  author: { id: string; name: string }
  judgement?: Judgement
}

export interface TimelineEvent {
  id: string
  type: 'round_started' | 'role_assigned' | 'message_submitted' | 'judgement_submitted' | 'round_completed'
  timestamp: string | null
  summary: string
  details?: Record<string, any>
}

export interface RoundMetrics {
  totalMessages: number
  totalJudgements: number
  leaderTrustRate: number | null
  phisherCatchRate: number | null
  reasoningCoverage: number | null
}

export interface ScenarioConfig {
  round_number: number
  scenario_id: string
  scenario_name: string
  objectives: {
    leader: string
    phisher: string
    risk_hints: string
  }
  participants: Array<{
    id: string
    name: string
    student_id: string
    role: RoundRole
  }>
  messages: Array<{
    id: string
    role: 'phisher' | 'leader'
    subject: string
    from_alias?: string
    reply_to?: string
    distribution_type: 'broadcast' | 'groups' | 'direct'
    recipients: RecipientDescriptor
    attachments: MailAttachment[]
    created_at: string
  }>
}

export interface RoundReport {
  generated_at: string
  round: Round
  timeline: TimelineEvent[]
  metrics: RoundMetrics
  scenarioConfig: ScenarioConfig
}

export interface ScenarioStat {
  scenarioId: string
  scenarioName: string
  roundsPlayed: number
  lastPlayedAt: string | null
  avgJudgementsPerRound: number
  leaderTrustRate: number | null
  phisherCatchRate: number | null
}

export interface AdvancedAnalytics {
  scenarioStats: ScenarioStat[]
  messageStats: {
    totalMessages: number
    richHtmlMessages: number
    aliasMessages: number
    attachmentCount: number
    distributionBreakdown: Record<string, number>
  }
  judgementStats: {
    totalJudgements: number
    trustCount: number
    suspectCount: number
    reasoningCount: number
    leaderTrustRate: number | null
    phisherDetectionRate: number | null
  }
}

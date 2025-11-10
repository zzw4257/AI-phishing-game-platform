import type {
  Player,
  Round,
  RoundMeta,
  Scenario,
  ScoreboardEntry,
  EmailTemplate,
  MailboxMessage,
  AdvancedAnalytics,
  RoundReport,
  ChallengeCard
} from '../types/game'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5678/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error || '请求失败')
  }
  return data as T
}

export function login(last4: string) {
  return request<{ role?: string; player?: Player; assignment?: string }>(`/login?last4=${encodeURIComponent(last4)}`)
}

export function fetchPlayers() {
  return request<{ players: Player[]; scoreboard: ScoreboardEntry[] }>(`/players`)
}

export function addPlayers(payload: { players: { studentId: string; name: string }[] }) {
  return request<{ added: any[]; total: number }>(`/players/bulk`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchScenarios() {
  return request<{ scenarios: Scenario[] }>(`/scenarios`)
}

export function fetchTemplates(params?: { scenarioId?: string; role?: string }) {
  const query = new URLSearchParams()
  if (params?.scenarioId) query.set('scenarioId', params.scenarioId)
  if (params?.role) query.set('role', params.role)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<{ templates: EmailTemplate[] }>(`/templates${suffix}`)
}

export function fetchCurrentRound() {
  return request<{ round: Round | null }>(`/rounds/current`)
}

export function startRound(payload?: { scenarioId?: string; challengeCardId?: string }) {
  return request<{ round: Round }>(`/rounds/start`, {
    method: 'POST',
    body: JSON.stringify(payload || {})
  })
}

export function updateRoundPhase(roundId: string, status: Round['status']) {
  return request<{ round: Round }>(`/rounds/${roundId}/phase`, {
    method: 'POST',
    body: JSON.stringify({ status })
  })
}

export function submitMessage(payload: {
  roundId: string
  authorId: string
  subject: string
  body: string
  contentHtml?: string
  fromAlias?: string
  replyTo?: string
  distribution?: { type: 'broadcast' | 'groups' | 'direct'; roles?: string[]; playerIds?: string[] }
  attachments?: Array<{ name: string; url?: string; type?: string; description?: string }>
}) {
  return request<{ round: Round }>(`/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function submitJudgement(payload: { roundId: string; messageId: string; playerId: string; verdict: 'trust' | 'suspect'; reasoning?: string }) {
  return request<{ round: Round; scoreboard: ScoreboardEntry[] }>(`/judgements`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchStatistics() {
  return request<{ scoreboard: ScoreboardEntry[]; summary: { totalPlayers: number; playedAsPhisher: number; playedAsLeader: number; currentRound: number } }>(`/statistics`)
}

export function fetchMailbox(roundId: string, playerId: string) {
  const params = new URLSearchParams({ roundId, playerId })
  return request<{ mailbox: MailboxMessage[] }>(`/mailbox?${params.toString()}`)
}

export function resetDatabase() {
  return request<{ ok: boolean; message?: string }>(`/admin/reset`, { method: 'POST' })
}

export function fetchRoundHistory(limit = 10) {
  return request<{ rounds: RoundMeta[] }>(`/rounds?limit=${limit}`)
}

export function fetchRoundReport(roundId: string) {
  return request<RoundReport>(`/rounds/${roundId}/report`)
}

export async function exportRoundReport(roundId: string) {
  const response = await fetch(`${API_BASE}/rounds/${roundId}/export`)
  if (!response.ok) {
    let message = '导出失败'
    try {
      const data = await response.json()
      message = data?.error || message
    } catch (_) {
      const text = await response.text()
      message = text || message
    }
    throw new Error(message)
  }
  const disposition = response.headers.get('Content-Disposition') || ''
  const matched = disposition.match(/filename="?(.*?)"?$/i)
  const filename = matched && matched[1] ? matched[1] : `infobattle-round-${roundId}.json`
  const blob = await response.blob()
  return { blob, filename }
}

export function fetchAnalytics() {
  return request<AdvancedAnalytics>(`/analytics`)
}

export function fetchChallenges() {
  return request<{ challenges: ChallengeCard[] }>(`/challenges`)
}

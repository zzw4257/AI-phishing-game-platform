import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Users,
  ClipboardList,
  PlayCircle,
  Mail,
  Target,
  AlertTriangle,
  Shuffle,
  CheckCircle2,
  Timer,
  Trophy,
  Sparkles,
  DatabaseZap,
  Download,
  History,
  Activity,
  RefreshCcw
} from 'lucide-react'
import Layout from '../components/Layout'
import {
  addPlayers,
  fetchCurrentRound,
  fetchPlayers,
  fetchScenarios,
  fetchTemplates,
  fetchStatistics,
  fetchAnalytics,
  fetchRoundHistory,
  fetchRoundReport,
  fetchChallenges,
  startRound,
  updateRoundPhase,
  resetDatabase,
  exportRoundReport
} from '../lib/api'
import type {
  AdvancedAnalytics,
  ChallengeCard,
  EmailTemplate,
  Message,
  Player,
  Round,
  RoundMeta,
  RoundReport,
  RoundRole,
  TimelineEvent,
  Scenario,
  ScoreboardEntry
} from '../types/game'
import { describeStatus } from '../lib/stage'
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const difficultyBadge = (value?: string) => {
  switch (value) {
    case 'easy':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'medium':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'hard':
      return 'bg-rose-100 text-rose-700 border-rose-200'
    case 'expert':
      return 'bg-purple-100 text-purple-700 border-purple-200'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

const transitions: Record<Round['status'], Array<Round['status']>> = {
  drafting: ['judging'],
  judging: ['retro', 'completed'],
  retro: ['completed'],
  completed: []
}

const phaseControls: Array<{ key: Round['status']; label: string; hint: string; accent: string }> = [
  {
    key: 'judging',
    label: '进入判断阶段',
    hint: '锁定邮件，同时提醒普通市民开始投票',
    accent: 'bg-blue-600'
  },
  {
    key: 'retro',
    label: '切换到复盘',
    hint: '收集足够判断后，组织大家拆解话术',
    accent: 'bg-emerald-600'
  },
  {
    key: 'completed',
    label: '结束本回合',
    hint: '归档战况，准备下一轮',
    accent: 'bg-gray-900'
  }
]

const scenarioThumbs: Record<
  string,
  {
    intro: string
    highlight: string
  }
> = {
  'health-subsidy': {
    intro: '/assets/info-battle/scenarios/health-subsidy/intro.webp',
    highlight: '/assets/info-battle/scenarios/health-subsidy/phishing.webp'
  },
  'facial-database': {
    intro: '/assets/info-battle/scenarios/facial-database/intro.webp',
    highlight: '/assets/info-battle/scenarios/facial-database/phishing.webp'
  },
  'epidemic-tracing': {
    intro: '/assets/info-battle/scenarios/epidemic-tracing/intro.webp',
    highlight: '/assets/info-battle/scenarios/epidemic-tracing/phishing.webp'
  }
}

export default function AdminPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[]>([])
  const [round, setRound] = useState<Round | null>(null)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [templatesByScenario, setTemplatesByScenario] = useState<Record<string, EmailTemplate[]>>({})
  const [summary, setSummary] = useState({ totalPlayers: 0, playedAsPhisher: 0, playedAsLeader: 0, currentRound: 0 })
  const [students, setStudents] = useState('')
  const [selectedScenario, setSelectedScenario] = useState('')
  const [challenges, setChallenges] = useState<ChallengeCard[]>([])
  const [selectedChallenge, setSelectedChallenge] = useState('')
  const [loading, setLoading] = useState(false)
  const [phaseUpdating, setPhaseUpdating] = useState(false)
  const [analytics, setAnalytics] = useState<AdvancedAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [roundHistory, setRoundHistory] = useState<RoundMeta[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [reportRoundId, setReportRoundId] = useState('')
  const [reportData, setReportData] = useState<RoundReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [templateFilterRole, setTemplateFilterRole] = useState<'all' | 'phisher' | 'leader'>('all')
  const [templateFilterDifficulty, setTemplateFilterDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard' | 'expert'>('all')
  const [templateSearch, setTemplateSearch] = useState('')
  const [templatePreview, setTemplatePreview] = useState<EmailTemplate | null>(null)
  const reportRequestRef = useRef<string | null>(null)

  useEffect(() => {
    loadBasics()
    loadAnalytics()
    loadRoundHistory({ showSpinner: true })
    fetchScenarios().then((res) => setScenarios(res.scenarios))
    fetchTemplates().then((res) => {
      const grouped: Record<string, EmailTemplate[]> = {}
      res.templates.forEach((tpl) => {
        grouped[tpl.scenario_id] = grouped[tpl.scenario_id] || []
        grouped[tpl.scenario_id].push(tpl)
      })
      setTemplatesByScenario(grouped)
    })
    fetchChallenges().then((res) => setChallenges(res.challenges))
    const basicsTimer = setInterval(loadBasics, 5000)
    const analyticsTimer = setInterval(loadAnalytics, 15000)
    return () => {
      clearInterval(basicsTimer)
      clearInterval(analyticsTimer)
    }
  }, [])

  const loadBasics = async () => {
    try {
      const [playersRes, statsRes, roundRes] = await Promise.all([fetchPlayers(), fetchStatistics(), fetchCurrentRound()])
      setPlayers(playersRes.players)
      setScoreboard(statsRes.scoreboard)
      setSummary(statsRes.summary)
      setRound(roundRes.round)
    } catch (error) {
      console.error('加载数据失败', error)
    }
  }

  const loadAnalytics = async () => {
    try {
      const data = await fetchAnalytics()
      setAnalytics(data)
    } catch (error) {
      console.error('加载统计失败', error)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const loadRoundHistory = async (options?: { showSpinner?: boolean }) => {
    if (options?.showSpinner) {
      setHistoryLoading(true)
    }
    try {
      const res = await fetchRoundHistory(20)
      setRoundHistory(res.rounds)
    } catch (error) {
      console.error('加载历史回合失败', error)
    } finally {
      if (options?.showSpinner) {
        setHistoryLoading(false)
      }
    }
  }

  const fetchReport = async (roundId: string, options?: { silent?: boolean }) => {
    if (!roundId) {
      setReportData(null)
      return
    }
    if (!options?.silent) {
      setReportLoading(true)
    }
    reportRequestRef.current = roundId
    try {
      const data = await fetchRoundReport(roundId)
      if (reportRequestRef.current === roundId) {
        setReportData(data)
      }
    } catch (error) {
      if (reportRequestRef.current === roundId) {
        console.error('加载回合报告失败', error)
        if (!options?.silent) {
          alert('无法获取该回合的日志，请稍后再试')
        }
        setReportData(null)
      }
    } finally {
      if (!options?.silent && reportRequestRef.current === roundId) {
        setReportLoading(false)
      }
    }
  }

  useEffect(() => {
    if (roundHistory.length === 0) {
      setReportRoundId('')
      setReportData(null)
      return
    }
    if (reportRoundId && roundHistory.some((item) => item.id === reportRoundId)) {
      return
    }
    if (round?.id && roundHistory.some((item) => item.id === round.id)) {
      setReportRoundId(round.id)
      return
    }
    setReportRoundId(roundHistory[0].id)
  }, [round?.id, roundHistory, reportRoundId])

  useEffect(() => {
    if (!reportRoundId) {
      setReportData(null)
      return
    }
    fetchReport(reportRoundId)
  }, [reportRoundId])

  const handleAddStudents = async () => {
    if (!students.trim()) {
      alert('请输入学生名单')
      return
    }

    const parsed = students
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, ...rest] = line.split(/\s+/)
        return { studentId: id, name: rest.join('') || id }
      })
      .filter((item) => item.studentId)

    if (parsed.length === 0) {
      alert('未解析到有效的学号')
      return
    }

    setLoading(true)
    try {
      const response = await addPlayers({ players: parsed })
      setStudents('')
      loadBasics()
      const inserted = response.added.filter((item: any) => item.inserted).length
      const skipped = response.added.filter((item: any) => !item.inserted)
      let message = `成功导入 ${inserted} 名玩家`
      if (skipped.length > 0) {
        const detail = skipped
          .map((item: any) => `${item.student_id || '未知学号'}：${item.reason || '已存在'}`)
          .join('\n')
        message += `\n跳过 ${skipped.length} 行：\n${detail}`
      }
      alert(message)
    } catch (error: any) {
      alert(error.message || '导入失败')
    } finally {
      setLoading(false)
    }
  }

  const handleResetDatabase = async () => {
    if (!window.confirm('确认要重置数据库吗？此操作会清空所有玩家、回合与日志。')) {
      return
    }
    setResetting(true)
    try {
      await resetDatabase()
      setReportRoundId('')
      setReportData(null)
      await Promise.all([loadBasics(), loadRoundHistory()])
      alert('数据库已重置，可重新导入学生名单。')
    } catch (error: any) {
      alert(error.message || '重置失败，请稍后再试')
    } finally {
      setResetting(false)
    }
  }

  const downloadJson = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadConfig = () => {
    if (!reportData) {
      alert('请先选择需要导出的回合')
      return
    }
    downloadJson(
      {
        generated_at: reportData.generated_at,
        scenarioConfig: reportData.scenarioConfig
      },
      `infobattle-round-${reportData.round.round_number}-scenario.json`
    )
  }

  const handleDownloadTimeline = () => {
    if (!reportData) {
      alert('请先选择需要导出的回合')
      return
    }
    downloadJson(
      {
        generated_at: reportData.generated_at,
        round: { id: reportData.round.id, round_number: reportData.round.round_number },
        timeline: reportData.timeline
      },
      `infobattle-round-${reportData.round.round_number}-timeline.json`
    )
  }

  const handleExportFullReport = async () => {
    if (!reportRoundId) {
      alert('暂无可导出的回合')
      return
    }
    setExporting(true)
    try {
      const { blob, filename } = await exportRoundReport(reportRoundId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      alert(error.message || '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const handleRefreshReport = async () => {
    await loadRoundHistory({ showSpinner: true })
    if (reportRoundId) {
      await fetchReport(reportRoundId)
    }
  }

  const handleManualRefresh = async () => {
    await Promise.all([loadBasics(), loadAnalytics()])
    await loadRoundHistory({ showSpinner: true })
  }

  const handleStartRound = async () => {
    setPhaseUpdating(true)
    try {
      const payload: { scenarioId?: string; challengeCardId?: string } = {}
      if (selectedScenario) payload.scenarioId = selectedScenario
      if (selectedChallenge) payload.challengeCardId = selectedChallenge
      const response = await startRound(Object.keys(payload).length > 0 ? payload : undefined)
      setRound(response.round)
      setSelectedScenario('')
      setSelectedChallenge('')
      await Promise.all([loadBasics(), loadRoundHistory()])
      loadAnalytics()
    } catch (error: any) {
      alert(error.message || '无法创建新回合')
    } finally {
      setPhaseUpdating(false)
    }
  }

  const handlePhaseChange = async (status: Round['status']) => {
    if (!round) return
    setPhaseUpdating(true)
    try {
      const response = await updateRoundPhase(round.id, status)
      setRound(response.round)
      await loadBasics()
      if (status === 'completed') {
        await loadRoundHistory()
      }
      loadAnalytics()
    } catch (error: any) {
      alert(error.message || '状态更新失败')
    } finally {
      setPhaseUpdating(false)
    }
  }

  const coverage = useMemo(() => {
    if (players.length === 0) return { phisher: 0, leader: 0 }
    const phisher = Math.round((summary.playedAsPhisher / players.length) * 100)
    const leader = Math.round((summary.playedAsLeader / players.length) * 100)
    return { phisher, leader }
  }, [players.length, summary.playedAsLeader, summary.playedAsPhisher])

  const selectedScenarioDetail = scenarios.find((scene) => scene.id === selectedScenario)
  const selectedChallengeDetail = challenges.find((card) => card.id === selectedChallenge)
  const canStartNewRound = !round || round.status === 'completed'
  const stageMeta = describeStatus(round?.status)
  const phisherSubmitted = !!round?.messages.find((m) => m.role === 'phisher')
  const leaderSubmitted = !!round?.messages.find((m) => m.role === 'leader')

  const canMoveTo = (target: Round['status']) => {
    if (!round) return false
    const options = transitions[round.status] || []
    return options.includes(target)
  }

  const roleLabel = (role: RoundRole) => {
    switch (role) {
      case 'phisher':
        return '钓鱼大师'
      case 'leader':
        return '城市领袖'
      default:
        return '普通市民'
    }
  }

  const participantNameMap = useMemo(() => {
    if (!round) return new Map<string, string>()
    return new Map(round.participants.map((p) => [p.player_id, p.name]))
  }, [round])

  const reportParticipantMap = useMemo(() => {
    if (!reportData) return new Map<string, string>()
    return new Map(reportData.round.participants.map((p) => [p.player_id, p.name]))
  }, [reportData])
  const filteredTemplates = useMemo(() => {
    const byScenario = selectedScenario ? templatesByScenario[selectedScenario] || [] : Object.values(templatesByScenario).flat()
    return byScenario.filter((tpl) => {
      if (templateFilterRole !== 'all' && tpl.role !== templateFilterRole) return false
      if (templateFilterDifficulty !== 'all' && (tpl.difficulty || 'normal') !== templateFilterDifficulty) return false
      if (templateSearch) {
        const haystack = `${tpl.title} ${tpl.subject} ${tpl.content_html} ${tpl.keywords || ''}`.toLowerCase()
        if (!haystack.includes(templateSearch.toLowerCase())) return false
      }
      return true
    })
  }, [selectedScenario, templatesByScenario, templateFilterRole, templateFilterDifficulty, templateSearch])

  const describeAudience = (message: Message) => {
    if (!message.distribution_type || message.distribution_type === 'broadcast') {
      return '广播所有参与者'
    }
    const descriptor = message.recipient_descriptor || { roles: [], playerIds: [] }
    const parts: string[] = []
    if (descriptor.roles?.length) {
      parts.push(`角色：${descriptor.roles.map((role) => (role === 'citizen' ? '市民' : role === 'leader' ? '城市领袖' : '钓鱼大师')).join('、')}`)
    }
    if (descriptor.playerIds?.length) {
      const names = descriptor.playerIds.map((id) => participantNameMap.get(id) || '未知')
      parts.push(`定向：${names.join('、')}`)
    }
    return parts.join('；') || '广播所有参与者'
  }

  const describeRecipients = (descriptor?: Message['recipient_descriptor'], map?: Map<string, string>) => {
    if (!descriptor) return '广播所有参与者'
    const parts: string[] = []
    if (descriptor.roles?.length) {
      parts.push(`角色：${descriptor.roles.map((role) => roleLabel(role)).join('、')}`)
    }
    if (descriptor.playerIds?.length) {
      const lookup = map || reportParticipantMap
      const names = descriptor.playerIds.map((id) => lookup.get(id) || '未知')
      parts.push(`定向：${names.join('、')}`)
    }
    return parts.join('；') || '广播所有参与者'
  }

  const formatRatio = (value?: number | null, digits = 1) => {
    if (value === null || value === undefined) return '—'
    return `${(value * 100).toFixed(digits)}%`
  }

  const formatPercentValue = (value?: number | null) => {
    if (value === null || value === undefined) return '—'
    return `${value.toFixed(1)}%`
  }

  const distributionLabel = (type: string) => {
    switch (type) {
      case 'groups':
        return '角色群发'
      case 'direct':
        return '定向私信'
      default:
        return '广播'
    }
  }

  const formatTimestamp = (timestamp?: string | null) => {
    if (!timestamp) return '时间未知'
    return new Date(timestamp).toLocaleString()
  }

  const challengeBadge = (difficulty?: ChallengeCard['difficulty']) => {
    switch (difficulty) {
      case 'low':
        return { label: '低压', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
      case 'medium':
        return { label: '中压', className: 'bg-amber-50 text-amber-700 border border-amber-200' }
      case 'high':
      default:
        return { label: '高压', className: 'bg-rose-50 text-rose-700 border border-rose-200' }
    }
  }

  const renderTimelineDetail = (event: TimelineEvent) => {
    const details = event.details || {}
    switch (event.type) {
      case 'role_assigned':
        return (
          <p className="text-xs text-gray-500">
            角色：{roleLabel(details.role)} · 玩家：{details.player}
          </p>
        )
      case 'message_submitted':
        return (
          <p className="text-xs text-gray-500">
            主题：{details.subject || '未命名'} · 分发：{describeRecipients(details.recipients, reportParticipantMap)}
          </p>
        )
      case 'judgement_submitted':
        return (
          <p className="text-xs text-gray-500">
            玩家：{details.player} · 判定：{details.verdict === 'trust' ? '可信' : '存疑'}
            {details.reasoning ? ` · 理由：${details.reasoning}` : ''}
          </p>
        )
      case 'round_started':
        return (
          <p className="text-xs text-gray-500">
            场景：{details.scenario}
          </p>
        )
      case 'round_completed':
        return (
          <p className="text-xs text-gray-500">
            状态：{details.status}
          </p>
        )
      default:
        return null
    }
  }

  return (
    <Layout role="admin">
      <div className="px-4 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">赛博城主持人后台</p>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3 flex-wrap">
              InfoBattle 控制台
              <span className="text-base font-medium text-gray-500">第 {summary.currentRound || 0} 回合</span>
              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${stageMeta.badge}`}>{stageMeta.label}</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">{stageMeta.hint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              已导入 {summary.totalPlayers} 名玩家
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-rose-600" />
              钓鱼大师体验 {coverage.phisher}%
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-indigo-600" />
              城市领袖体验 {coverage.leader}%
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" />
            刷新概览
          </button>
          <button
            type="button"
            onClick={handleResetDatabase}
            disabled={resetting}
            className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DatabaseZap className="h-4 w-4" />
            {resetting ? '正在重置…' : '重置数据库'}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow p-6 xl:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-500">当前场景</p>
                <h2 className="text-2xl font-semibold text-gray-900">{round?.scenario.name || '尚未开始'}</h2>
              </div>
              <Timer className="h-5 w-5 text-gray-400" />
            </div>
            {round ? (
              <div className="space-y-5">
                <p className="text-gray-700 text-sm leading-relaxed">{round.scenario.background}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`border rounded-lg p-4 ${phisherSubmitted ? 'border-rose-200 bg-rose-50/80' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2 text-rose-600 mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      钓鱼大师
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{round.scenario.phisher_task}</p>
                    <p className="text-sm font-semibold">执行者：{round.participants.find((p) => p.role === 'phisher')?.name || '待定'}</p>
                    <p className={`text-xs ${phisherSubmitted ? 'text-rose-600' : 'text-gray-500'}`}>
                      {phisherSubmitted ? '已提交草稿' : '等待草稿…'}
                    </p>
                  </div>
                  <div className={`border rounded-lg p-4 ${leaderSubmitted ? 'border-indigo-200 bg-indigo-50/80' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2 text-indigo-600 mb-2">
                      <Target className="h-4 w-4" />
                      城市领袖
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{round.scenario.city_leader_task}</p>
                    <p className="text-sm font-semibold">执行者：{round.participants.find((p) => p.role === 'leader')?.name || '待定'}</p>
                    <p className={`text-xs ${leaderSubmitted ? 'text-indigo-600' : 'text-gray-500'}`}>
                      {leaderSubmitted ? '已提交草稿' : '等待草稿…'}
                    </p>
                  </div>
                </div>
                {round.challenge_card && (
                  <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-700">
                        <History className="h-4 w-4" />
                        挑战卡 · {round.challenge_card.name}
                      </div>
                      <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${challengeBadge(round.challenge_card.difficulty).className}`}>
                        {challengeBadge(round.challenge_card.difficulty).label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{round.challenge_card.summary}</p>
                    <p className="text-xs text-gray-500">压测规则：{round.challenge_card.pressure}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="font-semibold text-rose-700 mb-1">钓鱼大师指令</p>
                        <ul className="list-disc list-inside space-y-1 text-gray-700">
                          {round.challenge_card.phisher_objectives.map((tip) => (
                            <li key={tip}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-indigo-700 mb-1">城市领袖指令</p>
                        <ul className="list-disc list-inside space-y-1 text-gray-700">
                          {round.challenge_card.leader_objectives.map((tip) => (
                            <li key={tip}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-emerald-700 mb-1">市民情报</p>
                        <ul className="list-disc list-inside space-y-1 text-gray-700">
                          {round.challenge_card.citizen_hints.map((tip) => (
                            <li key={tip}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center gap-2 text-gray-700 mb-2">
                    <Mail className="h-4 w-4" />
                    市民判断统计
                  </div>
                  {round.judgements.length === 0 ? (
                    <p className="text-sm text-gray-500">暂未收到判断</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {['phisher', 'leader'].map((role) => {
                        const relevant = round.judgements.filter((j) => j.message_role === role)
                        const trust = relevant.filter((j) => j.verdict === 'trust').length
                        const suspect = relevant.length - trust
                        return (
                          <div key={role} className="bg-white rounded-lg border p-3">
                            <p className="font-medium text-gray-700 mb-1">{role === 'phisher' ? '钓鱼邮件' : '官方邮件'}</p>
                            <p className="text-sm text-gray-600">信任 {trust} · 存疑 {suspect}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">尚未创建任何回合，请先导入学生并点击“开启信息战”。</p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Shuffle className="h-5 w-5 text-purple-600" />
                回合控制
              </h3>
              <PlayCircle className="h-5 w-5 text-gray-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">下一轮预选场景 (可选)</label>
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">系统自动均衡</option>
                {scenarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {selectedScenarioDetail && (
                <p className="mt-2 text-xs text-gray-500">{selectedScenarioDetail.background}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">挑战卡 (可选)</label>
              <select
                value={selectedChallenge}
                onChange={(e) => setSelectedChallenge(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">系统随机出牌</option>
                {challenges.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name} · {card.summary.slice(0, 10)}...
                  </option>
                ))}
              </select>
              {selectedChallengeDetail && (
                <div className="mt-2 text-xs text-gray-600 space-y-1 bg-gray-50 border border-dashed border-gray-200 rounded-md p-2">
                  <p className="font-semibold text-gray-700">{selectedChallengeDetail.name}</p>
                  <p>{selectedChallengeDetail.summary}</p>
                  <p className="text-gray-500">压测：{selectedChallengeDetail.pressure}</p>
                </div>
              )}
            </div>
            <button
              onClick={handleStartRound}
              disabled={phaseUpdating || !canStartNewRound}
              className={`w-full text-white py-2 rounded-md transition ${canStartNewRound ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-400 cursor-not-allowed'}`}
            >
              {phaseUpdating ? '处理中…' : '开启信息战'}
            </button>
            {!canStartNewRound && (
              <p className="text-xs text-rose-600">当前回合尚未完成，需先结束后才能开启下一轮。</p>
            )}
            <div className="space-y-3 pt-2">
              {phaseControls.map((control) => (
                <div key={control.key} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800">{control.label}</p>
                    <button
                      onClick={() => handlePhaseChange(control.key)}
                      disabled={!canMoveTo(control.key) || phaseUpdating}
                      className={`px-3 py-1.5 text-xs font-semibold text-white rounded-md ${
                        canMoveTo(control.key) && !phaseUpdating ? control.accent : 'bg-gray-400'
                      }`}
                    >
                      前往
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">{control.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-amber-600" />
                批量导入玩家
              </h3>
            </div>
            <textarea
              value={students}
              onChange={(e) => setStudents(e.target.value)}
              placeholder={`每行一名玩家，格式：学号 姓名\n示例：\n3210105001 张三\n3210105002 李四`}
              className="w-full h-40 border rounded-md p-3 text-sm"
            />
            <p className="mt-2 text-xs text-gray-500">提示：管理员口令保留为内部使用，学号后四位为 0000 的记录将被自动忽略。</p>
            <button
              onClick={handleAddStudents}
              disabled={loading}
              className="mt-3 w-full bg-amber-600 text-white py-2 rounded-md hover:bg-amber-700 disabled:bg-gray-400"
            >
              {loading ? '导入中…' : '导入/追加玩家'}
            </button>
          </div>

          <div className="bg-white rounded-xl shadow p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                角色覆盖情况
              </h3>
              <span className="text-xs text-gray-500">目标：每人至少体验钓鱼大师与城市领袖</span>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">钓鱼大师</p>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500" style={{ width: `${coverage.phisher}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{summary.playedAsPhisher}/{players.length} 人完成</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">城市领袖</p>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${coverage.leader}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{summary.playedAsLeader}/{players.length} 人完成</p>
            </div>
            <ul className="max-h-48 overflow-auto text-sm divide-y">
              {players.map((player) => (
                <li key={player.id} className="py-2 flex items-center justify-between">
                  <span className="text-gray-700">{player.name}</span>
                  <div className="flex gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full ${player.rounds_as_phisher > 0 ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-500'}`}>
                      鱼 {player.rounds_as_phisher}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full ${player.rounds_as_leader > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                      领 {player.rounds_as_leader}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      民 {player.rounds_as_citizen}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-blue-600" />
              赛后排行榜
            </h3>
            <p className="text-sm text-gray-500">规则：钓鱼/领袖被正确判断 +2；市民准确判断 +1</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">排名</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">姓名</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">钓鱼轮次</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">领袖轮次</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">市民轮次</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">积分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scoreboard.map((row, index) => (
                  <tr key={row.id} className={index < 3 ? 'bg-amber-50/40' : ''}>
                    <td className="px-4 py-2 text-gray-600">#{index + 1}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-2">{row.rounds_as_phisher}</td>
                    <td className="px-4 py-2">{row.rounds_as_leader}</td>
                    <td className="px-4 py-2">{row.rounds_as_citizen}</td>
                    <td className="px-4 py-2 font-semibold text-blue-600">{row.points ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-600" />
              攻防统计面板
            </h3>
            <span className="text-xs text-gray-500">基于已结束回合的累积数据</span>
          </div>
          {analyticsLoading ? (
            <p className="text-sm text-gray-500">正在汇总高级统计…</p>
          ) : !analytics ? (
            <p className="text-sm text-gray-500">暂无可用数据，请先完成至少一轮信息战。</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">邮件产出</p>
                  <p className="text-3xl font-bold text-gray-900">{analytics.messageStats.totalMessages}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    图文 {analytics.messageStats.totalMessages ? Math.round((analytics.messageStats.richHtmlMessages / analytics.messageStats.totalMessages) * 100) : 0}% ·
                    附件 {analytics.messageStats.attachmentCount}
                  </p>
                </div>
                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">判断表现</p>
                  <p className="text-3xl font-bold text-gray-900">{analytics.judgementStats.totalJudgements}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    可信 {analytics.judgementStats.trustCount} · 存疑 {analytics.judgementStats.suspectCount} · 填写理由 {analytics.judgementStats.reasoningCount}
                  </p>
                </div>
                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">分发策略</p>
                  <ul className="mt-1 text-sm text-gray-600 space-y-0.5">
                    {Object.entries(analytics.messageStats.distributionBreakdown).map(([key, count]) => (
                      <li key={key}>
                        {distributionLabel(key)}：{count}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">官方可信率</p>
                  <p className="text-3xl font-bold text-gray-900">{formatPercentValue(analytics.judgementStats.leaderTrustRate)}</p>
                  <p className="text-xs text-gray-500 mt-1">普通市民对官方邮件的信任占比</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">钓鱼识别率</p>
                  <p className="text-3xl font-bold text-gray-900">{formatPercentValue(analytics.judgementStats.phisherDetectionRate)}</p>
                  <p className="text-xs text-gray-500 mt-1">普通市民将钓鱼邮件判为存疑的占比</p>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">场景表现概览</h4>
                {analytics.scenarioStats.length === 0 ? (
                  <p className="text-sm text-gray-500">尚无场景统计。</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">场景</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">回合数</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">平均判断</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">官方可信率</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">钓鱼识别率</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">最近更新</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {analytics.scenarioStats.map((item) => (
                          <tr key={item.scenarioId}>
                            <td className="px-4 py-2">{item.scenarioName}</td>
                            <td className="px-4 py-2">{item.roundsPlayed}</td>
                            <td className="px-4 py-2">{item.avgJudgementsPerRound}</td>
                            <td className="px-4 py-2">{formatPercentValue(item.leaderTrustRate)}</td>
                            <td className="px-4 py-2">{formatPercentValue(item.phisherCatchRate)}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{item.lastPlayedAt ? new Date(item.lastPlayedAt).toLocaleString() : '尚未进行'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {round && round.messages.length > 0 && (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="h-5 w-5 text-rose-600" />
                邮件分发日志
              </h3>
              <span className="text-xs text-gray-500">查看钓鱼/官方邮件的投放对象</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {round.messages.map((msg) => (
                <div key={msg.id} className="border rounded-lg p-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {msg.role === 'phisher' ? '钓鱼邮件' : '官方通知'}
                  </p>
                  <p className="text-xs text-gray-500">发件人：{msg.from_alias || msg.name}</p>
                  <p className="text-xs text-gray-500">受众：{describeAudience(msg)}</p>
                  <p className="text-sm text-gray-700 mt-2 font-medium">{msg.subject}</p>
                  <p className="text-xs text-gray-500 line-clamp-2 mt-1">{msg.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" />
                钓鱼流程日志
              </h3>
              <p className="text-xs text-gray-500 mt-1">从角色分配到判断提交的完整时间线，可导出情景配置与日志。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={reportRoundId}
                onChange={(e) => setReportRoundId(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              >
                <option value="">选择回合</option>
                {roundHistory.map((item) => (
                  <option key={item.id} value={item.id}>
                    第 {item.round_number} 回 · {item.scenario_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRefreshReport}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                刷新
              </button>
              <button
                type="button"
                onClick={handleDownloadConfig}
                disabled={!reportData}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                导出情景
              </button>
              <button
                type="button"
                onClick={handleDownloadTimeline}
                disabled={!reportData}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                导出日志
              </button>
              <button
                type="button"
                onClick={handleExportFullReport}
                disabled={!reportData || exporting}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? '导出中…' : '完整报告'}
              </button>
            </div>
          </div>
          {historyLoading ? (
            <p className="text-sm text-gray-500">正在加载回合列表…</p>
          ) : !roundHistory.length ? (
            <p className="text-sm text-gray-500">暂无历史回合，请完成至少一轮信息战。</p>
          ) : reportLoading ? (
            <p className="text-sm text-gray-500">正在获取回合日志…</p>
          ) : !reportData ? (
            <p className="text-sm text-gray-500">请选择回合以查看日志。</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">邮件数量</p>
                  <p className="text-2xl font-semibold text-gray-900">{reportData.metrics.totalMessages}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">判断数量</p>
                  <p className="text-2xl font-semibold text-gray-900">{reportData.metrics.totalJudgements}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">识别情况</p>
                  <p className="text-sm text-gray-600">
                    官方可信 {formatRatio(reportData.metrics.leaderTrustRate)} · 钓鱼识别 {formatRatio(reportData.metrics.phisherCatchRate)}
                  </p>
                </div>
              </div>
              {reportData.round.challenge_card && (
                <div className="border rounded-lg p-4 bg-white/60">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-900">挑战卡回顾 · {reportData.round.challenge_card.name}</p>
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${challengeBadge(reportData.round.challenge_card.difficulty).className}`}>
                      {challengeBadge(reportData.round.challenge_card.difficulty).label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{reportData.round.challenge_card.summary}</p>
                  <p className="text-xs text-gray-500 mt-1">压测规则：{reportData.round.challenge_card.pressure}</p>
                </div>
              )}
              <ol className="relative border-l border-gray-200 pl-4 space-y-4">
                {reportData.timeline.map((event) => (
                  <li key={event.id} className="ml-4">
                    <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full border border-gray-200 bg-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    </span>
                    <p className="text-xs text-gray-500">{formatTimestamp(event.timestamp)}</p>
                    <p className="text-sm font-medium text-gray-900">{event.summary}</p>
                    {renderTimelineDetail(event)}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              场景任务手册
            </h3>
            <span className="text-xs text-gray-500">点击卡片即可作为下一轮的预选场景</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map((scene) => {
              const isPicked = selectedScenario === scene.id
              const tplList = templatesByScenario[scene.id] || []
              const thumbs = scenarioThumbs[scene.id]
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => setSelectedScenario(isPicked ? '' : scene.id)}
                  className={`text-left border rounded-lg p-4 h-full transition ${
                    isPicked ? 'border-indigo-500 bg-indigo-50 shadow-inner' : 'border-gray-200 hover:border-indigo-200'
                  }`}
                >
                  {thumbs && (
                    <div className="h-28 mb-3 rounded-lg overflow-hidden bg-gray-100">
                      <img src={thumbs.intro} alt={scene.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mb-1">{scene.id}</p>
                  <h4 className="font-semibold text-gray-900 mb-2">{scene.name}</h4>
                  <p className="text-sm text-gray-600 mb-3">{scene.background}</p>
                  {tplList.length > 0 && (
                    <div className="text-xs text-gray-500 space-y-1 mb-3">
                      <p className="font-semibold text-gray-700">内置模板</p>
                      {tplList.slice(0, 3).map((tpl) => (
                        <p key={tpl.id}>
                          [{tpl.role === 'phisher' ? '钓鱼' : '官方'}] {tpl.title}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    {isPicked ? '已选择，开启新回合时优先使用' : '点击选择此场景'}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTemplateFilterRole('all')
                      setTemplateFilterDifficulty('all')
                      setTemplateSearch('')
                      setTemplatePreview(null)
                      setSelectedScenario(scene.id)
                    }}
                    className="mt-3 w-full text-center text-xs text-indigo-600 underline"
                  >
                    浏览全部模板
                  </button>
                </button>
              )
            })}
          </div>

          {selectedScenario && (
            <div className="mt-6 border rounded-xl p-4 space-y-4 bg-gray-50">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  模板库 · {scenarios.find((s) => s.id === selectedScenario)?.name || selectedScenario}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <select
                    value={templateFilterRole}
                    onChange={(e) => setTemplateFilterRole(e.target.value as any)}
                    className="border rounded-md px-2 py-1"
                  >
                    <option value="all">全部角色</option>
                    <option value="phisher">钓鱼大师</option>
                    <option value="leader">城市领袖</option>
                  </select>
                  <select
                    value={templateFilterDifficulty}
                    onChange={(e) => setTemplateFilterDifficulty(e.target.value as any)}
                    className="border rounded-md px-2 py-1"
                  >
                    <option value="all">全部难度</option>
                    <option value="easy">easy</option>
                    <option value="medium">medium</option>
                    <option value="hard">hard</option>
                    <option value="expert">expert</option>
                  </select>
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="搜索标题/关键词"
                    className="border rounded-md px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateFilterRole('all')
                      setTemplateFilterDifficulty('all')
                      setTemplateSearch('')
                      setTemplatePreview(null)
                    }}
                    className="px-2 py-1 text-xs text-gray-600 underline"
                  >
                    重置
                  </button>
                </div>
              </div>
              {filteredTemplates.length === 0 ? (
                <p className="text-sm text-gray-500">暂无匹配模板，可调整筛选条件。</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {filteredTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className={`border rounded-lg p-3 bg-white cursor-pointer ${templatePreview?.id === tpl.id ? 'border-indigo-500 shadow' : 'hover:border-indigo-300'}`}
                      onClick={() => setTemplatePreview(tpl)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            tpl.role === 'phisher' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}
                        >
                          {tpl.role === 'phisher' ? '钓鱼' : '官方'}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${difficultyBadge(tpl.difficulty)}`}>
                          {tpl.difficulty || 'normal'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{tpl.title}</p>
                      <p className="text-xs text-gray-500">{tpl.subject}</p>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-3">{stripHtml(tpl.content_html)}</p>
                      {tpl.keywords && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tpl.keywords.split(',').map((kw) => (
                            <span key={`${tpl.id}-${kw.trim()}`} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              {kw.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {templatePreview && (
                <div className="border rounded-lg bg-white p-4 shadow-inner">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{templatePreview.title}</p>
                      <p className="text-xs text-gray-500">
                        {templatePreview.role === 'phisher' ? '钓鱼大师模板' : '城市领袖模板'} · {templatePreview.subject}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full border ${difficultyBadge(templatePreview.difficulty)}`}>
                        难度：{templatePreview.difficulty || 'normal'}
                      </span>
                      <button
                        type="button"
                        className="px-3 py-1.5 border rounded-md text-indigo-600 border-indigo-300"
                        onClick={() => {
                          navigator?.clipboard?.writeText(templatePreview.content_html)
                          alert('HTML 已复制，可粘贴到邮件编辑器。')
                        }}
                      >
                        复制 HTML
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    推荐别名/Reply-To 可在编辑器内使用 AI 助手获取，也可直接参考模板内容。
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">HTML 预览</p>
                      <div className="border rounded-md bg-gray-50 p-3 text-sm min-h-[160px]" dangerouslySetInnerHTML={{ __html: templatePreview.content_html }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">纯文本</p>
                      <pre className="border rounded-md bg-gray-50 p-3 text-xs whitespace-pre-wrap min-h-[160px]">
                        {stripHtml(templatePreview.content_html)}
                      </pre>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-md text-xs bg-indigo-600 text-white"
                      onClick={() => {
                        setSelectedScenario(templatePreview.scenario_id)
                        setTemplatePreview(null)
                        setSelectedScenario(templatePreview.scenario_id)
                        setTemplateFilterRole(templatePreview.role as any)
                      }}
                    >
                      设为默认角色参考
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-md text-xs border"
                      onClick={() => setTemplatePreview(null)}
                    >
                      关闭预览
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

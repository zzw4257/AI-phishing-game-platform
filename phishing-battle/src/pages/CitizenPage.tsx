import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ClipboardList, Scale, Trophy } from 'lucide-react'
import Layout from '../components/Layout'
import { fetchCurrentRound, fetchMailbox, fetchStatistics, submitJudgement } from '../lib/api'
import type { MailboxMessage, Player, Round, ScoreboardEntry } from '../types/game'
import { describeStatus } from '../lib/stage'

const fallbackHtml = (text: string) => text.replace(/\n/g, '<br/>')

export default function CitizenPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const player = location.state?.player as Player | undefined
  const [round, setRound] = useState<Round | null>(null)
  const [mailbox, setMailbox] = useState<MailboxMessage[]>([])
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[]>([])
  const [selected, setSelected] = useState<Record<string, 'trust' | 'suspect'>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const stageMeta = describeStatus(round?.status)
  const canVote = !!(round && ['judging', 'retro'].includes(round.status))

  useEffect(() => {
    if (!player) return
    loadAll()
    const interval = setInterval(loadAll, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id])

  const loadAll = async () => {
    try {
      const [roundRes, statsRes] = await Promise.all([fetchCurrentRound(), fetchStatistics()])
      setRound(roundRes.round)
      setScoreboard(statsRes.scoreboard)
      if (roundRes.round && player) {
        await loadMailbox(roundRes.round.id, player.id)
      } else {
        setMailbox([])
        setActiveMessageId(null)
      }
    } catch (error) {
      console.error('加载数据失败', error)
    }
  }

  const loadMailbox = async (roundId: string, playerId: string) => {
    try {
      const response = await fetchMailbox(roundId, playerId)
      setMailbox(response.mailbox)
      if (!activeMessageId && response.mailbox.length > 0) {
        setActiveMessageId(response.mailbox[0].message.id)
      }
      const selectedMap: Record<string, 'trust' | 'suspect'> = {}
      const noteMap: Record<string, string> = {}
      response.mailbox.forEach((item) => {
        if (item.judgement) {
          selectedMap[item.message.id] = item.judgement.verdict
          if (item.judgement.reasoning) {
            noteMap[item.message.id] = item.judgement.reasoning
          }
        }
      })
      setSelected(selectedMap)
      setNotes((prev) => ({ ...noteMap, ...prev }))
    } catch (error) {
      console.error('加载邮箱失败', error)
    }
  }

  const handleVote = async (messageId: string, verdict: 'trust' | 'suspect') => {
    if (!round || !player) return
    if (!canVote) {
      alert('信息判断阶段尚未开始')
      return
    }
    setPendingId(messageId)
    try {
      const response = await submitJudgement({
        roundId: round.id,
        messageId,
        playerId: player.id,
        verdict,
        reasoning: notes[messageId]
      })
      setRound(response.round)
      setSelected((prev) => ({ ...prev, [messageId]: verdict }))
    } catch (error: any) {
      alert(error.message || '提交失败')
    } finally {
      setPendingId(null)
    }
  }

  if (!player) {
    return (
      <Layout role="citizen">
        <div className="px-4 py-12 text-center space-y-4">
          <p className="text-gray-600">未检测到身份信息，请重新登录。</p>
          <button onClick={() => navigate('/')} className="text-blue-600 underline text-sm">
            回到首页
          </button>
        </div>
      </Layout>
    )
  }

  const activeMessage = mailbox.find((item) => item.message.id === activeMessageId)

  return (
    <Layout role="citizen">
      <div className="px-4 space-y-6">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">信息鉴定实验室</p>
              <h1 className="text-2xl font-bold text-gray-900">{player.name}，请判断每封邮件的真伪</h1>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{round ? `第 ${round.round_number} 回合` : '等待主持人开启新回合'}</p>
              <span className={`inline-flex items-center mt-2 px-3 py-1 text-xs font-semibold rounded-full ${stageMeta.badge}`}>
                {stageMeta.label}
              </span>
            </div>
          </div>

          {round ? (
            <>
              <div className="border rounded-lg p-4 bg-gray-50 mb-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">场景线索</h2>
                <p className="text-sm text-gray-600">{round.scenario.background}</p>
                <p className="text-xs text-gray-500 mt-2">提示：每轮至少有一封真实通知与一封钓鱼邮件，保持怀疑精神。</p>
              </div>
              {round.challenge_card && (
                <div className="border rounded-lg p-4 bg-amber-50/80 border-amber-200 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                      挑战卡：{round.challenge_card.name}
                    </div>
                    <span className="text-xs font-semibold text-amber-700">{round.challenge_card.pressure}</span>
                  </div>
                  <p className="text-sm text-amber-900 mb-2">{round.challenge_card.summary}</p>
                  <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
                    {round.challenge_card.citizen_hints.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="border rounded-lg divide-y max-h-[520px] overflow-y-auto">
                {mailbox.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">钓鱼大师与城市领袖尚未发送邮件。</p>
                ) : (
                  mailbox.map((item) => {
                    const verdict = selected[item.message.id]
                    return (
                      <button
                        key={item.message.id}
                        onClick={() => setActiveMessageId(item.message.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                          activeMessageId === item.message.id ? 'bg-gray-50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{item.message.from_alias || item.author.name}</span>
                          <span>{new Date(item.message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.message.subject}</p>
                        <p className="text-xs text-gray-500 truncate">{item.message.body}</p>
                        {verdict && (
                          <span className={`inline-flex mt-1 px-2 py-0.5 text-xs rounded-full ${verdict === 'trust' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {verdict === 'trust' ? '已判定：可信' : '已判定：存疑'}
                          </span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
              <div className="lg:col-span-2 border rounded-lg p-4 bg-gray-50 min-h-[420px]">
                {activeMessage ? (
                  <>
                    <div className="mb-3">
                      <p className="text-xs text-gray-500">来自：{activeMessage.message.from_alias || activeMessage.author.name}</p>
                      <h2 className="text-xl font-semibold text-gray-900">{activeMessage.message.subject}</h2>
                    </div>
                    <div
                      className="bg-white border rounded-lg p-4 min-h-[220px] text-sm"
                      dangerouslySetInnerHTML={{
                        __html: activeMessage.message.content_html || fallbackHtml(activeMessage.message.body)
                      }}
                    />
                    {activeMessage.message.attachments?.length > 0 && (
                      <div className="mt-3 text-sm">
                        <p className="font-semibold text-gray-700 mb-1">附件占位：</p>
                        <ul className="list-disc list-inside text-gray-600">
                          {activeMessage.message.attachments.map((att, idx) => (
                            <li key={idx}>
                              {att.name}
                              {att.description ? ` - ${att.description}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-4 space-y-2">
                      <label className="text-xs text-gray-600">判断依据 (可选)</label>
                      <textarea
                        value={notes[activeMessage.message.id] || ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [activeMessage.message.id]: e.target.value }))}
                        rows={3}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                        placeholder="记录你发现的漏洞、语气或证据…"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleVote(activeMessage.message.id, 'trust')}
                          disabled={!canVote || pendingId === activeMessage.message.id}
                          className={`flex-1 px-3 py-2 rounded-md text-sm border ${
                            selected[activeMessage.message.id] === 'trust'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'border-gray-300 bg-white text-gray-700'
                          } ${!canVote ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <CheckCircle2 className="h-4 w-4 inline mr-1" />
                          可信
                        </button>
                        <button
                          onClick={() => handleVote(activeMessage.message.id, 'suspect')}
                          disabled={!canVote || pendingId === activeMessage.message.id}
                          className={`flex-1 px-3 py-2 rounded-md text-sm border ${
                            selected[activeMessage.message.id] === 'suspect'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'border-gray-300 bg-white text-gray-700'
                          } ${!canVote ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <AlertTriangle className="h-4 w-4 inline mr-1" />
                          存疑
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">尚未收到邮件。</p>
                )}
              </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">请等待主持人启动新回合。</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              拆解线索小抄
            </h3>
            <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
              <li>核对域名是否为 .gov.cn/.org.cn，谨防商城域名伪装。</li>
              <li>真实机构会说明法律条款、申报窗口与回拨电话。</li>
              <li>警惕“限时奖励”“加急费”“前1万名”等诱导话术。</li>
              <li>多问一句：若我是钓鱼大师，还能怎样改进骗术？</li>
            </ul>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-blue-600" />
              实时排行榜 (前五名)
            </h3>
            <div className="divide-y text-sm">
              {scoreboard.slice(0, 5).map((entry, index) => (
                <div key={entry.id} className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-semibold text-gray-500">#{index + 1}</span>
                    <span className="text-gray-800">{entry.name}</span>
                  </div>
                  <span className="font-semibold text-blue-600">{entry.points ?? 0} 分</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              计分规则：识别真实/钓鱼各 +1 分；若被钓鱼或误伤官方，则该轮不得分。
            </p>
          </div>
        </div>

        {round && round.judgements.length > 0 && (
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Scale className="h-5 w-5 text-emerald-600" />
              集体判断走势
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {['phisher', 'leader'].map((role) => {
                const votesForRole = round.judgements.filter((j) => j.message_role === role)
                if (votesForRole.length === 0) {
                  return (
                    <div key={role} className="p-4 border rounded-lg text-gray-500">
                      等待 {role === 'phisher' ? '钓鱼邮件' : '官方通知'} 判断
                    </div>
                  )
                }
                const trust = votesForRole.filter((j) => j.verdict === 'trust').length
                const suspect = votesForRole.length - trust
                return (
                  <div key={role} className="p-4 border rounded-lg">
                    <p className="font-medium text-gray-700 mb-2">{role === 'phisher' ? '钓鱼邮件' : '官方通知'}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-600">信任：{trust}</span>
                      <span className="text-rose-600">存疑：{suspect}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

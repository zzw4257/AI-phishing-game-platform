import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Clock, Mail, Shield, Palette, Send, Sparkles, Copy, Replace } from 'lucide-react'
import Layout from '../components/Layout'
import { askAssistant, fetchCurrentRound, fetchTemplates, submitMessage } from '../lib/api'
import type { AssistantSuggestion, EmailTemplate, Player, Round } from '../types/game'
import { describeStatus } from '../lib/stage'

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

export default function PhisherPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const player = location.state?.player as Player | undefined
  const [round, setRound] = useState<Round | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [fromAlias, setFromAlias] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [distributionType, setDistributionType] = useState<'broadcast' | 'groups' | 'direct'>('broadcast')
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['citizen'])
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [attachments, setAttachments] = useState<Array<{ name: string; description?: string }>>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [assistantInstructions, setAssistantInstructions] = useState('')
  const [assistantOutput, setAssistantOutput] = useState('')
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantSuggestion, setAssistantSuggestion] = useState<AssistantSuggestion | null>(null)

  useEffect(() => {
    if (!player) return
    loadRound()
    const interval = setInterval(loadRound, 4000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id])

  const loadRound = async () => {
    try {
      const response = await fetchCurrentRound()
      const fetched = response.round
      setRound(fetched)
      if (fetched?.id !== roundId) {
        setRoundId(fetched?.id || null)
        setDirty(false)
      }
      if (fetched) {
        const message = fetched.messages.find((m) => m.role === 'phisher')
        const shouldSync = !dirty || fetched.status !== 'drafting'
        if (message && shouldSync) {
          setSubject(message.subject)
          setBody(message.body)
          setContentHtml(message.content_html || '')
          setFromAlias(message.from_alias || '')
          setDistributionType((message.distribution_type as any) || 'broadcast')
          if (message.recipient_descriptor) {
            setSelectedRoles(message.recipient_descriptor.roles || [])
            setSelectedPlayerIds(message.recipient_descriptor.playerIds || [])
          } else {
            setSelectedRoles(['citizen'])
            setSelectedPlayerIds([])
          }
          setAttachments(Array.isArray(message.attachments) ? message.attachments : [])
        }
        if (fetched.scenario_id) {
          const templateRes = await fetchTemplates({ scenarioId: fetched.scenario_id, role: 'phisher' })
          setTemplates(templateRes.templates)
        }
      }
    } catch (error) {
      console.error('加载回合失败', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!round || !player) return
    if (!subject.trim() || (!body.trim() && !contentHtml.trim())) {
      alert('请完善邮件主题或 HTML 内容')
      return
    }
    if (distributionType === 'groups' && selectedRoles.length === 0) {
      alert('请选择至少一个收件群体')
      return
    }
    if (distributionType === 'direct' && selectedPlayerIds.length === 0) {
      alert('请选择至少一个收件人')
      return
    }
    setSaving(true)
    try {
      const response = await submitMessage({
        roundId: round.id,
        authorId: player.id,
        subject,
        body,
        contentHtml,
        fromAlias,
        distribution: {
          type: distributionType === 'groups' ? 'groups' : distributionType,
          roles: distributionType === 'groups' ? selectedRoles : [],
          playerIds: distributionType === 'direct' ? selectedPlayerIds : []
        },
        attachments
      })
      setRound(response.round)
      alert('钓鱼邮件已提交，等待市民判断')
      setDirty(false)
    } catch (error: any) {
      alert(error.message || '提交失败')
    } finally {
      setSaving(false)
    }
  }

  const assignment = useMemo(() => {
    if (!round || !player) return null
    return round.participants.find((p) => p.player_id === player.id)
  }, [round, player])

  const message = round?.messages.find((m) => m.role === 'phisher')
  const myVotes = round?.judgements.filter((j) => j.message_role === 'phisher') || []
  const stageMeta = describeStatus(round?.status)

  if (!player) {
    return (
      <Layout role="phisher">
        <div className="px-4 py-12 text-center space-y-4">
          <p className="text-gray-600">未检测到身份信息，请重新登录。</p>
          <button onClick={() => navigate('/')} className="text-blue-600 underline text-sm">
            回到首页
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout role="phisher">
      <div className="px-4 space-y-6">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">钓鱼大师行动面板</p>
              <h1 className="text-2xl font-bold text-gray-900">{player.name}，伪装你的权威身份</h1>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{round ? `第 ${round.round_number} 回合` : '等待主持人开启新回合'}</p>
              <span className={`inline-flex items-center mt-2 px-3 py-1 text-xs font-semibold rounded-full ${stageMeta.badge}`}>
                {stageMeta.label}
              </span>
            </div>
          </div>
          {round ? (
            assignment?.role === 'phisher' ? (
              <div className="space-y-4">
                {round.status !== 'drafting' && (
                  <div className="border border-amber-200 bg-amber-50 text-amber-700 rounded-lg p-3 text-sm">
                    当前处于 {stageMeta.label}，草稿已锁定，仅可查看市民判断结果。
                  </div>
                )}
                <div className="border rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">场景简介</h2>
                  <p className="text-sm text-gray-600 mb-3">{round.scenario.background}</p>
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-4">
                    <div className="flex items-center gap-2 text-rose-700 mb-2">
                      <AlertTriangle className="h-5 w-5" />
                      本回合任务
                    </div>
                    <p className="text-sm text-rose-900">{round.scenario.phisher_task}</p>
                  </div>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center gap-2 text-gray-600 mb-2">
                    <Shield className="h-4 w-4" />
                    市民洞察提示 (你需规避这些)
                  </div>
                  <p className="text-sm text-gray-700">{round.scenario.risk_hints}</p>
                </div>

                {round.challenge_card && (
                  <div className="border rounded-lg p-4 bg-rose-50/60 border-rose-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-rose-700">
                        <Clock className="h-4 w-4" />
                        挑战卡：{round.challenge_card.name}
                      </div>
                      <span className="text-xs font-semibold text-rose-600">{round.challenge_card.pressure}</span>
                    </div>
                    <p className="text-sm text-rose-900 mb-2">{round.challenge_card.summary}</p>
                    <ul className="list-disc list-inside text-sm text-rose-800 space-y-1">
                      {round.challenge_card.phisher_objectives.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {templates.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Palette className="h-4 w-4 text-rose-600" />
                        钓鱼模板库
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {templates.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          disabled={round.status !== 'drafting'}
                          onClick={() => {
                            setSubject(tpl.subject)
                            setContentHtml(tpl.content_html)
                            setBody(stripHtml(tpl.content_html))
                            setDirty(true)
                          }}
                          className="text-left border rounded-lg p-3 hover:border-rose-400 disabled:opacity-60"
                        >
                          <p className="text-xs text-gray-500 mb-1">{tpl.difficulty || 'normal'}</p>
                          <p className="font-semibold text-gray-900">{tpl.title}</p>
                          <p className="text-sm text-gray-600 line-clamp-2 mt-1">{stripHtml(tpl.content_html)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border rounded-lg p-4 bg-white/80 space-y-3">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Sparkles className="h-4 w-4 text-rose-600" />
                    AI 小助手 · qwen3:latest
                  </div>
                  <p className="text-xs text-gray-500">
                    描述你需要的改写 / HTML 化 / 诱导策略，助手会结合场景与挑战卡给出黑盒建议。
                  </p>
                  <textarea
                    value={assistantInstructions}
                    onChange={(e) => setAssistantInstructions(e.target.value)}
                    placeholder="示例：把以下话术改成更具威胁感的 HTML，强调限时奖励并伪造公安授权…"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!roundId) {
                          alert('当前没有进行中的回合')
                          return
                        }
                        setAssistantLoading(true)
                        try {
                          const res = await askAssistant({
                            role: 'phisher',
                            roundId,
                            instructions: assistantInstructions,
                            draft: { subject, body, contentHtml }
                          })
                          setAssistantOutput(res.output)
                          setAssistantSuggestion(res.suggestion || null)
                        } catch (error: any) {
                          alert(error.message || '助手暂时不可用')
                        } finally {
                          setAssistantLoading(false)
                        }
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-sm rounded-md hover:bg-rose-700 disabled:bg-gray-400"
                      disabled={!roundId || assistantLoading}
                    >
                      <Sparkles className="h-4 w-4" />
                      {assistantLoading ? '生成中…' : '生成建议'}
                    </button>
                    {assistantSuggestion && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setContentHtml(assistantSuggestion.htmlBody || '')
                            setBody(stripHtml(assistantSuggestion.htmlBody || assistantSuggestion.textBody || ''))
                            setDirty(true)
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md text-gray-700 hover:border-rose-300"
                        >
                          <Replace className="h-4 w-4" />
                          用 AI HTML 正文
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBody(assistantSuggestion.textBody || stripHtml(assistantSuggestion.htmlBody || ''))
                            setDirty(true)
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md text-gray-700 hover:border-rose-300"
                        >
                          <Replace className="h-4 w-4" />
                          用纯文本正文
                        </button>
                      </>
                    )}
                    {assistantOutput && !assistantSuggestion && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setContentHtml(assistantOutput)
                            setBody(stripHtml(assistantOutput))
                            setDirty(true)
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md text-gray-700 hover:border-rose-300"
                        >
                          <Replace className="h-4 w-4" />
                          用作 HTML 正文
                        </button>
                        <button
                          type="button"
                          onClick={() => navigator?.clipboard?.writeText(assistantOutput)}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md text-gray-700 hover:border-rose-300"
                        >
                          <Copy className="h-4 w-4" />
                          复制
                        </button>
                      </>
                    )}
                  </div>
                  {assistantSuggestion && (
                    <div className="space-y-3 border rounded-lg bg-gray-50 p-3 max-h-80 overflow-y-auto text-sm text-gray-800">
                      {assistantSuggestion.strategy?.length > 0 && (
                        <div>
                          <p className="font-semibold text-gray-900 mb-1">策略建议</p>
                          <ul className="list-disc list-inside space-y-1">
                            {assistantSuggestion.strategy.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {assistantSuggestion.subjectIdeas?.map((idea) => (
                          <button
                            key={idea}
                            type="button"
                            onClick={() => {
                              setSubject(idea)
                              setDirty(true)
                            }}
                            className="px-3 py-1.5 text-xs rounded-full border border-rose-200 text-rose-700"
                          >
                            {idea}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {assistantSuggestion.fromAliasIdeas?.map((idea) => (
                          <button
                            key={idea}
                            type="button"
                            onClick={() => {
                              setFromAlias(idea)
                              setDirty(true)
                            }}
                            className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-700"
                          >
                            {idea}
                          </button>
                        ))}
                        {assistantSuggestion.replyToIdeas?.map((idea) => (
                          <button
                            key={idea}
                            type="button"
                            onClick={() => {
                              setReplyTo(idea)
                              setDirty(true)
                            }}
                            className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-700"
                          >
                            Reply-To: {idea}
                          </button>
                        ))}
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">HTML 预览</p>
                        <div className="border rounded-md bg-white p-3 text-xs" dangerouslySetInnerHTML={{ __html: assistantSuggestion.htmlBody || '' }} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">纯文本预览</p>
                        <pre className="border rounded-md bg-white p-3 text-xs whitespace-pre-wrap">{assistantSuggestion.textBody}</pre>
                      </div>
                    </div>
                  )}
                  {assistantOutput && !assistantSuggestion && (
                    <div className="border rounded-lg bg-gray-50 p-3 max-h-64 overflow-y-auto text-xs text-gray-800">
                      <div dangerouslySetInnerHTML={{ __html: assistantOutput }} />
                    </div>
                  )}
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-rose-600" />
                      设计你的邮件
                    </h3>
                    <span className="inline-flex items-center text-xs text-gray-500">
                      <Clock className="h-3 w-3 mr-1" />
                      {round.status === 'drafting' ? '撰写阶段开放' : '判断阶段进行中'}
                    </span>
                  </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm text-gray-600">发件人别名</label>
                          <input
                            type="text"
                            value={fromAlias}
                            onChange={(e) => {
                              setFromAlias(e.target.value)
                              setDirty(true)
                            }}
                            disabled={round.status !== 'drafting'}
                            placeholder="例如：赛博城卫健委"
                            className="w-full mt-1 border rounded-md px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-gray-600">Reply-To（可选）</label>
                          <input
                            type="email"
                            value={replyTo}
                            onChange={(e) => {
                              setReplyTo(e.target.value)
                              setDirty(true)
                            }}
                            disabled={round.status !== 'drafting'}
                            placeholder="report@saibo.gov.cn"
                            className="w-full mt-1 border rounded-md px-3 py-2"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">邮件主题</label>
                        <input
                        type="text"
                        value={subject}
                        onChange={(e) => {
                          setSubject(e.target.value)
                          setDirty(true)
                        }}
                        disabled={round.status !== 'drafting'}
                        className="w-full mt-1 border rounded-md px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">邮件正文</label>
                      <textarea
                        value={body}
                        onChange={(e) => {
                          setBody(e.target.value)
                          setDirty(true)
                        }}
                        disabled={round.status !== 'drafting'}
                        rows={10}
                        className="w-full mt-1 border rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">HTML 内容（可选）</label>
                      <textarea
                        value={contentHtml}
                        onChange={(e) => {
                          setContentHtml(e.target.value)
                          setDirty(true)
                        }}
                        disabled={round.status !== 'drafting'}
                        rows={8}
                        className="w-full mt-1 border rounded-md px-3 py-2 text-sm font-mono"
                        placeholder="<p>……</p>"
                      />
                    </div>
                    <div className="border rounded-md p-3 bg-gray-50">
                      <p className="text-sm font-semibold text-gray-700 mb-2">实时预览</p>
                      <div className="bg-white border rounded-lg p-4 text-sm min-h-[120px]" dangerouslySetInnerHTML={{ __html: contentHtml || body.replace(/\n/g, '<br/>') }} />
                    </div>
                    <div className="border rounded-md p-3">
                      <p className="text-sm font-semibold text-gray-700 mb-2">附件占位</p>
                      {attachments.length === 0 && <p className="text-xs text-gray-500 mb-2">可添加伪造的 PDF/二维码描述等。</p>}
                      <div className="space-y-2">
                        {attachments.map((att, index) => (
                          <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <input
                              className="border rounded-md px-2 py-1 text-sm md:col-span-1"
                              placeholder="附件名称"
                              value={att.name}
                              disabled={round.status !== 'drafting'}
                              onChange={(e) => {
                                const next = [...attachments]
                                next[index] = { ...next[index], name: e.target.value }
                                setAttachments(next)
                                setDirty(true)
                              }}
                            />
                            <input
                              className="border rounded-md px-2 py-1 text-sm md:col-span-3"
                              placeholder="描述 / 伪造说明"
                              value={att.description || ''}
                              disabled={round.status !== 'drafting'}
                              onChange={(e) => {
                                const next = [...attachments]
                                next[index] = { ...next[index], description: e.target.value }
                                setAttachments(next)
                                setDirty(true)
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      {round.status === 'drafting' && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAttachments([...attachments, { name: '' }])
                              setDirty(true)
                            }}
                            className="text-xs px-3 py-1 border rounded-md"
                          >
                            + 添加附件
                          </button>
                          {attachments.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setAttachments(attachments.slice(0, -1))
                                setDirty(true)
                              }}
                              className="text-xs px-3 py-1 border rounded-md"
                            >
                              移除最后一个
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="border rounded-md p-3 bg-gray-50 space-y-3">
                      <p className="text-sm font-semibold text-gray-700">收件人设置</p>
                      <div className="flex flex-wrap gap-3 text-sm">
                        {[
                          { value: 'broadcast', label: '广播所有参与者' },
                          { value: 'groups', label: '按角色群组' },
                          { value: 'direct', label: '定向单播' }
                        ].map((option) => (
                          <label key={option.value} className="flex items-center gap-1">
                            <input
                              type="radio"
                              checked={distributionType === option.value}
                              disabled={round.status !== 'drafting'}
                              onChange={() => {
                                setDistributionType(option.value as any)
                                setDirty(true)
                              }}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                      {distributionType === 'groups' && (
                        <div className="flex gap-3 text-sm">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={selectedRoles.includes('citizen')}
                              disabled={round.status !== 'drafting'}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? Array.from(new Set([...selectedRoles, 'citizen']))
                                  : selectedRoles.filter((role) => role !== 'citizen')
                                setSelectedRoles(next)
                                setDirty(true)
                              }}
                            />
                            仅市民
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={selectedRoles.includes('leader')}
                              disabled={round.status !== 'drafting'}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? Array.from(new Set([...selectedRoles, 'leader']))
                                  : selectedRoles.filter((role) => role !== 'leader')
                                setSelectedRoles(next)
                                setDirty(true)
                              }}
                            />
                            城市领袖
                          </label>
                        </div>
                      )}
                      {distributionType === 'direct' && (
                        <div className="space-y-1 text-sm">
                          <p className="text-gray-500">选择目标市民（多选）：</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {round.participants
                              .filter((p) => p.player_id !== player.id)
                              .map((p) => (
                                <label key={p.player_id} className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    disabled={round.status !== 'drafting'}
                                    checked={selectedPlayerIds.includes(p.player_id)}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...selectedPlayerIds, p.player_id]
                                        : selectedPlayerIds.filter((id) => id !== p.player_id)
                                      setSelectedPlayerIds(next)
                                      setDirty(true)
                                    }}
                                  />
                                  {p.name}（{p.role === 'citizen' ? '市民' : '其他'}
                                  )
                                </label>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={round.status !== 'drafting' || saving}
                      className="w-full bg-rose-600 text-white py-2 rounded-md hover:bg-rose-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                    >
                      {saving ? '提交中…' : (
                        <>
                          <Send className="h-4 w-4" />
                          提交钓鱼邮件
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {message && (
                  <div className="border rounded-lg p-4 bg-white">
                    <h3 className="font-semibold text-gray-900 mb-2">市民判断结果</h3>
                    {myVotes.length === 0 ? (
                      <p className="text-sm text-gray-500">等待普通市民做出判断…</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {myVotes.map((vote) => (
                          <li key={vote.id} className="flex justify-between items-center">
                            <span className="text-gray-600">
                              {vote.name}：{vote.verdict === 'trust' ? '被你迷惑' : '识破了骗局'}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full ${vote.verdict === 'trust' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {vote.verdict === 'trust' ? '+2 分' : '0 分'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">当前回合未分配到钓鱼大师身份，请留意主持人指令。</p>
            )
          ) : loading ? (
            <p className="text-sm text-gray-500">等待主持人创建回合…</p>
          ) : (
            <p className="text-sm text-gray-500">暂无进行中的回合。</p>
          )}
        </div>
      </div>
    </Layout>
  )
}

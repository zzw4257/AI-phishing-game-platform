import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Crown, ClipboardList, Mail, Shield, Users, Palette, Send, Sparkles, Replace, Copy } from 'lucide-react'
import Layout from '../components/Layout'
import { askAssistant, fetchCurrentRound, fetchTemplates, submitMessage } from '../lib/api'
import type { EmailTemplate, Player, Round } from '../types/game'
import { describeStatus } from '../lib/stage'

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

export default function CityLeaderPage() {
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
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [assistantInstructions, setAssistantInstructions] = useState('')
  const [assistantOutput, setAssistantOutput] = useState('')
  const [assistantLoading, setAssistantLoading] = useState(false)

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
        const message = fetched.messages.find((m) => m.role === 'leader')
        const shouldSync = !dirty || fetched.status !== 'drafting'
        if (message && shouldSync) {
          setSubject(message.subject)
          setBody(message.body)
          setContentHtml(message.content_html || '')
          setFromAlias(message.from_alias || '')
          setReplyTo(message.reply_to || '')
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
          const tplRes = await fetchTemplates({ scenarioId: fetched.scenario_id, role: 'leader' })
          setTemplates(tplRes.templates)
        }
      }
    } catch (error) {
      console.error('加载数据失败', error)
    } finally {
      setLoading(false)
    }
  }

  const assignment = useMemo(() => {
    if (!round || !player) return null
    return round.participants.find((p) => p.player_id === player.id)
  }, [round, player])

  const message = round?.messages.find((m) => m.role === 'leader')
  const votes = round?.judgements.filter((j) => j.message_role === 'leader') || []
  const stageMeta = describeStatus(round?.status)

  const handleSubmit = async () => {
    if (!round || !player) return
    if (!subject.trim() || (!body.trim() && !contentHtml.trim())) {
      alert('请填写通知主题与正文/HTML')
      return
    }
    if (distributionType === 'groups' && selectedRoles.length === 0) {
      alert('请选择至少一个群体')
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
        replyTo,
        distribution: {
          type: distributionType === 'groups' ? 'groups' : distributionType,
          roles: distributionType === 'groups' ? selectedRoles : [],
          playerIds: distributionType === 'direct' ? selectedPlayerIds : []
        },
        attachments
      })
      setRound(response.round)
      alert('官方通知已提交，等待市民判断')
      setDirty(false)
    } catch (error: any) {
      alert(error.message || '提交失败')
    } finally {
      setSaving(false)
    }
  }

  if (!player) {
    return (
      <Layout role="leader">
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
    <Layout role="leader">
      <div className="px-4 space-y-6">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">城市领袖指挥台</p>
              <h1 className="text-2xl font-bold text-gray-900">{player.name}，请稳定赛博城民心</h1>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{round ? `第 ${round.round_number} 回合` : '等待主持人开启新回合'}</p>
              <span className={`inline-flex items-center mt-2 px-3 py-1 text-xs font-semibold rounded-full ${stageMeta.badge}`}>
                {stageMeta.label}
              </span>
            </div>
          </div>

          {round ? (
            assignment?.role === 'leader' ? (
              <div className="space-y-4">
                {round.status !== 'drafting' && (
                  <div className="border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg p-3 text-sm">
                    当前阶段是 {stageMeta.label}，草稿已锁定，可等待市民判断并准备复盘要点。
                  </div>
                )}
                <div className="border rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">场景背景</h2>
                  <p className="text-sm text-gray-600 mb-3">{round.scenario.background}</p>
                  <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4">
                    <div className="flex items-center gap-2 text-indigo-700 mb-2">
                      <Crown className="h-5 w-5" />
                      本回合任务
                    </div>
                    <p className="text-sm text-indigo-900">{round.scenario.city_leader_task}</p>
                  </div>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center gap-2 text-gray-600 mb-2">
                    <ClipboardList className="h-4 w-4" />
                    规范提醒
                  </div>
                  <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                    <li>引用真实条例与来源，清晰给出申报流程。</li>
                    <li>明确数据访问范围，强调隐私保护与求证渠道。</li>
                    <li>引导市民观察域名、印章、回拨电话等验证点。</li>
                  </ul>
                </div>

                {round.challenge_card && (
                  <div className="border rounded-lg p-4 bg-indigo-50/70 border-indigo-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-indigo-700">
                        <Shield className="h-4 w-4" />
                        挑战卡：{round.challenge_card.name}
                      </div>
                      <span className="text-xs font-semibold text-indigo-600">{round.challenge_card.pressure}</span>
                    </div>
                    <p className="text-sm text-indigo-900 mb-2">{round.challenge_card.summary}</p>
                    <ul className="list-disc list-inside text-sm text-indigo-800 space-y-1">
                      {round.challenge_card.leader_objectives.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {templates.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Palette className="h-4 w-4 text-indigo-600" />
                        官方模板库
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
                          className="text-left border rounded-lg p-3 hover:border-indigo-400 disabled:opacity-60"
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
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    AI 小助手 · qwen3:latest
                  </div>
                  <p className="text-xs text-gray-500">
                    描述你的诉求（如：引用法规、将纯文本转 HTML、强化隐私提醒），助手将输出可直接粘贴的官方通知片段。
                  </p>
                  <textarea
                    value={assistantInstructions}
                    onChange={(e) => setAssistantInstructions(e.target.value)}
                    placeholder="示例：请把下面的文本转换成带有法规引用的 HTML，并加入举报电话…"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!roundId) {
                          alert('当前没有正在进行的回合')
                          return
                        }
                        setAssistantLoading(true)
                        try {
                          const res = await askAssistant({
                            role: 'leader',
                            roundId,
                            instructions: assistantInstructions,
                            draft: { subject, body, contentHtml }
                          })
                          setAssistantOutput(res.output)
                        } catch (error: any) {
                          alert(error.message || '助手暂时不可用')
                        } finally {
                          setAssistantLoading(false)
                        }
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
                      disabled={!roundId || assistantLoading}
                    >
                      <Sparkles className="h-4 w-4" />
                      {assistantLoading ? '生成中…' : '生成建议'}
                    </button>
                    {assistantOutput && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setContentHtml(assistantOutput)
                            setBody(stripHtml(assistantOutput))
                            setDirty(true)
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md text-gray-700 hover:border-indigo-300"
                        >
                          <Replace className="h-4 w-4" />
                          用作 HTML 正文
                        </button>
                        <button
                          type="button"
                          onClick={() => navigator?.clipboard?.writeText(assistantOutput)}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md text-gray-700 hover:border-indigo-300"
                        >
                          <Copy className="h-4 w-4" />
                          复制
                        </button>
                      </>
                    )}
                  </div>
                  {assistantOutput && (
                    <div className="border rounded-lg bg-gray-50 p-3 max-h-64 overflow-y-auto text-xs text-gray-800">
                      <div dangerouslySetInnerHTML={{ __html: assistantOutput }} />
                    </div>
                  )}
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-indigo-600" />
                      发布官方通知
                    </h3>
                    <span className="inline-flex items-center text-xs text-gray-500">
                      <Shield className="h-3 w-3 mr-1" />
                      {round.status === 'drafting' ? '撰写阶段开放' : '判断阶段进行中'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-600">通知主题</label>
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
                      <label className="text-sm text-gray-600">通知正文</label>
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
                      {attachments.length === 0 && <p className="text-xs text-gray-500 mb-2">可附政策 PDF、下载表格等描述。</p>}
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
                              placeholder="描述 / 说明"
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
                          { value: 'broadcast', label: '广播全部' },
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
                            市民
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={selectedRoles.includes('phisher')}
                              disabled={round.status !== 'drafting'}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? Array.from(new Set([...selectedRoles, 'phisher']))
                                  : selectedRoles.filter((role) => role !== 'phisher')
                                setSelectedRoles(next)
                                setDirty(true)
                              }}
                            />
                            钓鱼大师
                          </label>
                        </div>
                      )}
                      {distributionType === 'direct' && (
                        <div className="space-y-1 text-sm">
                          <p className="text-gray-500">选择收件人：</p>
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
                                  {p.name}（{p.role === 'citizen' ? '市民' : p.role === 'phisher' ? '钓鱼大师' : '城市领袖'}）
                                </label>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={round.status !== 'drafting' || saving}
                      className="w-full bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                    >
                      {saving ? '提交中…' : (
                        <>
                          <Send className="h-4 w-4" />
                          发布官方通知
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {message && (
                  <div className="border rounded-lg p-4 bg-white">
                    <h3 className="font-semibold text-gray-900 mb-2">市民信任情况</h3>
                    {votes.length === 0 ? (
                      <p className="text-sm text-gray-500">等待市民反馈…</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {votes.map((vote) => (
                          <li key={vote.id} className="flex justify-between items-center">
                            <span className="text-gray-600">
                              {vote.name}：{vote.verdict === 'trust' ? '信任你的通知' : '怀疑该通知'}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full ${vote.verdict === 'trust' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
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
              <p className="text-sm text-gray-500">当前回合未分配到城市领袖身份，请等待下一轮。</p>
            )
          ) : loading ? (
            <p className="text-sm text-gray-500">等待主持人创建回合…</p>
          ) : (
            <p className="text-sm text-gray-500">暂无进行中的回合。</p>
          )}
        </div>

        {round && (
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-emerald-600" />
              参与市民列表
            </h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {round.participants.filter((p) => p.role === 'citizen').map((p) => (
                <span key={p.id} className="px-3 py-1 bg-gray-100 rounded-full text-gray-700">
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

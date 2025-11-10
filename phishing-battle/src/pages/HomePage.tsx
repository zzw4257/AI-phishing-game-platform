import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Shuffle, Target, Users, Trophy, Clock4 } from 'lucide-react'
import Layout from '../components/Layout'
import { fetchCurrentRound, fetchStatistics, login } from '../lib/api'
import type { Player, RoundRole, Round, ScoreboardEntry } from '../types/game'
import { describeStatus } from '../lib/stage'

const roleToPath: Record<RoundRole, string> = {
  phisher: '/phisher',
  leader: '/leader',
  citizen: '/citizen'
}

export default function HomePage() {
  const [studentIdLast4, setStudentIdLast4] = useState('')
  const [loading, setLoading] = useState(false)
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [topPlayers, setTopPlayers] = useState<ScoreboardEntry[]>([])
  const [roundSnapshot, setRoundSnapshot] = useState<Round | null>(null)
  const [summary, setSummary] = useState<{ totalPlayers: number; playedAsPhisher: number; playedAsLeader: number; currentRound: number } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    loadInsights()
  }, [])

  const loadInsights = async () => {
    try {
      const [statsRes, roundRes] = await Promise.all([fetchStatistics(), fetchCurrentRound()])
      setTopPlayers(statsRes.scoreboard.slice(0, 3))
      setSummary(statsRes.summary)
      setRoundSnapshot(roundRes.round)
    } catch (error) {
      console.error('加载概览失败', error)
    } finally {
      setInsightsLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!studentIdLast4.trim()) {
      alert('请输入学号后四位')
      return
    }

    if (studentIdLast4.length !== 4 || !/^[0-9]{4}$/.test(studentIdLast4)) {
      alert('请输入正确的学号后四位数字')
      return
    }

    setLoading(true)
    try {
      const data = await login(studentIdLast4)

      if (data.role === 'admin') {
        navigate('/admin', { state: { identity: 'admin' } })
        return
      }

      const player = data.player as Player
      if (!player) {
        alert('未找到玩家信息，请联系主持人')
        return
      }

      const assignment = (data.assignment || 'citizen') as RoundRole
      const path = roleToPath[assignment] || '/citizen'
      navigate(path, { state: { player, assignment } })
    } catch (error: any) {
      alert(error.message || '登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const infoCards = [
    {
      title: '钓鱼大师 InfoPhisher',
      description: '隐藏身份并伪装成权威机构，设计最具迷惑性的钓鱼邮件与话术，诱导市民泄露信息或缴费。'
    },
    {
      title: '城市领袖 InfoLeader',
      description: '代表官方发布权威通知，引用法律依据澄清事实，帮助市民识别可信渠道并保护数据。'
    },
    {
      title: '普通市民 InfoCitizen',
      description: '在信息迷雾中做出判断，拆解线索、识别漏洞，对每封邮件给出信任或存疑的理由。'
    }
  ]

  const scenarioVisuals = [
    {
      title: '健康图谱补贴场景',
      description: '官方征集基因数据 VS 加急费诱导',
      image: '/assets/info-battle/scenarios/health-subsidy/intro.webp'
    },
    {
      title: '智慧人脸库建设',
      description: '公安安防升级 VS 扫码领奖诈骗',
      image: '/assets/info-battle/scenarios/facial-database/intro.webp'
    },
    {
      title: '疫情流调补录',
      description: '官方流调通告 VS 话费奖励钓鱼',
      image: '/assets/info-battle/scenarios/epidemic-tracing/intro.webp'
    }
  ]

  return (
    <Layout>
      <div className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center mb-12 max-w-4xl mx-auto relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
          <img
            src="/assets/info-battle/hero/hero_city.webp"
            alt="赛博城"
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
          <div className="relative p-8">
            <Shield className="h-20 w-20 mx-auto text-amber-400 mb-4" />
            <h1 className="text-4xl font-bold mb-4">信息战场 · InfoBattle</h1>
            <p className="text-lg text-white/90">
              一款结合钓鱼攻防、事实查验与团队协作的参与式仿真游戏。每位玩家都将轮流体验钓鱼大师与城市领袖，体验信息战的攻守两端。
            </p>
          </div>
        </div>

        <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-8 mb-12">
          <label className="block text-sm font-medium text-gray-700 mb-2">请输入学号后四位</label>
          <input
            type="text"
            value={studentIdLast4}
            onChange={(e) => setStudentIdLast4(e.target.value)}
            maxLength={4}
            placeholder="例如：1234"
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-transparent text-center text-2xl tracking-widest"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLogin()
            }}
          />
          <p className="mt-2 text-sm text-gray-500 text-center">管理员请使用主持人口令</p>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full mt-6 bg-amber-600 text-white py-3 px-4 rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {loading ? '正在校验身份…' : '进入 InfoBattle'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">实时荣誉榜</p>
                <h3 className="text-lg font-semibold text-gray-900">表现最佳的三名玩家</h3>
              </div>
              <Trophy className="h-6 w-6 text-amber-500" />
            </div>
            {insightsLoading ? (
              <p className="text-sm text-gray-500">正在加载最新数据…</p>
            ) : topPlayers.length === 0 ? (
              <p className="text-sm text-gray-500">暂未产生得分，等待第一轮结束。</p>
            ) : (
              <ol className="space-y-3">
                {topPlayers.map((player, index) => (
                  <li key={player.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 text-center text-sm font-semibold ${index === 0 ? 'text-amber-600' : index === 1 ? 'text-gray-500' : 'text-yellow-700'}`}>
                        #{index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{player.name}</p>
                        <p className="text-xs text-gray-500">{player.student_id}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-indigo-600">{player.points ?? 0} 分</span>
                  </li>
                ))}
              </ol>
            )}
            {summary && (
              <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500">已加入</p>
                  <p className="text-lg font-semibold text-gray-900">{summary.totalPlayers}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">体验钓鱼大师</p>
                  <p className="text-lg font-semibold text-gray-900">{summary.playedAsPhisher}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">体验城市领袖</p>
                  <p className="text-lg font-semibold text-gray-900">{summary.playedAsLeader}</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">当前战局</p>
                <h3 className="text-lg font-semibold text-gray-900">最新回合速览</h3>
              </div>
              <Clock4 className="h-6 w-6 text-blue-500" />
            </div>
            {roundSnapshot ? (
              <>
                <p className="text-sm text-gray-500 mb-1">第 {roundSnapshot.round_number} 回合 · {roundSnapshot.scenario.name}</p>
                <div className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full mb-3 bg-indigo-50 text-indigo-700">
                  {describeStatus(roundSnapshot.status).label}
                </div>
                <p className="text-sm text-gray-600 mb-3">{describeStatus(roundSnapshot.status).hint}</p>
                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4 leading-relaxed">
                  {roundSnapshot.scenario.background}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">等待主持人开启第一轮信息战。</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {infoCards.map((card) => (
            <div key={card.title} className="bg-white rounded-xl shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-2">{card.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{card.description}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center mb-4 text-blue-700">
              <Shuffle className="h-5 w-5 mr-2" />
              <h3 className="font-semibold">回合机制</h3>
            </div>
            <ul className="text-sm text-blue-800 space-y-2">
              <li>主持人随机抽取场景，系统保留任务说明与法律条款。</li>
              <li>钓鱼大师 & 城市领袖拥有 5 分钟撰写邮件，普通市民 10 分钟做出判断。</li>
              <li>系统记录每名玩家扮演钓鱼大师/城市领袖的次数，确保人人两面都体验。</li>
            </ul>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6">
            <div className="flex items-center mb-4 text-emerald-700">
              <Target className="h-5 w-5 mr-2" />
              <h3 className="font-semibold">判断与得分</h3>
            </div>
            <ul className="text-sm text-emerald-800 space-y-2">
              <li>普通市民：识别真实信息 +1 分，识别钓鱼信息 +1 分。</li>
              <li>钓鱼大师：每迷惑一名市民 +2 分；城市领袖被正确信任 +2 分。</li>
              <li>所有回合结束后，系统生成排行榜与复盘记录。</li>
            </ul>
          </div>
        </div>

        <div className="mt-12">
          <div className="flex items-center mb-4">
            <Users className="h-5 w-5 mr-3 text-gray-700" />
            <h3 className="text-xl font-semibold text-gray-900">赛博城场景示例</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {scenarioVisuals.map((visual) => (
              <div key={visual.title} className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="h-40 bg-gray-200">
                  <img src={visual.image} alt={visual.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-4">
                  <p className="font-semibold text-gray-900">{visual.title}</p>
                  <p className="text-sm text-gray-600">{visual.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}

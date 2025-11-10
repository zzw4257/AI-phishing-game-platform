import type { Round } from '../types/game'

export const roundStatusMeta: Record<Round['status'], { label: string; hint: string; badge: string }> = {
  drafting: {
    label: '任务设计阶段',
    hint: '钓鱼大师与城市领袖有 5 分钟时间完成邮件草稿',
    badge: 'bg-amber-100 text-amber-700'
  },
  judging: {
    label: '信息判断阶段',
    hint: '普通市民分析两封邮件并提交可信/存疑结果',
    badge: 'bg-blue-100 text-blue-700'
  },
  retro: {
    label: '复盘阶段',
    hint: '主持人带领大家拆解话术与识别线索',
    badge: 'bg-emerald-100 text-emerald-700'
  },
  completed: {
    label: '回合已归档',
    hint: '可以开启下一轮或导出总结',
    badge: 'bg-gray-100 text-gray-600'
  }
}

export function describeStatus(status?: Round['status']) {
  if (!status) {
    return { label: '尚未开始', hint: '等待主持人开启新回合', badge: 'bg-gray-100 text-gray-600' }
  }
  return roundStatusMeta[status]
}

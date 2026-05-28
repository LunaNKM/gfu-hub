import type { CampaignInsightAsset, CampaignMetaInsightSnapshot } from '@/types/campaignMeta'

type InsightAssetDraft = Omit<CampaignInsightAsset, 'id' | 'createdAt' | 'updatedAt'>

// ── Helpers ───────────────────────────────────────────────────────

function fmtN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function sumField(snapshots: CampaignMetaInsightSnapshot[], field: keyof CampaignMetaInsightSnapshot): number {
  return snapshots.reduce((acc, s) => acc + (typeof s[field] === 'number' ? (s[field] as number) : 0), 0)
}

function weightedAvg(
  snapshots: CampaignMetaInsightSnapshot[],
  field: keyof CampaignMetaInsightSnapshot,
  weightField: keyof CampaignMetaInsightSnapshot
): number {
  const totalWeight = sumField(snapshots, weightField)
  if (totalWeight === 0) return 0
  const weighted = snapshots.reduce((acc, s) => {
    const v = typeof s[field] === 'number' ? (s[field] as number) : 0
    const w = typeof s[weightField] === 'number' ? (s[weightField] as number) : 0
    return acc + v * w
  }, 0)
  return weighted / totalWeight
}

// ── Main builder ──────────────────────────────────────────────────

export function buildMetaInsightAsset(params: {
  campaignId: string
  snapshots: CampaignMetaInsightSnapshot[]
  periodStart?: string
  periodEnd?: string
}): InsightAssetDraft {
  const { campaignId, snapshots, periodStart, periodEnd } = params

  const totalSpend = sumField(snapshots, 'spend')
  const totalImpressions = sumField(snapshots, 'impressions')
  const totalReach = sumField(snapshots, 'reach')
  const totalClicks = sumField(snapshots, 'clicks')
  const totalConversions = sumField(snapshots, 'conversions')
  const totalVideoPlay = sumField(snapshots, 'videoPlay')
  const totalThruPlay = sumField(snapshots, 'thruPlay')

  const avgCtr = weightedAvg(snapshots, 'ctr', 'impressions')
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0
  const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0

  const period =
    periodStart && periodEnd
      ? `${periodStart} ~ ${periodEnd}`
      : snapshots.length > 0
        ? `${snapshots[0].dateStart} ~ ${snapshots[snapshots.length - 1].dateStop}`
        : '기간 미정'

  const sourceIds = [...new Set(snapshots.map((s) => s.id))]

  const highlights: string[] = []
  const risks: string[] = []
  const recommendations: string[] = []

  if (totalSpend > 0) {
    highlights.push(`총 광고비 ${fmtN(totalSpend)} 집행`)
  }
  if (totalImpressions > 0) {
    highlights.push(`총 노출 ${fmtN(totalImpressions)}회`)
  }
  if (totalClicks > 0) {
    highlights.push(`총 클릭 ${fmtN(totalClicks)}회 (CTR ${avgCtr.toFixed(2)}%)`)
  }
  if (totalConversions > 0) {
    highlights.push(`총 전환 ${fmtN(totalConversions)}건`)
  }

  if (avgCtr > 0 && avgCtr < 0.5) {
    risks.push('CTR이 0.5% 미만입니다. 소재 또는 타겟 점검이 필요합니다.')
  }
  if (totalImpressions > 0 && totalReach > 0) {
    const freq = totalImpressions / totalReach
    if (freq > 5) {
      risks.push(`평균 노출 빈도가 ${freq.toFixed(1)}회로 높습니다. 소재 피로도 점검이 필요합니다.`)
    }
  }

  if (totalVideoPlay > 0 && totalThruPlay > 0) {
    const holdRate = (totalThruPlay / totalVideoPlay) * 100
    if (holdRate < 20) {
      recommendations.push(`영상 완주율(Hold Rate)이 ${holdRate.toFixed(1)}%입니다. 첫 3초 소재 개선을 권장합니다.`)
    }
  }
  if (avgCpc > 0) {
    recommendations.push(`CPC ${fmtN(Math.round(avgCpc))}원 기준으로 클릭 단가 효율을 모니터링하세요.`)
  }

  const embeddingParts: string[] = [
    `캠페인 ${campaignId} Meta 광고 성과 요약 (${period})`,
    `광고비: ${fmtN(totalSpend)}`,
    `노출: ${fmtN(totalImpressions)}`,
    `클릭: ${fmtN(totalClicks)}`,
    `CTR: ${avgCtr.toFixed(2)}%`,
    `CPC: ${fmtN(Math.round(avgCpc))}`,
    `CPM: ${fmtN(Math.round(avgCpm))}`,
    `전환: ${fmtN(totalConversions)}`,
    ...highlights,
    ...risks,
    ...recommendations,
  ]

  return {
    campaignId,
    sourceType: 'meta_analytics',
    sourceIds,
    periodStart,
    periodEnd,
    title: `Meta 광고 성과 요약 (${period})`,
    summary: [
      `${period} 기간 동안 총 ${fmtN(totalSpend)} 광고비 집행.`,
      totalImpressions > 0 ? `노출 ${fmtN(totalImpressions)}회, 클릭 ${fmtN(totalClicks)}회 (CTR ${avgCtr.toFixed(2)}%).` : '',
      totalConversions > 0 ? `전환 ${fmtN(totalConversions)}건 달성.` : '',
    ]
      .filter(Boolean)
      .join(' '),
    metrics: {
      totalSpend,
      totalImpressions,
      totalReach,
      totalClicks,
      totalConversions,
      totalVideoPlay,
      totalThruPlay,
      avgCtr,
      avgCpc,
      avgCpm,
      snapshotCount: snapshots.length,
    },
    highlights,
    risks,
    recommendations,
    embeddingText: embeddingParts.join('\n'),
  }
}

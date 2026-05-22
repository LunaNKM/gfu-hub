import {
  collection,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
  doc,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { Campaign, Influencer, InfluencerScore } from '@/types'
import { getCampaign } from './campaigns'
import { getInfluencers } from './influencers'

function toDate(v: unknown): Date {
  return v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date()
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function avg(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

function avgEr(influencer: Influencer): number {
  return avg(influencer.appearances.filter((a) => a.er !== undefined).map((a) => a.er!))
}

function avgImp(influencer: Influencer): number {
  return avg(influencer.appearances.filter((a) => a.imp !== undefined).map((a) => a.imp!))
}

function platformFit(platform: string, campaign?: Campaign | null): number {
  const targets = campaign?.targetPlatforms ?? []
  if (targets.length === 0) return platform ? 70 : 50
  return targets.includes(platform) ? 100 : 45
}

function followerScore(followers: number): number {
  if (followers <= 0) return 35
  if (followers < 10_000) return 70
  if (followers < 100_000) return 90
  if (followers < 1_000_000) return 75
  return 60
}

function erScore(er: number, platform: string): number {
  if (er <= 0) return 35
  if (platform === 'TikTok') {
    if (er >= 6) return 100
    if (er >= 3.5) return 82
    if (er >= 1.5) return 60
    return 40
  }
  if (er >= 5) return 100
  if (er >= 3) return 85
  if (er >= 1.5) return 65
  if (er >= 0.5) return 45
  return 30
}

export function scoreInfluencerForCampaign(
  influencer: Influencer,
  campaign?: Campaign | null
): InfluencerScore {
  const er = avgEr(influencer)
  const imp = avgImp(influencer)
  const estimatedCpv =
    campaign?.budget && imp > 0 && influencer.appearances.length > 0
      ? campaign.budget / Math.max(1, imp)
      : undefined

  const eScore = erScore(er, influencer.platform)
  const cScore = estimatedCpv === undefined
    ? 55
    : estimatedCpv <= 10 ? 100 : estimatedCpv <= 30 ? 82 : estimatedCpv <= 80 ? 58 : 35
  const fScore = followerScore(influencer.followers)
  const hScore = clamp(40 + influencer.appearances.length * 12 + (imp > 0 ? 12 : 0))
  const pScore = platformFit(influencer.platform, campaign)
  const bScore = campaign?.targetCategories?.length ? 65 : 70
  const riskScore = clamp(
    (er === 0 ? 25 : 0) +
    (influencer.followers === 0 ? 20 : 0) +
    (influencer.profileUrl ? 0 : 15)
  )

  const totalScore = clamp(
    eScore * 0.25 +
    cScore * 0.2 +
    hScore * 0.2 +
    bScore * 0.2 +
    pScore * 0.1 -
    riskScore * 0.15
  )

  const reasons = [
    er > 0 ? `평균 ER ${er.toFixed(2)}%` : 'ER 데이터 부족',
    imp > 0 ? `평균 조회수 ${Math.round(imp).toLocaleString()}` : '조회수 데이터 부족',
    `${influencer.appearances.length}개 캠페인 이력`,
    pScore >= 90 ? '타깃 플랫폼과 일치' : '타깃 플랫폼 적합도 확인 필요',
  ]

  const risks = [
    ...(riskScore >= 20 ? ['성과/프로필 데이터 보강 필요'] : []),
    ...(er > 0 && er < 1 ? ['ER이 낮아 콘텐츠 반응성 리스크'] : []),
    ...(influencer.followers > 500_000 && er > 0 && er < 0.7 ? ['대형 계정 대비 참여율 낮음'] : []),
  ]

  return {
    id: campaign?.id ? `${campaign.id}_${influencer.id}` : `global_${influencer.id}`,
    influencerId: influencer.id,
    campaignId: campaign?.id,
    handle: influencer.handle,
    platform: influencer.platform,
    followers: influencer.followers,
    erScore: eScore,
    cpvScore: cScore,
    followerScore: fScore,
    historyScore: hScore,
    brandFitScore: bScore,
    platformFitScore: pScore,
    riskScore,
    totalScore,
    expectedViews: imp > 0 ? Math.round(imp) : undefined,
    estimatedCpv,
    reasons,
    risks,
    updatedAt: new Date(),
  }
}

export async function getInfluencerScores(campaignId: string): Promise<InfluencerScore[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  const q = query(collection(db, 'influencerScores'), where('campaignId', '==', campaignId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      updatedAt: toDate(data.updatedAt),
    } as InfluencerScore
  }).sort((a, b) => b.totalScore - a.totalScore)
}

export async function saveInfluencerScore(score: InfluencerScore): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')
  const { id, updatedAt, ...rest } = score
  await setDoc(doc(db, 'influencerScores', id), {
    ...rest,
    updatedAt: Timestamp.fromDate(updatedAt),
  })
}

export async function scoreInfluencersForCampaign(campaignId: string): Promise<InfluencerScore[]> {
  const [campaign, influencers] = await Promise.all([getCampaign(campaignId), getInfluencers(500)])
  const scores = influencers
    .map((influencer) => scoreInfluencerForCampaign(influencer, campaign))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 100)

  await Promise.all(scores.map(saveInfluencerScore))
  return scores
}

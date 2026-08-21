'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdCalendarBrand, AdCampaign } from '@/types'
import {
  AdBrandInput,
  AdCampaignInput,
  createAdCalendarBrand,
  createAdCampaign,
  createAdCampaigns,
  deleteAdCalendarBrand,
  deleteAdCampaign,
  getAdCalendarBrands,
  getAdCampaignsByMonth,
  updateAdCalendarBrand,
  updateAdCampaign,
} from '@/lib/services/adCalendar'
import { toMonthKey } from '@/lib/adCalendar/format'
import { useAuth } from './useAuth'

/**
 * 광고 캘린더 데이터. 브랜드는 한 번만 읽고, 캠페인은 보고 있는 달 기준으로 다시 읽는다.
 * 캠페인이 달을 넘길 수 있어서 months 배열로 조회한다. (docs/ad-calendar.md)
 */
export function useAdCalendar(month: Date) {
  const { user } = useAuth()
  const [brands, setBrands] = useState<AdCalendarBrand[]>([])
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const monthKey = toMonthKey(month)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [brandList, campaignList] = await Promise.all([
        getAdCalendarBrands(),
        getAdCampaignsByMonth(monthKey),
      ])
      setBrands(brandList)
      setCampaigns(campaignList)
    } catch (err) {
      console.error('광고 캘린더 조회 오류:', err)
      setError('광고 캘린더를 불러오는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [monthKey])

  useEffect(() => {
    if (user) fetchAll()
  }, [user, fetchAll])

  const requireUser = () => {
    if (!user) throw new Error('로그인이 필요합니다.')
    return user.uid
  }

  return {
    brands,
    campaigns,
    loading,
    error,
    refetch: fetchAll,

    createBrand: async (data: AdBrandInput) => {
      await createAdCalendarBrand(data, requireUser())
      await fetchAll()
    },
    updateBrand: async (id: string, data: Partial<AdBrandInput>) => {
      await updateAdCalendarBrand(id, data, requireUser())
      await fetchAll()
    },
    deleteBrand: async (id: string) => {
      await deleteAdCalendarBrand(id)
      await fetchAll()
    },

    createCampaign: async (data: AdCampaignInput) => {
      await createAdCampaign(data, requireUser())
      await fetchAll()
    },
    importCampaigns: async (items: AdCampaignInput[]) => {
      const count = await createAdCampaigns(items, requireUser())
      await fetchAll()
      return count
    },
    updateCampaign: async (id: string, data: AdCampaignInput) => {
      await updateAdCampaign(id, data, requireUser())
      await fetchAll()
    },
    deleteCampaign: async (id: string) => {
      await deleteAdCampaign(id)
      await fetchAll()
    },
  }
}

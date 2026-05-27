import { NextResponse } from 'next/server'
import { getDocument } from './firestoreRest'

export async function getCampaignOwnedResource<T extends { campaignId?: string }>(
  token: string,
  collection: string,
  resourceId: string,
  campaignId: string
): Promise<T | NextResponse> {
  const resource = await getDocument<T>(token, collection, resourceId)
  if (!resource || resource.campaignId !== campaignId) {
    return NextResponse.json({ error: '리소스를 찾을 수 없습니다.' }, { status: 404 })
  }
  return resource
}

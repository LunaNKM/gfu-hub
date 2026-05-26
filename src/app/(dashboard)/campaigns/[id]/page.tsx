import { CampaignWorkspace } from '@/components/campaigns/workspace/CampaignWorkspace'

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CampaignWorkspace campaignId={id} />
}

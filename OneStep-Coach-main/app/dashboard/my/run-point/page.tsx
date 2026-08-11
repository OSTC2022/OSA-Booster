import { redirect } from 'next/navigation'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { isAdultPortalUser } from '@/lib/member-portal-routes'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { getMemberRewardHome } from '@/lib/actions/rewards'
import { getMemberRaffleHome } from '@/lib/actions/raffles'
import { RunPointShop } from '@/components/dashboard/run-point-shop'

export default async function RunPointShopPage() {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  if (!isAdultPortalUser(profile.role) && profile.role !== 'admin') {
    redirect('/dashboard/my')
  }

  const member = await getMemberForCurrentUser()
  if (!member?.id) {
    redirect('/dashboard/my')
  }

  const [rewardHome, raffleHome] = await Promise.all([
    getMemberRewardHome(member.id),
    getMemberRaffleHome(member.id),
  ])

  return (
    <div className="px-4 py-4 md:px-6">
      <RunPointShop rewardHome={rewardHome} raffleHome={raffleHome} />
    </div>
  )
}

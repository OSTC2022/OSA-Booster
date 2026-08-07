'use server'

import { getCenterSettings } from '@/lib/actions/center-settings'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/server'
import {
  buildCenterContactView,
  buildCoachContactView,
  type MemberCenterContactView,
  type MemberCoachContactView,
} from '@/lib/center-contact'

export async function getViewerCenterContact(): Promise<{
  coach: MemberCoachContactView
  center: MemberCenterContactView
}> {
  const [centerSettings, member] = await Promise.all([
    getCenterSettings(),
    getMemberForCurrentUser(),
  ])

  const center = buildCenterContactView(centerSettings)

  let coachName = member?.primary_instructor?.name ?? '자율배정'
  let coachPhone: string | null = null

  if (member?.primary_instructor_id) {
    const supabase = await createClient()
    const { data: instructor } = await supabase
      .from('instructors')
      .select('name, phone')
      .eq('id', member.primary_instructor_id)
      .maybeSingle()
    if (instructor?.name) coachName = String(instructor.name)
    if (instructor?.phone) coachPhone = String(instructor.phone)
  }

  const coach = buildCoachContactView(
    coachName,
    coachPhone,
    center.showInstructorContact,
  )

  return { coach, center }
}

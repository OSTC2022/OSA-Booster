'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  deletePortalMileageTeam,
  setPortalMileageTeamMembers,
  upsertPortalMileageTeam,
} from '@/lib/actions/portal-mileage-teams'
import type { MemberRunningLeagueRankingBundle } from '@/lib/actions/running-league'
import {
  defaultTeamColor,
  type PortalMileageTeam,
  type PortalMileageTeamMember,
} from '@/lib/running-league/mileage-team-leaderboard'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Draft = {
  id?: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
}

const EMPTY_DRAFT: Draft = {
  name: '',
  color: defaultTeamColor(0),
  sort_order: 0,
  is_active: true,
}

export function PortalMileageTeamsSettingsPanel({
  initialTeams,
  initialMemberships,
  rankingBundle,
}: {
  initialTeams: PortalMileageTeam[]
  initialMemberships: PortalMileageTeamMember[]
  rankingBundle: MemberRunningLeagueRankingBundle | null
}) {
  const [teams, setTeams] = useState(initialTeams)
  const [memberships, setMemberships] = useState(initialMemberships)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editingMembersTeamId, setEditingMembersTeamId] = useState<string | null>(null)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  const participantOptions = useMemo(() => {
    const participants = rankingBundle?.participants ?? []
    return [...participants]
      .map((participant) => ({
        memberId: participant.member_id,
        memberName: participant.member?.name?.trim() || '회원',
      }))
      .sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko'))
  }, [rankingBundle?.participants])

  const membersByTeam = useMemo(() => {
    const map = new Map<string, PortalMileageTeamMember[]>()
    for (const membership of memberships) {
      const list = map.get(membership.team_id) ?? []
      list.push(membership)
      map.set(membership.team_id, list)
    }
    return map
  }, [memberships])

  const memberTeamMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const membership of memberships) {
      map.set(membership.member_id, membership.team_id)
    }
    return map
  }, [memberships])

  const sortedTeams = useMemo(
    () =>
      [...teams].sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ko'),
      ),
    [teams],
  )

  function startEdit(team: PortalMileageTeam) {
    setDraft({
      id: team.id,
      name: team.name,
      color: team.color || defaultTeamColor(0),
      sort_order: team.sort_order,
      is_active: team.is_active,
    })
    setEditingMembersTeamId(null)
  }

  function startEditMembers(teamId: string) {
    setEditingMembersTeamId(teamId)
    setSelectedMemberIds(
      (membersByTeam.get(teamId) ?? []).map((row) => row.member_id),
    )
    setDraft(EMPTY_DRAFT)
  }

  function handleSaveTeam() {
    startTransition(async () => {
      const result = await upsertPortalMileageTeam({
        id: draft.id,
        name: draft.name,
        color: draft.color,
        sort_order: draft.sort_order,
        is_active: draft.is_active,
      })
      if (result.error) {
        toast.error('저장 실패', { description: result.error })
        return
      }
      if (result.team) {
        setTeams((prev) => {
          const without = prev.filter((row) => row.id !== result.team!.id)
          return [...without, result.team!]
        })
      }
      setDraft({
        ...EMPTY_DRAFT,
        color: defaultTeamColor(teams.length + (draft.id ? 0 : 1)),
      })
      toast.success(draft.id ? '팀이 수정되었습니다.' : '팀이 추가되었습니다.')
    })
  }

  function handleDeleteTeam(id: string) {
    startTransition(async () => {
      const result = await deletePortalMileageTeam(id)
      if (result.error) {
        toast.error('삭제 실패', { description: result.error })
        return
      }
      setTeams((prev) => prev.filter((row) => row.id !== id))
      setMemberships((prev) => prev.filter((row) => row.team_id !== id))
      if (editingMembersTeamId === id) setEditingMembersTeamId(null)
      if (draft.id === id) setDraft(EMPTY_DRAFT)
      toast.success('팀이 삭제되었습니다.')
    })
  }

  function handleSaveMembers() {
    if (!editingMembersTeamId) return
    startTransition(async () => {
      const result = await setPortalMileageTeamMembers({
        teamId: editingMembersTeamId,
        memberIds: selectedMemberIds,
      })
      if (result.error) {
        toast.error('멤버 저장 실패', { description: result.error })
        return
      }
      const teamName =
        teams.find((team) => team.id === editingMembersTeamId)?.name ?? '팀'
      const nameById = new Map(
        participantOptions.map((option) => [option.memberId, option.memberName]),
      )
      setMemberships((prev) => {
        const others = prev.filter((row) => row.team_id !== editingMembersTeamId)
        const next = selectedMemberIds.map((memberId) => ({
          team_id: editingMembersTeamId,
          member_id: memberId,
          member_name: nameById.get(memberId) ?? '회원',
        }))
        return [...others, ...next]
      })
      toast.success(`${teamName} 멤버가 저장되었습니다.`)
      setEditingMembersTeamId(null)
    })
  }

  function toggleMember(memberId: string, checked: boolean) {
    setSelectedMemberIds((prev) => {
      if (checked) return prev.includes(memberId) ? prev : [...prev, memberId]
      return prev.filter((id) => id !== memberId)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-orange-400" />
          마일리지 팀전
        </CardTitle>
        <CardDescription>
          팀을 만들고 회원을 배정하면, 같은 팀 마일리지가 합산되어 랭킹·그래프에 표시됩니다. 한
          회원은 한 팀만 가능합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-sm font-medium">{draft.id ? '팀 수정' : '팀 추가'}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">팀 이름</Label>
              <Input
                id="team-name"
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="예: 레드팀"
                maxLength={30}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-color">색</Label>
              <Input
                id="team-color"
                type="color"
                value={draft.color || '#ff6a2a'}
                onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))}
                className="h-10 w-14 cursor-pointer p-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-order">정렬</Label>
              <Input
                id="team-order"
                type="number"
                value={draft.sort_order}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    sort_order: Number(event.target.value) || 0,
                  }))
                }
                className="w-20"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.is_active}
              onCheckedChange={(value) =>
                setDraft((prev) => ({ ...prev, is_active: value === true }))
              }
            />
            활성화 (랭킹에 표시)
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSaveTeam} disabled={pending || !draft.name.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {draft.id ? '수정 저장' : '팀 추가'}
            </Button>
            {draft.id ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft(EMPTY_DRAFT)}
                disabled={pending}
              >
                취소
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          {sortedTeams.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 팀이 없습니다.</p>
          ) : (
            sortedTeams.map((team) => {
              const teamMembers = membersByTeam.get(team.id) ?? []
              const isEditingMembers = editingMembersTeamId === team.id
              return (
                <div
                  key={team.id}
                  className="rounded-lg border border-border bg-card/40 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: team.color || defaultTeamColor(0) }}
                          aria-hidden
                        />
                        <p className="font-medium">{team.name}</p>
                        {!team.is_active ? (
                          <span className="text-xs text-muted-foreground">비활성</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {teamMembers.length}명
                        {teamMembers.length > 0
                          ? ` · ${teamMembers.map((row) => row.member_name).join(', ')}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startEditMembers(team.id)}
                        disabled={pending}
                      >
                        멤버
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(team)}
                        disabled={pending}
                      >
                        수정
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDeleteTeam(team.id)}
                        disabled={pending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isEditingMembers ? (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground">
                        체크한 회원이 이 팀에 배정됩니다. 다른 팀 소속은 선택할 수 없습니다.
                      </p>
                      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                        {participantOptions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">참가 회원이 없습니다.</p>
                        ) : (
                          participantOptions.map((option) => {
                            const otherTeamId = memberTeamMap.get(option.memberId)
                            const locked =
                              otherTeamId != null && otherTeamId !== team.id
                            const checked = selectedMemberIds.includes(option.memberId)
                            return (
                              <label
                                key={option.memberId}
                                className={cn(
                                  'flex items-center gap-2 rounded px-2 py-1.5 text-sm',
                                  locked ? 'opacity-40' : 'hover:bg-muted/40',
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={locked || pending}
                                  onCheckedChange={(value) =>
                                    toggleMember(option.memberId, value === true)
                                  }
                                />
                                <span>{option.memberName}</span>
                                {locked ? (
                                  <span className="text-[11px] text-muted-foreground">
                                    (다른 팀)
                                  </span>
                                ) : null}
                              </label>
                            )
                          })
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={handleSaveMembers} disabled={pending}>
                          {pending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          멤버 저장
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditingMembersTeamId(null)}
                          disabled={pending}
                        >
                          닫기
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

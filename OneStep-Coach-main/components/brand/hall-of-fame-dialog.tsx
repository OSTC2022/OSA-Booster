'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trophy } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getCachedHallOfFameEntries,
  loadHallOfFameEntries,
} from '@/lib/hall-of-fame-client'
import type { HallOfFamePublicEntry } from '@/lib/hall-of-fame'
import { cn } from '@/lib/utils'

export function HallOfFameDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [entries, setEntries] = useState<HallOfFamePublicEntry[]>(
    () => getCachedHallOfFameEntries() ?? [],
  )
  const [loading, setLoading] = useState(() => getCachedHallOfFameEntries() == null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const cached = getCachedHallOfFameEntries()
    if (cached) {
      setEntries(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    void loadHallOfFameEntries().then((next) => {
      if (cancelled) return
      setEntries(next)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[#0f1624] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#ff6a2a]" />
            명예의 전당
          </DialogTitle>
          <DialogDescription className="text-white/55">
            풀코스(풀마라톤) 기록 보유자 · 빠른 순
          </DialogDescription>
        </DialogHeader>

        {loading && entries.length === 0 ? (
          <div className="flex justify-center py-10 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/50">
            등록된 풀코스 기록이 없습니다.
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3',
                  entry.rank <= 3 && 'border-[#ff6a2a]/35 bg-[#ff6a2a]/10',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    entry.rank === 1 && 'bg-[#ff6a2a] text-white',
                    entry.rank === 2 && 'bg-white/20 text-white',
                    entry.rank === 3 && 'bg-[#ff6a2a]/40 text-white',
                    entry.rank > 3 && 'bg-white/10 text-white/70',
                  )}
                >
                  {entry.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{entry.display_name}</p>
                  <p className="text-xs text-white/45">
                    {[entry.race_name, entry.measured_at].filter(Boolean).join(' · ') ||
                      '풀코스'}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm font-bold text-[#ffb03a]">
                  {entry.time_text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

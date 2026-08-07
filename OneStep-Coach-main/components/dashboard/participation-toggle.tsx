'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 참여 / 취소 — 선택 쪽만 주황으로 켜지고, 반대쪽은 꺼지는 온·오프 토글 */
export function ParticipationToggle({
  active,
  pending,
  disabled,
  onToggle,
  className,
}: {
  active: boolean
  pending?: boolean
  disabled?: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={active ? '참여 취소' : '참여하기'}
      disabled={disabled || pending}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className={cn(
        'relative h-8 w-[4.85rem] shrink-0 rounded-full border p-0.5 transition-all duration-300',
        active
          ? 'border-orange-400/80 bg-orange-500/20 shadow-[0_0_14px_rgba(255,106,42,0.45)]'
          : 'border-zinc-600/50 bg-black/55 shadow-none',
        (disabled || pending) && 'opacity-60',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full transition-all duration-300 ease-out',
          active
            ? 'left-0.5 bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.85)]'
            : 'left-[calc(50%)] bg-zinc-700/95 shadow-none',
        )}
      />
      <span className="relative z-10 grid h-full grid-cols-2 text-[10px] font-semibold leading-none">
        <span
          className={cn(
            'flex items-center justify-center transition-colors duration-300',
            active ? 'text-black' : 'text-zinc-600',
          )}
        >
          참여
        </span>
        <span
          className={cn(
            'flex items-center justify-center transition-colors duration-300',
            active ? 'text-zinc-600' : 'text-zinc-300',
          )}
        >
          취소
        </span>
      </span>
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-300" />
        </span>
      ) : null}
    </button>
  )
}

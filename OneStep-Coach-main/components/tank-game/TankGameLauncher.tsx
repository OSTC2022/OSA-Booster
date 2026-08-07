import Link from 'next/link'
import { Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TankGameLauncher({ className }: { className?: string }) {
  return (
    <Link
      href="/games/tank-battle"
      aria-label="ONE STEP 탱크 워 열기"
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/5 px-2.5 text-[11px] font-medium text-cyan-100 transition-colors hover:bg-cyan-500/10',
        className,
      )}
    >
      <Gamepad2 className="h-4 w-4 shrink-0 text-cyan-300" />
      <span className="hidden sm:inline">탱크 워</span>
    </Link>
  )
}

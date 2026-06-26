export function PortalCoachBadge() {
  return (
    <span className="shrink-0 rounded-full border border-lime-300/50 bg-lime-400/20 px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide text-lime-50 shadow-[0_0_12px_rgba(163,230,53,0.35)]">
      Coach
    </span>
  )
}

export function PortalChaseBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full border border-red-300/50 bg-red-400/20 px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide text-red-50 shadow-[0_0_12px_rgba(248,113,113,0.35)]">
      {label}
    </span>
  )
}

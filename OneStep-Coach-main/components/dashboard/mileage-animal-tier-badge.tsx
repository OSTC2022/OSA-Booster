import {
  resolveMileageAnimalTier,
  type MileageAnimalTier,
} from '@/lib/running-league/mileage-animal-tier'
import { cn } from '@/lib/utils'

export function MileageAnimalTierBadge({
  mileageKm,
  tier: tierProp,
  className,
}: {
  mileageKm?: number
  tier?: MileageAnimalTier
  className?: string
}) {
  const tier = tierProp ?? resolveMileageAnimalTier(mileageKm ?? 0)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] font-medium leading-none text-zinc-400',
        className,
      )}
      title={`${tier.label} 등급 (${tier.minKm}km 이상)`}
      aria-label={`${tier.emoji} ${tier.label} 등급`}
    >
      <span aria-hidden>{tier.emoji}</span>
      <span>{tier.label}</span>
    </span>
  )
}

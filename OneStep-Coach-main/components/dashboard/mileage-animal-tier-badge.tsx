import {
  formatMileageAnimalTierThreshold,
  resolveMileageAnimalTier,
  type MileageAnimalTier,
} from '@/lib/running-league/mileage-animal-tier'
import { cn } from '@/lib/utils'

export function MileageAnimalTierBadge({
  mileageKm,
  tier: tierProp,
  halfThresholds = false,
  className,
}: {
  mileageKm?: number
  tier?: MileageAnimalTier
  halfThresholds?: boolean
  className?: string
}) {
  const tier =
    tierProp ?? resolveMileageAnimalTier(mileageKm ?? 0, { halfThresholds })
  const thresholdLabel = formatMileageAnimalTierThreshold(tier, halfThresholds)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] font-medium leading-none text-zinc-400',
        className,
      )}
      title={
        halfThresholds
          ? `${tier.label} 등급 (이벤트: ${thresholdLabel})`
          : `${tier.label} 등급 (${thresholdLabel})`
      }
      aria-label={`${tier.emoji} ${tier.label} 등급`}
    >
      <span aria-hidden>{tier.emoji}</span>
      <span>{tier.label}</span>
    </span>
  )
}

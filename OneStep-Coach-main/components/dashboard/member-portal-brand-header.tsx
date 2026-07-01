import type { CSSProperties, ReactNode } from 'react'
import type { AdultPortalBrandConfig } from '@/lib/adult-portal-brand'
import { resolveAdultPortalBrand } from '@/lib/adult-portal-brand'
import { cn } from '@/lib/utils'

type MemberPortalBrandHeaderProps = {
  brand?: AdultPortalBrandConfig | null
  action?: ReactNode
}

function buildTextStyle(
  color: string | null,
  size: string | null,
  weight: string | null,
): CSSProperties | undefined {
  const style: CSSProperties = {}
  if (color) style.color = color
  if (size) style.fontSize = size
  if (weight) style.fontWeight = Number(weight)
  return Object.keys(style).length > 0 ? style : undefined
}

export function MemberPortalBrandHeader({ brand, action }: MemberPortalBrandHeaderProps) {
  const config = brand ?? resolveAdultPortalBrand(null)
  if (config.hidden) return null

  const eyebrowStyle = buildTextStyle(
    config.eyebrowColor,
    config.eyebrowSize,
    config.eyebrowWeight,
  )
  const titleStyle = buildTextStyle(config.titleColor, config.titleSize, config.titleWeight)

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            'font-semibold uppercase tracking-[0.18em]',
            !config.eyebrowSize && 'text-[10px] sm:text-[11px]',
            !config.eyebrowColor && 'text-primary',
          )}
          style={eyebrowStyle}
        >
          {config.eyebrow}
        </p>
        <h1
          className={cn(
            'font-bold',
            !config.titleSize && 'text-xl sm:text-2xl',
            !config.titleColor && 'text-foreground',
          )}
          style={titleStyle}
        >
          {config.title}
        </h1>
      </div>
      {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Palette, Type } from 'lucide-react'
import { toast } from 'sonner'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import {
  ADULT_PORTAL_BRAND_EYEBROW_SIZE_OPTIONS,
  ADULT_PORTAL_BRAND_TITLE_SIZE_OPTIONS,
  ADULT_PORTAL_BRAND_WEIGHT_OPTIONS,
  DEFAULT_ADULT_PORTAL_BRAND_TITLE,
  resolveAdultPortalBrand,
  type AdultPortalBrandConfig,
} from '@/lib/adult-portal-brand'
import { RUNNING_LEAGUE_EN } from '@/lib/running-league-content'
import { MemberPortalBrandHeader } from '@/components/dashboard/member-portal-brand-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { CenterSettings } from '@/lib/types'

type AdultPortalBrandSettingsPanelProps = {
  centerSettings: CenterSettings
}

type BrandFormState = {
  eyebrow: string
  title: string
  eyebrow_color: string
  title_color: string
  eyebrow_size: string
  title_size: string
  eyebrow_weight: string
  title_weight: string
  hidden: boolean
}

function toFormState(settings: CenterSettings): BrandFormState {
  const brand = resolveAdultPortalBrand(settings)
  return {
    eyebrow: settings.adult_portal_brand_eyebrow?.trim() || RUNNING_LEAGUE_EN,
    title: settings.adult_portal_brand_title?.trim() || DEFAULT_ADULT_PORTAL_BRAND_TITLE,
    eyebrow_color: brand.eyebrowColor || '#a3e635',
    title_color: brand.titleColor || '#fafafa',
    eyebrow_size: settings.adult_portal_brand_eyebrow_size || '',
    title_size: settings.adult_portal_brand_title_size || '',
    eyebrow_weight: settings.adult_portal_brand_eyebrow_weight || '',
    title_weight: settings.adult_portal_brand_title_weight || '',
    hidden: settings.adult_portal_brand_hidden ?? false,
  }
}

function toPreviewBrand(form: BrandFormState): AdultPortalBrandConfig {
  return {
    eyebrow: form.eyebrow.trim() || RUNNING_LEAGUE_EN,
    title: form.title.trim() || DEFAULT_ADULT_PORTAL_BRAND_TITLE,
    eyebrowColor: form.eyebrow_color.trim() || null,
    titleColor: form.title_color.trim() || null,
    eyebrowSize: form.eyebrow_size.trim() || null,
    titleSize: form.title_size.trim() || null,
    eyebrowWeight: form.eyebrow_weight.trim() || null,
    titleWeight: form.title_weight.trim() || null,
    hidden: form.hidden,
  }
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer p-1"
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#a3e635"
          className="font-mono text-sm"
        />
      </div>
    </div>
  )
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option.value || 'default'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function AdultPortalBrandSettingsPanel({
  centerSettings,
}: AdultPortalBrandSettingsPanelProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState(() => toFormState(centerSettings))

  useEffect(() => {
    setFormData(toFormState(centerSettings))
  }, [centerSettings])

  const previewBrand = useMemo(() => toPreviewBrand(formData), [formData])

  async function handleSave() {
    setIsSaving(true)
    const result = await updateCenterSettings({
      adult_portal_brand_eyebrow: formData.eyebrow.trim() || null,
      adult_portal_brand_title: formData.title.trim() || null,
      adult_portal_brand_eyebrow_color: formData.eyebrow_color.trim() || null,
      adult_portal_brand_title_color: formData.title_color.trim() || null,
      adult_portal_brand_eyebrow_size: formData.eyebrow_size.trim() || null,
      adult_portal_brand_title_size: formData.title_size.trim() || null,
      adult_portal_brand_eyebrow_weight: formData.eyebrow_weight.trim() || null,
      adult_portal_brand_title_weight: formData.title_weight.trim() || null,
      adult_portal_brand_hidden: formData.hidden,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success('포털 상단 문구가 저장되었습니다.')
    router.refresh()
  }

  function handleReset() {
    setFormData({
      eyebrow: RUNNING_LEAGUE_EN,
      title: DEFAULT_ADULT_PORTAL_BRAND_TITLE,
      eyebrow_color: '#a3e635',
      title_color: '#fafafa',
      eyebrow_size: '',
      title_size: '',
      eyebrow_weight: '',
      title_weight: '',
      hidden: false,
    })
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Type className="h-4 w-4 text-primary" />
          포털 상단 문구·스타일
        </CardTitle>
        <p className="text-xs text-muted-foreground sm:text-sm">
          성인 회원 마이페이지 상단의 영문 보조 문구와 제목, 색상·글자 크기를 설정합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">상단 헤더 숨기기</p>
            <p className="text-xs text-muted-foreground">켜면 브랜드 헤더 전체가 보이지 않습니다.</p>
          </div>
          <Switch
            checked={formData.hidden}
            onCheckedChange={(checked) =>
              setFormData((current) => ({ ...current, hidden: checked }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="adult-portal-brand-eyebrow">보조 문구 (영문)</Label>
            <Input
              id="adult-portal-brand-eyebrow"
              value={formData.eyebrow}
              onChange={(event) =>
                setFormData((current) => ({ ...current, eyebrow: event.target.value }))
              }
              placeholder={RUNNING_LEAGUE_EN}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adult-portal-brand-title">제목</Label>
            <Input
              id="adult-portal-brand-title"
              value={formData.title}
              onChange={(event) =>
                setFormData((current) => ({ ...current, title: event.target.value }))
              }
              placeholder={DEFAULT_ADULT_PORTAL_BRAND_TITLE}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            id="adult-portal-brand-eyebrow-color"
            label="보조 문구 색상"
            value={formData.eyebrow_color}
            onChange={(value) =>
              setFormData((current) => ({ ...current, eyebrow_color: value }))
            }
          />
          <ColorField
            id="adult-portal-brand-title-color"
            label="제목 색상"
            value={formData.title_color}
            onChange={(value) =>
              setFormData((current) => ({ ...current, title_color: value }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="adult-portal-brand-eyebrow-size"
            label="보조 문구 크기"
            value={formData.eyebrow_size}
            options={ADULT_PORTAL_BRAND_EYEBROW_SIZE_OPTIONS}
            onChange={(value) =>
              setFormData((current) => ({ ...current, eyebrow_size: value }))
            }
          />
          <SelectField
            id="adult-portal-brand-title-size"
            label="제목 크기"
            value={formData.title_size}
            options={ADULT_PORTAL_BRAND_TITLE_SIZE_OPTIONS}
            onChange={(value) =>
              setFormData((current) => ({ ...current, title_size: value }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="adult-portal-brand-eyebrow-weight"
            label="보조 문구 굵기"
            value={formData.eyebrow_weight}
            options={ADULT_PORTAL_BRAND_WEIGHT_OPTIONS}
            onChange={(value) =>
              setFormData((current) => ({ ...current, eyebrow_weight: value }))
            }
          />
          <SelectField
            id="adult-portal-brand-title-weight"
            label="제목 굵기"
            value={formData.title_weight}
            options={ADULT_PORTAL_BRAND_WEIGHT_OPTIONS}
            onChange={(value) =>
              setFormData((current) => ({ ...current, title_weight: value }))
            }
          />
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />
            미리보기
          </p>
          {previewBrand.hidden ? (
            <p className="text-sm text-muted-foreground">헤더가 숨겨진 상태입니다.</p>
          ) : (
            <MemberPortalBrandHeader brand={previewBrand} />
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleReset} disabled={isSaving}>
            기본값으로 되돌리기
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

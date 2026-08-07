'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, Copy, Instagram, Loader2, MessageCircle, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { buildInstagramUrl, resolveKakaoLink } from '@/lib/sns-links'
import type { OperatorPublicContact } from '@/lib/operator-contacts'
import {
  getCachedOperatorContacts,
  loadOperatorContacts,
} from '@/lib/operator-contacts-client'
import { cn } from '@/lib/utils'

type View = 'list' | 'detail'

export function OperatorContactDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [view, setView] = useState<View>('list')
  const [contacts, setContacts] = useState<OperatorPublicContact[]>(
    () => getCachedOperatorContacts() ?? [],
  )
  const [loading, setLoading] = useState(() => getCachedOperatorContacts() == null)
  const [selected, setSelected] = useState<OperatorPublicContact | null>(null)

  useEffect(() => {
    if (!open) {
      setView('list')
      setSelected(null)
      return
    }

    let cancelled = false
    const cached = getCachedOperatorContacts()
    if (cached) {
      setContacts(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    void loadOperatorContacts().then((next) => {
      if (cancelled) return
      setContacts(next)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [open])

  async function copyText(label: string, value: string) {
    await navigator.clipboard.writeText(value)
    toast.success(`${label}가 복사되었습니다.`)
  }

  const kakao = selected ? resolveKakaoLink(selected.kakao_id) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-white/10 bg-[#0f1624] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view === 'detail' ? (
              <button
                type="button"
                className="mr-1 rounded-md p-1 hover:bg-white/10"
                onClick={() => {
                  setView('list')
                  setSelected(null)
                }}
                aria-label="목록으로"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <Users className="h-5 w-5 text-[#ff6a2a]" />
            )}
            {view === 'list' ? '운영진 카카오톡' : selected?.full_name}
          </DialogTitle>
          <DialogDescription className="text-white/55">
            {view === 'list'
              ? '이름을 누르면 연락처가 표시됩니다.'
              : 'QR 스캔 또는 아이디로 연락하세요.'}
          </DialogDescription>
        </DialogHeader>

        {loading && contacts.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : view === 'list' ? (
          contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">
              등록된 운영진 연락처가 없습니다.
            </p>
          ) : (
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border border-white/10',
                      'bg-white/5 px-4 py-3 text-left text-sm font-medium transition hover:bg-white/10',
                    )}
                    onClick={() => {
                      setSelected(contact)
                      setView('detail')
                    }}
                  >
                    <span>{contact.full_name}</span>
                    <MessageCircle className="h-4 w-4 text-[#ff6a2a]" />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : selected ? (
          <div className="space-y-4">
            {selected.kakao_qr_url ? (
              <div className="mx-auto w-fit rounded-xl border border-white/10 bg-white p-3">
                <Image
                  src={selected.kakao_qr_url}
                  alt={`${selected.full_name} 카카오 QR`}
                  width={180}
                  height={180}
                  unoptimized
                  className="h-44 w-44 object-contain"
                />
              </div>
            ) : null}

            {selected.kakao_id ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center">
                <p className="text-xs text-white/50">카카오톡</p>
                <p className="mt-1 text-base font-semibold tracking-wide">
                  {selected.kakao_id}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                    onClick={() => void copyText('카카오톡 아이디', selected.kakao_id!)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    복사
                  </Button>
                  {kakao && (kakao.kind === 'external' || kakao.kind === 'channel_friend') ? (
                    <Button
                      type="button"
                      className="bg-[#ff6a2a] text-white hover:bg-[#ff7d40]"
                      onClick={() => window.open(kakao.href, '_blank', 'noopener,noreferrer')}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      열기
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {selected.instagram_id ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center">
                <p className="text-xs text-white/50">인스타그램</p>
                <p className="mt-1 text-base font-semibold tracking-wide">
                  @{selected.instagram_id.replace(/^@/, '')}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                    onClick={() =>
                      void copyText(
                        '인스타그램 아이디',
                        selected.instagram_id!.replace(/^@/, ''),
                      )
                    }
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    복사
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#ff6a2a] text-white hover:bg-[#ff7d40]"
                    onClick={() =>
                      window.open(
                        buildInstagramUrl(selected.instagram_id!),
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    <Instagram className="mr-2 h-4 w-4" />
                    열기
                  </Button>
                </div>
              </div>
            ) : null}

            {!selected.kakao_qr_url && !selected.kakao_id && !selected.instagram_id ? (
              <p className="py-6 text-center text-sm text-white/50">
                등록된 연락처가 없습니다.
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

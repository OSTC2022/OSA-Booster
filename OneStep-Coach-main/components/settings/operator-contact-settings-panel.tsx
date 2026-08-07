'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { updateMyOperatorContact } from '@/lib/actions/operator-contact'
import {
  OPERATOR_QR_ACCEPT,
  removeOperatorKakaoQr,
  uploadOperatorKakaoQr,
} from '@/lib/operator-kakao-qr-upload'

export function OperatorContactSettingsPanel({
  userId,
  initialKakaoId,
  initialInstagramId,
  initialKakaoQrUrl,
}: {
  userId: string
  initialKakaoId: string
  initialInstagramId: string
  initialKakaoQrUrl: string | null
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [kakaoId, setKakaoId] = useState(initialKakaoId)
  const [instagramId, setInstagramId] = useState(initialInstagramId)
  const [kakaoQrUrl, setKakaoQrUrl] = useState<string | null>(initialKakaoQrUrl)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setKakaoId(initialKakaoId)
    setInstagramId(initialInstagramId)
    setKakaoQrUrl(initialKakaoQrUrl)
  }, [initialKakaoId, initialInstagramId, initialKakaoQrUrl])

  async function handleQrUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    const result = await uploadOperatorKakaoQr(userId, file)
    setUploading(false)

    if (result.error || !result.url) {
      toast.error('QR 업로드 실패', { description: result.error })
      return
    }

    setKakaoQrUrl(result.url)
    startTransition(async () => {
      const saved = await updateMyOperatorContact({
        kakao_id: kakaoId,
        instagram_id: instagramId,
        kakao_qr_url: result.url,
      })
      if (saved.error) {
        toast.error('저장 실패', { description: saved.error })
        return
      }
      toast.success('카카오 QR이 등록되었습니다.')
    })
  }

  function handleRemoveQr() {
    startTransition(async () => {
      await removeOperatorKakaoQr(userId)
      const saved = await updateMyOperatorContact({
        kakao_id: kakaoId,
        instagram_id: instagramId,
        kakao_qr_url: null,
      })
      if (saved.error) {
        toast.error('삭제 실패', { description: saved.error })
        return
      }
      setKakaoQrUrl(null)
      toast.success('QR을 삭제했습니다.')
    })
  }

  function handleSave() {
    startTransition(async () => {
      const saved = await updateMyOperatorContact({
        kakao_id: kakaoId,
        instagram_id: instagramId,
        kakao_qr_url: kakaoQrUrl,
      })
      if (saved.error) {
        toast.error('저장 실패', { description: saved.error })
        return
      }
      toast.success('운영진 연락처가 저장되었습니다.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>배경화면 운영진 연락처</CardTitle>
        <CardDescription>
          로그인 화면 캐릭터를 누르면 여기에 등록한 정보가 공개됩니다. 카카오
          QR 또는 아이디, 인스타그램 중 하나 이상 입력하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="operator-kakao-id">카카오톡 아이디</Label>
          <Input
            id="operator-kakao-id"
            value={kakaoId}
            onChange={(event) => setKakaoId(event.target.value)}
            placeholder="검색용 아이디 또는 오픈채팅 URL"
            disabled={pending || uploading}
          />
        </div>

        <div className="space-y-2">
          <Label>카카오톡 QR 이미지</Label>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
              {kakaoQrUrl ? (
                <Image
                  src={kakaoQrUrl}
                  alt="카카오톡 QR"
                  width={160}
                  height={160}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="px-3 text-center text-xs text-muted-foreground">
                  QR 없음
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={OPERATOR_QR_ACCEPT}
                className="hidden"
                onChange={(event) => void handleQrUpload(event)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending || uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                QR 업로드
              </Button>
              {kakaoQrUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending || uploading}
                  onClick={handleRemoveQr}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  QR 삭제
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="operator-instagram-id">인스타그램 아이디</Label>
          <Input
            id="operator-instagram-id"
            value={instagramId}
            onChange={(event) => setInstagramId(event.target.value)}
            placeholder="@없이 아이디만"
            disabled={pending || uploading}
          />
        </div>

        <Button type="button" disabled={pending || uploading} onClick={handleSave}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          저장
        </Button>
      </CardContent>
    </Card>
  )
}

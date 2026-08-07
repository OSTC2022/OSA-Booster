'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronDown, ExternalLink, Megaphone } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'
import type { CenterBoardPost } from '@/lib/types'
import { cn } from '@/lib/utils'

type MemberPortalNoticePanelProps = {
  notice?: string | null
  /** 성인 센터 게시판 공지 (이전 공지사항) */
  boardPosts?: CenterBoardPost[]
  className?: string
  /** 내용이 없어도 영역 표시 */
  alwaysShow?: boolean
  /** 상위 아코디언에서 헤더 없이 본문만 표시 */
  contentOnly?: boolean
}

function formatPostDate(value: string): string {
  try {
    return format(parseISO(value), 'M월 d일', { locale: ko })
  } catch {
    return ''
  }
}

function NoticeBody({
  trimmed,
  posts,
  hasContent,
}: {
  trimmed: string
  posts: CenterBoardPost[]
  hasContent: boolean
}) {
  return (
    <div className="space-y-3 px-3 py-3">
      {trimmed ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{trimmed}</p>
      ) : null}

      {posts.length > 0 ? (
        <ul className="space-y-2.5">
          {posts.map((post) => (
            <li
              key={post.id}
              className="rounded-lg border border-orange-500/15 bg-black/25 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-orange-50">
                  {post.pinned ? '📌 ' : ''}
                  {post.title}
                </p>
                <span className="text-[11px] text-zinc-500">
                  {formatPostDate(post.updated_at || post.created_at)}
                </span>
              </div>
              {post.body?.trim() ? (
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {post.body}
                </p>
              ) : null}
              {post.link_url ? (
                <a
                  href={post.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-orange-300 hover:underline"
                >
                  자세히 보기
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!hasContent ? (
        <p className="text-sm text-zinc-500">등록된 공지가 없습니다.</p>
      ) : null}
    </div>
  )
}

export function MemberPortalNoticePanel({
  notice,
  boardPosts = [],
  className,
  alwaysShow = false,
  contentOnly = false,
}: MemberPortalNoticePanelProps) {
  const trimmed = notice?.trim() ?? ''
  const posts = useMemo(
    () =>
      [...boardPosts].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return Date.parse(b.updated_at) - Date.parse(a.updated_at)
      }),
    [boardPosts],
  )
  const hasContent = Boolean(trimmed) || posts.length > 0
  const [open, setOpen] = useState(hasContent)

  if (!hasContent && !alwaysShow) return null

  if (contentOnly) {
    return (
      <NoticeBody trimmed={trimmed} posts={posts} hasContent={hasContent} />
    )
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('group', MEMBER_PORTAL_CARD_CLASS, className)}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-orange-500/5">
        <span className="flex min-w-0 items-center gap-2">
          <Megaphone className="h-4 w-4 shrink-0 text-orange-300" aria-hidden />
          <span className="text-sm font-semibold text-orange-100">공지사항</span>
          {!open && hasContent ? (
            <span className="truncate text-xs text-zinc-500">
              {posts.length > 0
                ? `${posts.length}건`
                : trimmed.slice(0, 24) + (trimmed.length > 24 ? '…' : '')}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-orange-500/15">
        <NoticeBody trimmed={trimmed} posts={posts} hasContent={hasContent} />
      </CollapsibleContent>
    </Collapsible>
  )
}

import type { Metadata } from 'next'
import { TankGameApp } from '@/components/tank-game/TankGameApp'

export const metadata: Metadata = {
  title: 'ONE STEP ARTILLERY ARENA',
  description: '팀 교대 턴과 로그라이크 전술을 결합한 온라인 포병 아레나',
}

export default function TankBattlePage() {
  return <TankGameApp />
}

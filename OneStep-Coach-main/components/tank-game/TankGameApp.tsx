'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronRight,
  Gamepad2,
  Play,
  RotateCcw,
  Save,
  Settings,
  ShoppingCart,
  Trophy,
  Users,
  Wifi,
} from 'lucide-react'
import { TankGameCanvas } from './TankGameCanvas'
import { TankOnlineLobby } from './TankOnlineLobby'
import {
  DEFAULT_CONFIG,
  PLAYER_COLORS,
  SAVE_KEY,
  SETTINGS_KEY,
  autoShop,
  calculateRoundRewards,
  createCampaignPlayers,
  createSave,
  normalizeConfig,
  parseSave,
  purchaseItem,
  rankPlayers,
} from '@/lib/tank-game/campaign'
import { EQUIPMENT, SHOP_ITEMS, WEAPONS, isWeaponId } from '@/lib/tank-game/weapons'
import type { OnlineGameSession } from '@/lib/tank-game/online'
import type {
  AiDifficulty,
  AppGamePhase,
  CampaignPlayer,
  GameConfig,
  RoundResult,
  ShopItemId,
} from '@/lib/tank-game/types'

const menuButton =
  'group flex min-h-12 w-full items-center justify-between border border-cyan-400/25 bg-[#071522] px-4 py-3 text-left font-mono text-sm font-bold text-cyan-50 transition hover:border-lime-300/60 hover:bg-lime-300/10 disabled:cursor-not-allowed disabled:opacity-35'
const actionButton =
  'inline-flex min-h-11 items-center justify-center gap-2 border border-cyan-400/35 bg-cyan-400/10 px-4 font-mono text-xs font-bold text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-35'
const primaryButton =
  'inline-flex min-h-12 items-center justify-center gap-2 border-2 border-lime-300 bg-lime-300 px-6 font-mono text-sm font-black text-[#061009] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-400'
const fieldClass =
  'h-10 w-full border border-cyan-400/20 bg-[#030a12] px-3 font-mono text-sm text-white outline-none focus:border-cyan-300'

function ScreenShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-[100dvh] bg-[#03050b] px-3 py-4 text-cyan-50 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 border-b border-cyan-400/20 pb-3">
          <p className="font-mono text-[10px] tracking-[0.3em] text-lime-300">
            ONE STEP ARCADE SYSTEM
          </p>
          <h1 className="mt-1 font-mono text-2xl font-black tracking-wider text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1 text-xs text-cyan-100/55">{subtitle}</p>
        </header>
        {children}
      </div>
    </main>
  )
}

function NumberOption({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-1.5">
      <span className="font-mono text-xs text-cyan-100/70">{label}</span>
      <input
        type="number"
        className={fieldClass}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function ToggleOption({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex h-11 items-center justify-between border border-cyan-400/20 bg-[#030a12] px-3 font-mono text-xs"
    >
      <span>{label}</span>
      <span className={checked ? 'text-lime-300' : 'text-zinc-500'}>
        {checked ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

export function TankGameApp() {
  const [phase, setPhase] = useState<AppGamePhase>('mainMenu')
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG)
  const [players, setPlayers] = useState<CampaignPlayer[]>([])
  const [currentRound, setCurrentRound] = useState(1)
  const [roundResults, setRoundResults] = useState<RoundResult[]>([])
  const [hasSave, setHasSave] = useState(false)
  const [activeShopPlayerId, setActiveShopPlayerId] = useState<string | null>(null)
  const [menuBeforeInfo, setMenuBeforeInfo] = useState<AppGamePhase>('mainMenu')
  const [showOnlineLobby, setShowOnlineLobby] = useState(false)
  const [onlineSession, setOnlineSession] = useState<OnlineGameSession | null>(null)

  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_KEY)
    if (savedSettings) {
      try {
        setConfig(normalizeConfig({ ...DEFAULT_CONFIG, ...JSON.parse(savedSettings) }))
      } catch {
        localStorage.removeItem(SETTINGS_KEY)
      }
    }
    const save = parseSave(localStorage.getItem(SAVE_KEY))
    if (!save && localStorage.getItem(SAVE_KEY)) localStorage.removeItem(SAVE_KEY)
    setHasSave(Boolean(save))
  }, [])

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(config))
  }, [config])

  useEffect(() => {
    if (
      onlineSession ||
      players.length === 0 ||
      phase === 'mainMenu' ||
      phase === 'gameSetup' ||
      phase === 'playerSetup' ||
      phase === 'help' ||
      phase === 'settings'
    ) {
      return
    }
    const safePhase = phase === 'battle' ? 'shopping' : phase
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(createSave(safePhase, config, players, currentRound, roundResults)),
    )
    setHasSave(true)
  }, [config, currentRound, onlineSession, phase, players, roundResults])

  const updateConfig = <K extends keyof GameConfig,>(key: K, value: GameConfig[K]) => {
    setConfig((current) => normalizeConfig({ ...current, [key]: value }))
  }

  const enterShop = (nextPlayers: CampaignPlayer[]) => {
    const prepared = structuredClone(nextPlayers)
    prepared.forEach((player) => {
      player.ready = false
      if (player.type === 'ai') autoShop(player)
    })
    setPlayers(prepared)
    setActiveShopPlayerId(prepared.find((player) => player.type === 'human')?.id ?? prepared[0]?.id)
    setPhase('shopping')
  }

  const startCampaign = (nextConfig: GameConfig, nextPlayers: CampaignPlayer[]) => {
    setConfig(nextConfig)
    setPlayers(nextPlayers)
    setCurrentRound(1)
    setRoundResults([])
    if (nextConfig.shopEnabled) enterShop(nextPlayers)
    else setPhase('battle')
  }

  const quickStart = () => {
    const quickConfig = { ...DEFAULT_CONFIG }
    startCampaign(quickConfig, createCampaignPlayers(quickConfig))
  }

  const continueGame = () => {
    const save = parseSave(localStorage.getItem(SAVE_KEY))
    if (!save) {
      setHasSave(false)
      return
    }
    setConfig(save.config)
    setPlayers(save.players)
    setCurrentRound(save.currentRound)
    setRoundResults(save.roundResults)
    if (save.phase === 'shopping') enterShop(save.players)
    else setPhase(save.phase)
  }

  const abandonToMenu = () => {
    if (onlineSession) {
      void fetch('/api/tank-battle/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'leave',
          roomId: onlineSession.room.id,
          playerId: onlineSession.localPlayerId,
          nickname: players.find((player) => player.id === onlineSession.localPlayerId)?.name,
          isHost: onlineSession.isHost,
          hostToken: onlineSession.hostToken,
        }),
      })
      void onlineSession.channel.unsubscribe()
      setOnlineSession(null)
    }
    localStorage.removeItem(SAVE_KEY)
    setHasSave(false)
    setPlayers([])
    setRoundResults([])
    setCurrentRound(1)
    setShowOnlineLobby(false)
    setPhase('mainMenu')
  }

  const startOnlineGame = (
    session: OnlineGameSession,
    onlineConfig: GameConfig,
    onlinePlayers: CampaignPlayer[],
  ) => {
    setOnlineSession(session)
    setConfig(onlineConfig)
    setPlayers(onlinePlayers)
    setCurrentRound(1)
    setRoundResults([])
    setShowOnlineLobby(false)
    setPhase('battle')
  }

  const updatePlayer = (id: string, patch: Partial<CampaignPlayer>) => {
    setPlayers((current) =>
      current.map((player) => (player.id === id ? { ...player, ...patch } : player)),
    )
  }

  const finishPlayerSetup = () => {
    const humanCount = players.filter((player) => player.type === 'human').length
    if (humanCount === 0) return
    const teamByColor = new Map<string, number>()
    const playersWithColorTeams = players.map((player) => {
      if (!teamByColor.has(player.color)) {
        teamByColor.set(player.color, teamByColor.size)
      }
      return { ...player, team: teamByColor.get(player.color) ?? null }
    })
    const nextConfig = normalizeConfig({
      ...config,
      humanCount,
      aiCount: players.length - humanCount,
    })
    startCampaign(nextConfig, playersWithColorTeams)
  }

  const buy = (playerId: string, itemId: ShopItemId) => {
    setPlayers((current) =>
      current.map((player) => {
        if (player.id !== playerId || player.type === 'ai') return player
        const next = structuredClone(player)
        purchaseItem(next, itemId)
        return next
      }),
    )
  }

  const toggleReady = (playerId: string) => {
    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId && player.type === 'human'
          ? { ...player, ready: !player.ready }
          : player,
      ),
    )
  }

  const allReady = players.length > 0 && players.every((player) => player.ready)

  const onRoundEnd = (result: RoundResult, battlePlayers: CampaignPlayer[]) => {
    const rewarded = calculateRoundRewards(result, battlePlayers)
    setPlayers(rewarded)
    setRoundResults((current) => [...current, result])
    setPhase('roundResult')
  }

  const advanceRound = () => {
    if (currentRound >= config.totalRounds) {
      setPhase('finalResult')
      return
    }
    setCurrentRound((round) => round + 1)
    if (config.shopEnabled) enterShop(players)
    else setPhase('battle')
  }

  const sameSettingsAgain = () => {
    startCampaign(config, createCampaignPlayers(config).map((fresh, index) => ({
      ...fresh,
      name: players[index]?.name ?? fresh.name,
      type: players[index]?.type ?? fresh.type,
      aiDifficulty: players[index]?.aiDifficulty ?? fresh.aiDifficulty,
      color: players[index]?.color ?? fresh.color,
    })))
  }

  const rankedPlayers = useMemo(() => rankPlayers(players), [players])
  const latestResult = roundResults.at(-1) ?? null

  if (showOnlineLobby) {
    return (
      <TankOnlineLobby
        onStart={startOnlineGame}
        onExit={() => setShowOnlineLobby(false)}
      />
    )
  }

  if (phase === 'battle') {
    return (
      <TankGameCanvas
        key={`round-${currentRound}`}
        config={config}
        players={players}
        round={currentRound}
        online={onlineSession ?? undefined}
        seed={onlineSession?.seed}
        onRoundEnd={onRoundEnd}
        onMainMenu={abandonToMenu}
      />
    )
  }

  if (phase === 'mainMenu') {
    return (
      <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#02040a] px-4 py-8 text-cyan-50">
        <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(34,211,238,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.05)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative w-full max-w-xl">
          <div className="mb-7 text-center">
            <p className="font-mono text-xs tracking-[0.38em] text-lime-300">ONE STEP PRESENTS</p>
            <h1 className="mt-3 font-mono text-4xl font-black tracking-tight text-white sm:text-6xl">
              ONE STEP
              <span className="block text-orange-300">ARTILLERY ARENA</span>
            </h1>
            <p className="mt-3 font-mono text-xs text-cyan-100/45">
              ROGUELIKE TACTICAL TERRAIN COMBAT · ONLINE ARENA
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className={`${menuButton} sm:col-span-2`}
              onClick={() => setShowOnlineLobby(true)}>
              <span className="flex items-center gap-3">
                <Wifi className="h-4 w-4 text-cyan-300" />온라인 PvP · 최대 10명
              </span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" className={`${menuButton} sm:col-span-2`} onClick={quickStart}>
              <span className="flex items-center gap-3"><Play className="h-4 w-4 text-lime-300" />빠른 시작</span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" className={menuButton} onClick={() => {
              setConfig(DEFAULT_CONFIG)
              setPhase('gameSetup')
            }}>
              <span className="flex items-center gap-3"><Gamepad2 className="h-4 w-4" />새 게임</span>
            </button>
            <button type="button" className={menuButton} disabled={!hasSave} onClick={continueGame}>
              <span className="flex items-center gap-3"><Save className="h-4 w-4" />이어하기</span>
            </button>
            <button type="button" className={menuButton} onClick={() => {
              setMenuBeforeInfo('mainMenu')
              setPhase('help')
            }}>
              <span className="flex items-center gap-3"><BookOpen className="h-4 w-4" />게임 방법</span>
            </button>
            <button type="button" className={menuButton} onClick={() => {
              setMenuBeforeInfo('mainMenu')
              setPhase('settings')
            }}>
              <span className="flex items-center gap-3"><Settings className="h-4 w-4" />설정</span>
            </button>
            <button type="button" className={menuButton} onClick={() => setPhase('finalResult')}>
              <span className="flex items-center gap-3"><Trophy className="h-4 w-4" />랭킹</span>
            </button>
            <Link href="/dashboard/my" className={menuButton}>
              <span className="flex items-center gap-3"><ArrowLeft className="h-4 w-4" />메인 서비스로</span>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (phase === 'gameSetup') {
    return (
      <ScreenShell title="새 게임 설정" subtitle="모든 옵션은 다음 전투부터 실제 물리와 진행 규칙에 적용됩니다.">
        <div className="grid gap-3 border border-cyan-400/20 bg-[#07111d] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberOption label="전체 플레이어" value={config.playerCount} min={2} max={6}
            onChange={(value) => updateConfig('playerCount', value)} />
          <NumberOption label="사람 플레이어" value={config.humanCount} min={1} max={config.playerCount}
            onChange={(value) => updateConfig('humanCount', value)} />
          <NumberOption label="AI 플레이어" value={config.aiCount} min={0} max={5}
            onChange={(value) => updateConfig('humanCount', config.playerCount - value)} />
          <label className="space-y-1.5"><span className="font-mono text-xs text-cyan-100/70">기본 AI 난이도</span>
            <select className={fieldClass} value={config.aiDifficulty}
              onChange={(event) => updateConfig('aiDifficulty', event.target.value as AiDifficulty)}>
              <option value="easy">쉬움</option><option value="normal">보통</option><option value="hard">어려움</option>
            </select>
          </label>
          <NumberOption label="전체 라운드" value={config.totalRounds} min={1} max={9}
            onChange={(value) => updateConfig('totalRounds', value)} />
          <NumberOption label="시작 체력" value={config.startingHealth} min={50} max={300} step={10}
            onChange={(value) => updateConfig('startingHealth', value)} />
          <NumberOption label="시작 자금" value={config.startingCoins} min={0} max={20000} step={500}
            onChange={(value) => updateConfig('startingCoins', value)} />
          <NumberOption label="턴 제한시간" value={config.turnTimeSeconds} min={10} max={120} step={5}
            onChange={(value) => updateConfig('turnTimeSeconds', value)} />
          <label className="space-y-1.5"><span className="font-mono text-xs text-cyan-100/70">바람 방식</span>
            <select className={fieldClass} value={config.windMode}
              onChange={(event) => updateConfig('windMode', event.target.value as GameConfig['windMode'])}>
              <option value="none">바람 없음</option><option value="fixed">경기 고정</option>
              <option value="round">라운드마다</option><option value="turn">턴마다</option>
            </select>
          </label>
          <label className="space-y-1.5"><span className="font-mono text-xs text-cyan-100/70">지형 유형</span>
            <select className={fieldClass} value={config.terrainType}
              onChange={(event) => updateConfig('terrainType', event.target.value as GameConfig['terrainType'])}>
              <option value="random">랜덤 혼합</option><option value="hills">완만한 언덕</option>
              <option value="mountains">높은 산</option><option value="valley">깊은 계곡</option>
              <option value="rough">울퉁불퉁</option>
            </select>
          </label>
          <ToggleOption label="상점 사용" checked={config.shopEnabled}
            onChange={(value) => updateConfig('shopEnabled', value)} />
          <ToggleOption label="낙하 피해" checked={config.fallDamage}
            onChange={(value) => updateConfig('fallDamage', value)} />
          <ToggleOption label="CRT 효과" checked={config.crtEffect}
            onChange={(value) => updateConfig('crtEffect', value)} />
          <ToggleOption label="화면 흔들림" checked={config.screenShake}
            onChange={(value) => updateConfig('screenShake', value)} />
        </div>
        <div className="mt-4 flex justify-between gap-3">
          <button type="button" className={actionButton} onClick={() => setPhase('mainMenu')}><ArrowLeft className="h-4 w-4" /> 뒤로</button>
          <button type="button" className={primaryButton} onClick={() => {
            setPlayers(createCampaignPlayers(config))
            setPhase('playerSetup')
          }}><Users className="h-4 w-4" /> 플레이어 설정으로</button>
        </div>
      </ScreenShell>
    )
  }

  if (phase === 'playerSetup') {
    return (
      <ScreenShell title="플레이어 설정" subtitle="이름, 조종 유형, AI 난이도와 탱크 색상을 지정하세요.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {players.map((player, index) => (
            <section key={player.id} className="border border-cyan-400/20 bg-[#07111d] p-4">
              <p className="mb-3 font-mono text-xs font-bold" style={{ color: player.color }}>PLAYER {index + 1}</p>
              <div className="grid gap-3">
                <label className="space-y-1"><span className="text-xs text-cyan-100/60">이름</span>
                  <input className={fieldClass} maxLength={16} value={player.name}
                    onChange={(event) => updatePlayer(player.id, { name: event.target.value })} />
                </label>
                <label className="space-y-1"><span className="text-xs text-cyan-100/60">유형</span>
                  <select className={fieldClass} value={player.type}
                    onChange={(event) => updatePlayer(player.id, { type: event.target.value as CampaignPlayer['type'] })}>
                    <option value="human">사람</option><option value="ai">AI</option>
                  </select>
                </label>
                {player.type === 'ai' && (
                  <label className="space-y-1"><span className="text-xs text-cyan-100/60">AI 난이도</span>
                    <select className={fieldClass} value={player.aiDifficulty}
                      onChange={(event) => updatePlayer(player.id, { aiDifficulty: event.target.value as AiDifficulty })}>
                      <option value="easy">쉬움</option><option value="normal">보통</option><option value="hard">어려움</option>
                    </select>
                  </label>
                )}
                <div><span className="text-xs text-cyan-100/60">탱크 색상 · 같은 색상은 같은 팀</span>
                  <div className="mt-2 flex flex-wrap gap-2">{PLAYER_COLORS.map((color) => (
                    <button key={color} type="button" aria-label={`색상 ${color}`}
                      onClick={() => updatePlayer(player.id, { color })}
                      className={`h-8 w-8 border-2 ${player.color === color ? 'border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: color }} />
                  ))}</div>
                </div>
              </div>
            </section>
          ))}
        </div>
        <div className="mt-4 flex justify-between gap-3">
          <button type="button" className={actionButton} onClick={() => setPhase('gameSetup')}><ArrowLeft className="h-4 w-4" /> 뒤로</button>
          <button type="button" className={primaryButton}
            disabled={!players.some((player) => player.type === 'human') || players.some((player) => !player.name.trim())}
            onClick={finishPlayerSetup}><ShoppingCart className="h-4 w-4" /> {config.shopEnabled ? '상점으로' : '전투 시작'}</button>
        </div>
      </ScreenShell>
    )
  }

  if (phase === 'shopping') {
    const active = players.find((player) => player.id === activeShopPlayerId) ?? players[0]
    return (
      <ScreenShell title={`전투 상점 · ROUND ${currentRound}`} subtitle="AI는 난이도와 보유 자금에 맞춰 자동 구매를 완료했습니다.">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {players.map((player) => (
            <button key={player.id} type="button" onClick={() => setActiveShopPlayerId(player.id)}
              className={`min-w-36 border px-3 py-2 text-left font-mono text-xs ${active?.id === player.id ? 'border-lime-300 bg-lime-300/10' : 'border-cyan-400/20 bg-[#07111d]'}`}>
              <b style={{ color: player.color }}>{player.name}</b>
              <span className="mt-1 block text-cyan-100/55">{player.type === 'ai' ? 'AI 구매 완료' : player.ready ? '준비 완료' : '구매 중'} · {player.coins.toLocaleString()} C</span>
            </button>
          ))}
        </div>
        {active && (
          <>
            <div className="mb-3 flex items-center justify-between border border-orange-300/25 bg-orange-300/5 px-4 py-3 font-mono">
              <span style={{ color: active.color }}>{active.name}</span>
              <strong className="text-orange-200">{active.coins.toLocaleString()} COINS</strong>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {SHOP_ITEMS.map((item) => {
                const owned = isWeaponId(item.id)
                  ? active.weapons[item.id]
                  : active.equipment[item.id]
                const theme = 'visual' in item ? item.visual.theme : item.theme
                const effectLabel = 'visual' in item ? item.visual.effectLabel : item.effectLabel
                const tacticalRole = 'tacticalRole' in item ? item.tacticalRole : '전술 장비'
                const mechanic = 'mechanic' in item
                  ? item.mechanic
                  : item.id === 'shield'
                    ? '라운드 시작 시 자동 장착되는 선제 방어'
                    : '사용하면 공격하지 않고 턴 종료'
                return (
                  <article key={item.id}
                    style={{ borderTopColor: theme, boxShadow: `inset 0 24px 32px -30px ${theme}66` }}
                    className="flex min-h-44 flex-col border border-cyan-400/20 border-t-2 bg-[#07111d] p-3">
                    <div className="flex items-start justify-between">
                      <span className="text-2xl" style={{ color: theme, textShadow: `0 0 12px ${theme}` }}>{item.icon}</span>
                      <span className="font-mono text-xs text-orange-200">{item.price.toLocaleString()} C</span></div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <h2 className="font-mono text-sm font-bold text-white">{item.name}</h2>
                      <span className="border px-1.5 py-0.5 font-mono text-[9px]"
                        style={{ borderColor: `${theme}88`, color: theme }}>{tacticalRole}</span>
                    </div>
                    <p className="mt-1 text-xs text-cyan-100/50">{item.description}</p>
                    <p className="mt-1 font-mono text-[10px] text-cyan-100/65">전략: {mechanic}</p>
                    <p className="mt-1 flex-1 font-mono text-[10px]" style={{ color: theme }}>✦ {effectLabel}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-mono text-xs">보유 {owned}</span>
                      <button type="button" className={actionButton} disabled={active.type === 'ai' || active.ready || active.coins < item.price}
                        onClick={() => buy(active.id, item.id)}>구매 +1</button>
                    </div>
                  </article>
                )
              })}
            </div>
            {active.type === 'human' && (
              <div className="mt-4 flex justify-end">
                <button type="button" className={active.ready ? actionButton : primaryButton}
                  onClick={() => toggleReady(active.id)}>{active.ready ? '준비 취소' : '준비 완료'}</button>
              </div>
            )}
          </>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-cyan-400/20 pt-4">
          <button type="button" className={actionButton} onClick={abandonToMenu}>경기 포기</button>
          <button type="button" className={primaryButton} disabled={!allReady} onClick={() => setPhase('battle')}>
            <Play className="h-4 w-4" /> ROUND {currentRound} 전투 시작
          </button>
        </div>
      </ScreenShell>
    )
  }

  if (phase === 'roundResult' && latestResult) {
    const winnerIds = latestResult.winnerIds ?? [latestResult.winnerId].filter(Boolean)
    const winners = players.filter((player) => winnerIds.includes(player.id))
    return (
      <ScreenShell title={`ROUND ${latestResult.round} 결과`} subtitle="피해량과 생존 순위에 따라 전투 자금이 지급되었습니다.">
        <div className="mb-4 border-2 border-lime-300/50 bg-lime-300/10 p-5 text-center">
          <p className="font-mono text-xs tracking-[0.25em] text-lime-300">ROUND WINNER</p>
          <p className="mt-2 font-mono text-3xl font-black text-white">
            {winners.length ? winners.map((winner) => winner.name).join(' · ') : '무승부'}
          </p>
        </div>
        <div className="overflow-x-auto border border-cyan-400/20">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-cyan-400/10 font-mono text-cyan-200"><tr>
              <th className="p-3">순위</th><th>플레이어</th><th>준 피해</th><th>받은 피해</th>
              <th>처치</th><th>획득 자금</th><th>총 자금</th><th>라운드 승리</th>
            </tr></thead>
            <tbody>{latestResult.stats.sort((a, b) => a.rank - b.rank).map((stats) => {
              const player = players.find((entry) => entry.id === stats.playerId)
              return <tr key={stats.playerId} className="border-t border-cyan-400/10">
                <td className="p-3 font-mono">#{stats.rank}</td><td style={{ color: player?.color }}>{player?.name}</td>
                <td>{stats.damageDealt}</td><td>{stats.damageTaken}</td><td>{stats.kills}</td>
                <td className="text-lime-300">+{stats.coinsEarned}</td><td>{player?.coins.toLocaleString()}</td><td>{player?.roundWins}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={actionButton} onClick={abandonToMenu}>메인 메뉴</button>
          <button type="button" className={primaryButton} onClick={advanceRound}>
            {currentRound >= config.totalRounds ? <><Trophy className="h-4 w-4" /> 최종 결과</> :
              config.shopEnabled ? <><ShoppingCart className="h-4 w-4" /> 상점으로</> :
                <><Play className="h-4 w-4" /> 다음 라운드</>}
          </button>
        </div>
      </ScreenShell>
    )
  }

  if (phase === 'finalResult') {
    const champion = rankedPlayers[0]
    return (
      <ScreenShell title={roundResults.length ? '최종 결과' : '로컬 랭킹'} subtitle="라운드 승리, 처치, 피해량, 남은 자금 순으로 집계됩니다.">
        {champion ? (
          <>
            <div className="mb-4 border-2 border-orange-300/50 bg-orange-300/10 p-5 text-center">
              <Trophy className="mx-auto h-8 w-8 text-orange-300" />
              <p className="mt-2 font-mono text-xs tracking-[0.25em] text-orange-200">CHAMPION</p>
              <p className="mt-1 font-mono text-3xl font-black text-white">{champion.name}</p>
            </div>
            <div className="grid gap-2">{rankedPlayers.map((player, index) => (
              <div key={player.id} className="grid grid-cols-[48px_1fr_repeat(4,minmax(70px,auto))] items-center gap-3 border border-cyan-400/20 bg-[#07111d] p-3 text-xs">
                <b className="font-mono text-lg">#{index + 1}</b><b style={{ color: player.color }}>{player.name}</b>
                <span>승 {player.roundWins}</span><span>킬 {player.kills}</span><span>피해 {player.totalDamage}</span><span>{player.coins.toLocaleString()} C</span>
              </div>
            ))}</div>
          </>
        ) : <div className="border border-cyan-400/20 bg-[#07111d] p-10 text-center text-cyan-100/50">완료된 로컬 경기가 없습니다.</div>}
        {roundResults.length > 0 && (
          <div className="mt-4 border border-cyan-400/20 bg-[#07111d] p-4">
            <p className="font-mono text-xs text-cyan-300">라운드별 승자</p>
            <div className="mt-2 flex flex-wrap gap-2">{roundResults.map((result) => (
              <span key={result.round} className="border border-white/10 px-3 py-1 text-xs">
                R{result.round} · {players.find((player) => player.id === result.winnerId)?.name ?? '무승부'}
              </span>
            ))}</div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {players.length > 0 && <button type="button" className={actionButton} onClick={sameSettingsAgain}><RotateCcw className="h-4 w-4" /> 같은 설정</button>}
          <button type="button" className={actionButton} onClick={() => setPhase('gameSetup')}>새 게임</button>
          <button type="button" className={primaryButton} onClick={abandonToMenu}>메인 메뉴</button>
        </div>
      </ScreenShell>
    )
  }

  if (phase === 'help') {
    const sections = [
      ['게임 목표', '각도와 세기를 조절해 마지막까지 생존하고 가장 많은 라운드에서 승리하세요.'],
      ['턴 진행', '자기 차례에 무기·각도·세기를 정하고 제한시간 안에 발사합니다.'],
      ['바람', '상단 화살표 방향과 수치만큼 포탄의 X축 가속도가 달라집니다.'],
      ['날씨', '비는 탄도를 무겁게 하고 지형 붕괴를 빠르게 하며 무작위 낙뢰가 발생합니다. 눈은 바람 영향과 붕괴 속도를 낮춥니다.'],
      ['지형과 낙하', '폭발은 픽셀 지형을 파괴하며 발판이 사라진 탱크는 아래로 떨어집니다.'],
      ['상점', '라운드 전 자금으로 무기, 방어막, 수리 키트, 순간 이동 장치를 구매합니다.'],
      ['무기 상성', '중포탄은 방어막 관통, 삼연발탄은 구역 압박, 지형 파괴탄은 낙하 유도, 대형 폭발탄은 원거리 광역 결정타에 유리합니다.'],
      ['전술 장비', '수리와 순간 이동은 공격을 포기하고 사용하는 생존 선택입니다. 다음 공격 기회를 내주는 대신 위기를 벗어날 수 있습니다.'],
      ['승리 조건', '라운드 승리 → 처치 → 총 피해 → 남은 자금 순으로 최종 순위를 정합니다.'],
    ]
    return (
      <ScreenShell title="게임 방법" subtitle="고전 포병 방식 위에 ONE STEP만의 지형·상점·라운드 규칙을 적용했습니다.">
        <div className="grid gap-3 md:grid-cols-2">{sections.map(([title, body]) => (
          <article key={title} className="border border-cyan-400/20 bg-[#07111d] p-4">
            <h2 className="font-mono text-sm font-bold text-lime-300">{title}</h2><p className="mt-2 text-sm leading-6 text-cyan-50/65">{body}</p>
          </article>
        ))}</div>
        <div className="mt-3 border border-orange-300/25 bg-orange-300/5 p-4 font-mono text-xs leading-7 text-orange-100">
          ← → 각도 · ↑ ↓ 세기 · SPACE 발사 · TAB / SHIFT+TAB 무기 변경 · ESC 일시정지
        </div>
        <button type="button" className={`${actionButton} mt-4`} onClick={() => setPhase(menuBeforeInfo)}><ArrowLeft className="h-4 w-4" /> 뒤로</button>
      </ScreenShell>
    )
  }

  return (
    <ScreenShell title="게임 설정" subtitle="화면 효과와 조준 보조를 변경합니다.">
      <div className="grid max-w-xl gap-3 border border-cyan-400/20 bg-[#07111d] p-4">
        <ToggleOption label="CRT 스캔라인" checked={config.crtEffect}
          onChange={(value) => updateConfig('crtEffect', value)} />
        <ToggleOption label="화면 흔들림" checked={config.screenShake}
          onChange={(value) => updateConfig('screenShake', value)} />
      </div>
      <button type="button" className={`${actionButton} mt-4`} onClick={() => setPhase(menuBeforeInfo)}><ArrowLeft className="h-4 w-4" /> 저장하고 뒤로</button>
    </ScreenShell>
  )
}

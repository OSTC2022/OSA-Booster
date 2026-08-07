/** 마라톤온라인(roadrun) 지역 코드 — marathon.pe.kr 캘린더와 동일 */

export const MARATHON_ONLINE_REGIONS = [
  '서울',
  '경기',
  '인천',
  '강원',
  '충북',
  '충남',
  '대전',
  '전북',
  '전남',
  '광주',
  '경북',
  '대구',
  '경남',
  '부산',
  '울산',
  '제주',
  '세종',
  '해외',
  '기타',
] as const

export type MarathonOnlineRegion = (typeof MARATHON_ONLINE_REGIONS)[number]

const REGION_HINTS: Array<{ region: MarathonOnlineRegion; patterns: RegExp[] }> = [
  { region: '서울', patterns: [/서울/, /여의도/, /상암/, /뚝섬/, /한강/, /성북/, /중랑/, /잠실/, /올림픽공원/, /광화문/, /낙산/] },
  { region: '인천', patterns: [/인천/, /영종/, /송도/, /부평/] },
  { region: '경기', patterns: [/경기/, /일산/, /킨텍스/, /의정부/, /수원/, /성남/, /분당/, /고양/, /용인/, /안양/, /부천/, /남양주/, /파주/, /화성/, /평택/, /김포/, /광명/, /시흥/, /군포/, /의왕/, /하남/, /광주광역시(?!)/, /동두천/, /양평/, /가평/, /포천/, /연천/, /오산/, /이천/, /여주/] },
  { region: '강원', patterns: [/강원/, /평창/, /대관령/, /춘천/, /강릉/, /속초/, /원주/, /홍천/, /정선/, /양양/] },
  { region: '충북', patterns: [/충북/, /청주/, /충주/, /제천/, /증평/, /단양/, /음성/, /진천/] },
  { region: '충남', patterns: [/충남/, /천안/, /아산/, /공주/, /보령/, /서산/, /논산/, /당진/, /예산/] },
  { region: '대전', patterns: [/대전/, /엑스포/] },
  { region: '세종', patterns: [/세종/] },
  { region: '전북', patterns: [/전북/, /전주/, /군산/, /익산/, /정읍/, /남원/, /장수/, /무주/, /고창/] },
  { region: '전남', patterns: [/전남/, /여수/, /순천/, /목포/, /광양/, /나주/, /화순/, /장흥/, /해남/] },
  { region: '광주', patterns: [/광주광역시/, /빛고을/, /(?<!경)광주/] },
  { region: '경북', patterns: [/경북/, /포항/, /구미/, /경주/, /안동/, /김천/, /상주/, /영주/, /문경/, /울릉/] },
  { region: '대구', patterns: [/대구/, /신천동로/, /대구스타디움/] },
  { region: '경남', patterns: [/경남/, /창원/, /김해/, /진주/, /양산/, /거제/, /통영/, /사천/, /밀양/, /함안/, /에덴밸리/] },
  { region: '부산', patterns: [/부산/, /해운대/, /광안리/, /스포원/] },
  { region: '울산', patterns: [/울산/] },
  { region: '제주', patterns: [/제주/, /서귀포/] },
  { region: '해외', patterns: [/해외/, /일본/, /중국/, /미국/, /유럽/, /도쿄/, /오사카/, /베를린/, /보스턴/, /뉴욕/] },
]

export function inferMarathonOnlineRegion(
  title: string,
  venue: string,
): MarathonOnlineRegion {
  const haystack = `${title} ${venue}`
  for (const entry of REGION_HINTS) {
    if (entry.patterns.some((pattern) => pattern.test(haystack))) {
      return entry.region
    }
  }
  return '기타'
}

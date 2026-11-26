// Busca jogos no football-data.org, calcula a previsão de cada um e grava
// public/dados/jogos.json. Uso: FOOTBALL_DATA_TOKEN=... node scripts/gerar-jogos.ts [pasta]
import { mkdir, writeFile } from 'node:fs/promises'
import { prever, type Partida } from './modelo.ts'

const TOKEN = process.env.FOOTBALL_DATA_TOKEN
if (!TOKEN) {
  console.error('Defina FOOTBALL_DATA_TOKEN (chave grátis em football-data.org).')
  process.exit(1)
}
const PASTA = process.argv[2] ?? 'public/dados'

const COMPETICOES: [string, string][] = [
  ['BSA', 'Brasileirão Série A'],
  ['CLI', 'Copa Libertadores'],
  ['CL', 'Champions League'],
  ['PL', 'Premier League'],
  ['PD', 'La Liga'],
  ['SA', 'Serie A (Itália)'],
  ['BL1', 'Bundesliga'],
  ['FL1', 'Ligue 1'],
  ['PPL', 'Primeira Liga'],
  ['DED', 'Eredivisie'],
  ['ELC', 'Championship'],
]

const JANELA_ANTES_MS = 2 * 86_400_000
const JANELA_DEPOIS_MS = 7 * 86_400_000

interface TimeApi {
  id: number
  name: string
  shortName: string | null
  crest: string | null
}
interface PartidaApi {
  id: number
  utcDate: string
  status: string
  homeTeam: TimeApi
  awayTeam: TimeApi
  score: { fullTime: { home: number | null; away: number | null } }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function buscar(codigo: string): Promise<PartidaApi[]> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(`https://api.football-data.org/v4/competitions/${codigo}/matches`, {
      headers: { 'X-Auth-Token': TOKEN! },
    })
    if (r.status === 429) {
      await dormir(61_000)
      continue
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const json = (await r.json()) as { matches: PartidaApi[] }
    return json.matches
  }
  throw new Error('limite de requisições excedido')
}

const nome = (t: TimeApi) => t.shortName || t.name
const situacao = (s: string) =>
  s === 'FINISHED' ? 'encerrado' : s === 'IN_PLAY' || s === 'PAUSED' ? 'aoVivo' : s === 'SCHEDULED' || s === 'TIMED' ? 'agendado' : 'outro'

const agora = Date.now()
const jogos: unknown[] = []

for (const [codigo, titulo] of COMPETICOES) {
  try {
    const todas = await buscar(codigo)
    const historico: Partida[] = todas
      .filter((p) => p.status === 'FINISHED' && p.score.fullTime.home !== null && p.score.fullTime.away !== null)
      .map((p) => ({
        data: Date.parse(p.utcDate),
        mandante: p.homeTeam.id,
        visitante: p.awayTeam.id,
        golsMandante: p.score.fullTime.home!,
        golsVisitante: p.score.fullTime.away!,
      }))

    for (const p of todas) {
      const quando = Date.parse(p.utcDate)
      const estado = situacao(p.status)
      if (estado === 'outro' || quando < agora - JANELA_ANTES_MS || quando > agora + JANELA_DEPOIS_MS) continue
      if (!p.homeTeam.id || !p.awayTeam.id) continue
      const placar = estado === 'agendado' ? null : { casa: p.score.fullTime.home ?? 0, fora: p.score.fullTime.away ?? 0 }
      jogos.push({
        id: p.id,
        codigo,
        competicao: titulo,
        data: p.utcDate,
        situacao: estado,
        mandante: { nome: nome(p.homeTeam), escudo: p.homeTeam.crest },
        visitante: { nome: nome(p.awayTeam), escudo: p.awayTeam.crest },
        placar,
        previsao: prever(historico, p.homeTeam.id, p.awayTeam.id, quando),
      })
    }
    console.log(`${codigo}: ${historico.length} jogos usados no modelo`)
  } catch (e) {
    console.warn(`${codigo}: ignorada (${e instanceof Error ? e.message : e})`)
  }
  await dormir(7_000) // plano grátis: 10 requisições por minuto
}

await mkdir(PASTA, { recursive: true })
await writeFile(`${PASTA}/jogos.json`, JSON.stringify({ atualizadoEm: new Date().toISOString(), jogos }))
console.log(`${jogos.length} jogos gravados em ${PASTA}/jogos.json`)

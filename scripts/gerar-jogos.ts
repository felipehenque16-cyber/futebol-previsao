// Busca jogos no football-data.org, calcula previsões e grava jogos + histórico para backtesting.
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

interface TimeApi { id: number; name: string; shortName: string | null; crest: string | null }
interface PartidaApi {
  id: number
  utcDate: string
  status: string
  homeTeam: TimeApi
  awayTeam: TimeApi
  score: { fullTime: { home: number | null; away: number | null } }
}
interface JogoHistorico extends Partida {
  id: number
  codigo: string
  competicao: string
  mandanteNome: string
  visitanteNome: string
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function buscar(codigo: string): Promise<PartidaApi[]> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const resposta = await fetch(`https://api.football-data.org/v4/competitions/${codigo}/matches`, {
      headers: { 'X-Auth-Token': TOKEN },
    })
    if (resposta.status === 429) {
      console.warn(`${codigo}: limite da API atingido; aguardando 61 segundos.`)
      await dormir(61_000)
      continue
    }
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
    const json = (await resposta.json()) as { matches?: PartidaApi[] }
    return Array.isArray(json.matches) ? json.matches : []
  }
  throw new Error('limite de requisições excedido após 3 tentativas')
}
const nome = (time: TimeApi) => time.shortName || time.name
const situacao = (status: string) =>
  status === 'FINISHED' ? 'encerrado'
    : status === 'IN_PLAY' || status === 'PAUSED' ? 'aoVivo'
      : status === 'SCHEDULED' || status === 'TIMED' ? 'agendado' : 'outro'

const agora = Date.now()
const jogos: unknown[] = []
const historicoCompleto: JogoHistorico[] = []
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
      .filter((p) => Number.isFinite(p.data))

    for (const partida of todas) {
      const quando = Date.parse(partida.utcDate)
      const estado = situacao(partida.status)
      if (!Number.isFinite(quando) || estado === 'outro' || quando < agora - JANELA_ANTES_MS || quando > agora + JANELA_DEPOIS_MS) continue
      if (!partida.homeTeam.id || !partida.awayTeam.id) continue

      const golsCasa = partida.score.fullTime.home
      const golsFora = partida.score.fullTime.away
      const placar = golsCasa !== null && golsFora !== null ? { casa: golsCasa, fora: golsFora } : null
      jogos.push({
        id: partida.id,
        codigo,
        competicao: titulo,
        data: partida.utcDate,
        situacao: estado,
        mandante: { nome: nome(partida.homeTeam), escudo: partida.homeTeam.crest },
        visitante: { nome: nome(partida.awayTeam), escudo: partida.awayTeam.crest },
        placar,
        previsao: prever(historico, partida.homeTeam.id, partida.awayTeam.id, quando),
      })
    }
    for (const p of todas) {
      const golsCasa = p.score.fullTime.home
      const golsFora = p.score.fullTime.away
      const data = Date.parse(p.utcDate)
      if (p.status !== 'FINISHED' || golsCasa === null || golsFora === null ||
        !Number.isFinite(data) || !p.homeTeam.id || !p.awayTeam.id) continue
      historicoCompleto.push({
        id: p.id,
        codigo,
        competicao: titulo,
        data,
        mandante: p.homeTeam.id,
        visitante: p.awayTeam.id,
        golsMandante: golsCasa,
        golsVisitante: golsFora,
        mandanteNome: nome(p.homeTeam),
        visitanteNome: nome(p.awayTeam),
      })
    }
    console.log(`${codigo}: ${historico.length} jogos históricos válidos; ${todas.length} partidas recebidas`)
  } catch (erro) {
    console.warn(`${codigo}: ignorada (${erro instanceof Error ? erro.message : erro})`)
  }
  await dormir(7_000)
}
await mkdir(PASTA, { recursive: true })
await writeFile(`${PASTA}/jogos.json`, JSON.stringify({
  atualizadoEm: new Date().toISOString(),
  jogos: jogos.sort((a, b) => Date.parse((a as {data:string}).data) - Date.parse((b as {data:string}).data)),
}))
await writeFile(`${PASTA}/historico.json`, JSON.stringify({
  atualizadoEm: new Date().toISOString(),
  jogos: historicoCompleto.sort((a, b) => a.data - b.data),
}))
console.log(`${jogos.length} jogos gravados; ${historicoCompleto.length} resultados históricos salvos em ${PASTA}`)

// Modelo híbrido: Elo mede a força relativa dos clubes e Poisson estima os gols.
// Usa somente partidas anteriores ao jogo previsto. Não usa odds nem dados de apostas.
export interface Partida {
  data: number
  mandante: number
  visitante: number
  golsMandante: number
  golsVisitante: number
}
export interface Previsao {
  casa: number
  empate: number
  fora: number
  golsEsperadosCasa: number
  golsEsperadosFora: number
  eloMandante: number
  eloVisitante: number
}
const DIA_MS = 86_400_000
const MEIA_VIDA_DIAS = 120
const PESO_MEDIA = 3
const MAX_GOLS = 20
const CAUDA_POISSON = 0.999999
const ELO_INICIAL = 1500
const ELO_K = 20
const VANTAGEM_CASA_ELO = 55
interface Soma { peso: number; feitos: number; sofridos: number }

/** Atualiza o Elo cronologicamente, sem consultar partidas posteriores ao jogo previsto. */
function calcularElo(historico: Partida[], quando: number): Map<number, number> {
  const ratings = new Map<number, number>()
  const partidas = historico
    .filter((p) => p.data < quando && Number.isFinite(p.data) &&
      Number.isFinite(p.golsMandante) && Number.isFinite(p.golsVisitante) &&
      p.golsMandante >= 0 && p.golsVisitante >= 0)
    .sort((a, b) => a.data - b.data)

  const rating = (id: number) => ratings.get(id) ?? ELO_INICIAL
  for (const p of partidas) {
    const casa = rating(p.mandante)
    const fora = rating(p.visitante)
    const esperadoCasa = 1 / (1 + 10 ** ((fora - (casa + VANTAGEM_CASA_ELO)) / 400))
    const esperadoFora = 1 - esperadoCasa
    const resultadoCasa = p.golsMandante > p.golsVisitante ? 1
      : p.golsMandante === p.golsVisitante ? 0.5 : 0
    const resultadoFora = 1 - resultadoCasa
    const diferencaGols = Math.abs(p.golsMandante - p.golsVisitante)
    const multiplicador = diferencaGols === 0 ? 1 : Math.min(2.5, 1 + 0.15 * diferencaGols)
    const ajuste = ELO_K * multiplicador
    ratings.set(p.mandante, casa + ajuste * (resultadoCasa - esperadoCasa))
    ratings.set(p.visitante, fora + ajuste * (resultadoFora - esperadoFora))
  }
  return ratings
}
function somar(mapa: Map<number, Soma>, id: number, peso: number, feitos: number, sofridos: number) {
  const s = mapa.get(id) ?? { peso: 0, feitos: 0, sofridos: 0 }
  s.peso += peso
  s.feitos += peso * feitos
  s.sofridos += peso * sofridos
  mapa.set(id, s)
}
/** Calcula a distribuição até cobrir praticamente toda a probabilidade. */
function poisson(lambda: number): number[] {
  const p = [Math.exp(-lambda)]
  let acumulada = p[0]
  for (let k = 1; k <= MAX_GOLS && acumulada < CAUDA_POISSON; k++) {
    p.push((p[k - 1] * lambda) / k)
    acumulada += p[k]
  }
  return p
}
/** Combina taxas de gols ponderadas pelo tempo com o ajuste de força do Elo. */
export function prever(historico: Partida[], mandante: number, visitante: number, quando: number): Previsao | null {
  const base = historico.filter((p) =>
    p.data < quando &&
    Number.isFinite(p.golsMandante) &&
    Number.isFinite(p.golsVisitante) &&
    p.golsMandante >= 0 &&
    p.golsVisitante >= 0,
  )
  if (base.length < 10) return null
  const emCasa = new Map<number, Soma>()
  const fora = new Map<number, Soma>()
  let pesoTotal = 0
  let golsCasa = 0
  let golsFora = 0
  for (const p of base) {
    const peso = 0.5 ** ((quando - p.data) / DIA_MS / MEIA_VIDA_DIAS)
    pesoTotal += peso
    golsCasa += peso * p.golsMandante
    golsFora += peso * p.golsVisitante
    somar(emCasa, p.mandante, peso, p.golsMandante, p.golsVisitante)
    somar(fora, p.visitante, peso, p.golsVisitante, p.golsMandante)
  }
  if (pesoTotal <= 0) return null
  const mediaCasa = Math.max(golsCasa / pesoTotal, 0.1)
  const mediaFora = Math.max(golsFora / pesoTotal, 0.1)
  const taxa = (mapa: Map<number, Soma>, id: number, media: number, campo: 'feitos' | 'sofridos') => {
    const s = mapa.get(id)
    return ((s?.[campo] ?? 0) + PESO_MEDIA * media) / ((s?.peso ?? 0) + PESO_MEDIA) / media
  }
  let lambdaCasa = mediaCasa * taxa(emCasa, mandante, mediaCasa, 'feitos') * taxa(fora, visitante, mediaCasa, 'sofridos')
  let lambdaFora = mediaFora * taxa(fora, visitante, mediaFora, 'feitos') * taxa(emCasa, mandante, mediaFora, 'sofridos')
  const ratings = calcularElo(base, quando)
  const eloMandante = ratings.get(mandante) ?? ELO_INICIAL
  const eloVisitante = ratings.get(visitante) ?? ELO_INICIAL
  // A diferença Elo altera moderadamente as taxas, sem dominar o histórico de gols.
  const diferencaElo = eloMandante + VANTAGEM_CASA_ELO - eloVisitante
  const fatorForca = Math.min(1.25, Math.max(0.8, 10 ** (diferencaElo / 400 * 0.18)))
  lambdaCasa *= fatorForca
  lambdaFora /= fatorForca
  if (!Number.isFinite(lambdaCasa) || !Number.isFinite(lambdaFora) || lambdaCasa <= 0 || lambdaFora <= 0) return null
  const pc = poisson(lambdaCasa)
  const pf = poisson(lambdaFora)
  let casa = 0
  let empate = 0
  let visit = 0
  for (let i = 0; i < pc.length; i++) {
    for (let j = 0; j < pf.length; j++) {
      const probabilidade = pc[i] * pf[j]
      if (i > j) casa += probabilidade
      else if (i === j) empate += probabilidade
      else visit += probabilidade
    }
  }
  const total = casa + empate + visit
  if (!Number.isFinite(total) || total <= 0) return null
  return {
    casa: casa / total,
    empate: empate / total,
    fora: visit / total,
    golsEsperadosCasa: lambdaCasa,
    golsEsperadosFora: lambdaFora,
    eloMandante,
    eloVisitante,
  }
}

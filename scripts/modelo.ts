// Modelo estatístico: gols de cada time seguem uma distribuição de Poisson.
// A força de ataque e defesa vem dos jogos anteriores da competição.
// Não usa odds nem dados de apostas.
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
}
const DIA_MS = 86_400_000
const MEIA_VIDA_DIAS = 120
const PESO_MEDIA = 3
const MAX_GOLS = 20
const CAUDA_POISSON = 0.999999
interface Soma { peso: number; feitos: number; sofridos: number }
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
/** Prevê usando exclusivamente partidas anteriores ao instante da partida. */
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
  const lambdaCasa = mediaCasa * taxa(emCasa, mandante, mediaCasa, 'feitos') * taxa(fora, visitante, mediaCasa, 'sofridos')
  const lambdaFora = mediaFora * taxa(fora, visitante, mediaFora, 'feitos') * taxa(emCasa, mandante, mediaFora, 'sofridos')
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
  }
}

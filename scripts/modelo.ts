// Modelo estatístico: gols de cada time seguem uma distribuição de Poisson.
// A força de ataque e de defesa vem dos jogos anteriores da própria competição,
// com peso maior para jogos recentes. Não usa odds nem dados de apostas.

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
// Peso de "jogos imaginários na média" que puxa times com poucos jogos para a média da liga.
const PESO_MEDIA = 3
const MAX_GOLS = 8

interface Soma {
  peso: number
  feitos: number
  sofridos: number
}

function somar(mapa: Map<number, Soma>, id: number, peso: number, feitos: number, sofridos: number) {
  const s = mapa.get(id) ?? { peso: 0, feitos: 0, sofridos: 0 }
  s.peso += peso
  s.feitos += peso * feitos
  s.sofridos += peso * sofridos
  mapa.set(id, s)
}

function poisson(lambda: number): number[] {
  const p = [Math.exp(-lambda)]
  for (let k = 1; k <= MAX_GOLS; k++) p.push((p[k - 1] * lambda) / k)
  return p
}

/** Prevê a partida usando só jogos anteriores a `quando`. Devolve null se há poucos dados. */
export function prever(historico: Partida[], mandante: number, visitante: number, quando: number): Previsao | null {
  const base = historico.filter((p) => p.data < quando)
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
  const mediaCasa = Math.max(golsCasa / pesoTotal, 0.1)
  const mediaFora = Math.max(golsFora / pesoTotal, 0.1)

  // Taxa do time em relação à média, suavizada para times com poucos jogos.
  const taxa = (mapa: Map<number, Soma>, id: number, media: number, campo: 'feitos' | 'sofridos') => {
    const s = mapa.get(id)
    return ((s?.[campo] ?? 0) + PESO_MEDIA * media) / ((s?.peso ?? 0) + PESO_MEDIA) / media
  }

  const lambdaCasa = mediaCasa * taxa(emCasa, mandante, mediaCasa, 'feitos') * taxa(fora, visitante, mediaCasa, 'sofridos')
  const lambdaFora = mediaFora * taxa(fora, visitante, mediaFora, 'feitos') * taxa(emCasa, mandante, mediaFora, 'sofridos')

  const pc = poisson(lambdaCasa)
  const pf = poisson(lambdaFora)
  let casa = 0
  let empate = 0
  let visit = 0
  for (let i = 0; i <= MAX_GOLS; i++) {
    for (let j = 0; j <= MAX_GOLS; j++) {
      const p = pc[i] * pf[j]
      if (i > j) casa += p
      else if (i === j) empate += p
      else visit += p
    }
  }
  const total = casa + empate + visit
  return {
    casa: casa / total,
    empate: empate / total,
    fora: visit / total,
    golsEsperadosCasa: lambdaCasa,
    golsEsperadosFora: lambdaFora,
  }
}

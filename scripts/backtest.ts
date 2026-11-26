// Backtesting cronológico: cada previsão usa exclusivamente jogos anteriores à partida testada.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { prever, type Partida } from './modelo.ts'

interface JogoHistorico extends Partida {
  id: number
  codigo: string
  competicao: string
  mandanteNome: string
  visitanteNome: string
}
interface ArquivoHistorico { atualizadoEm: string; jogos: JogoHistorico[] }
type Resultado = 'casa' | 'empate' | 'fora'
interface Avaliacao {
  id: number
  data: string
  competicao: string
  mandante: string
  visitante: string
  placar: string
  resultadoReal: Resultado
  previsao: { casa: number; empate: number; fora: number }
  resultadoPrevisto: Resultado
  acertou: boolean
  confianca: number
  brier: number
  logLoss: number
  baseline: Resultado
  baselineAcertou: boolean
}
interface Metricas {
  partidasTestadas: number
  acuracia: number
  acuraciaBaseline: number
  brierScore: number
  logLoss: number
  acertos: number
  acertosBaseline: number
}
const entrada = process.argv[2] ?? 'public/dados/historico.json'
const saida = process.argv[3] ?? 'public/dados/backtest.json'
const arquivo = JSON.parse(await readFile(entrada, 'utf8')) as ArquivoHistorico
if (!Array.isArray(arquivo.jogos)) throw new Error('Arquivo de histórico inválido: campo jogos ausente.')
const jogos = arquivo.jogos
  .filter((p) => Number.isFinite(p.data) && Number.isFinite(p.golsMandante) &&
    Number.isFinite(p.golsVisitante) && p.golsMandante >= 0 && p.golsVisitante >= 0)
  .sort((a, b) => a.data - b.data)
const historico: Partida[] = []
const avaliacoes: Avaliacao[] = []
const contarResultados = () => {
  const contagem = { casa: 0, empate: 0, fora: 0 }
  for (const p of historico) {
    if (p.golsMandante > p.golsVisitante) contagem.casa++
    else if (p.golsMandante === p.golsVisitante) contagem.empate++
    else contagem.fora++
  }
  return contagem
}
for (const jogo of jogos) {
  // prever() também aplica o corte estrito p.data < data do jogo, protegendo contra vazamento temporal.
  const previsao = prever(historico, jogo.mandante, jogo.visitante, jogo.data)
  if (previsao) {
    const probabilidades = { casa: previsao.casa, empate: previsao.empate, fora: previsao.fora }
    const ordenados = (Object.entries(probabilidades) as [Resultado, number][]).sort((a, b) => b[1] - a[1])
    const resultadoPrevisto = ordenados[0][0]
    const resultadoReal: Resultado = jogo.golsMandante > jogo.golsVisitante ? 'casa'
      : jogo.golsMandante === jogo.golsVisitante ? 'empate' : 'fora'
    const confianca = ordenados[0][1]
    const alvo = { casa: resultadoReal === 'casa' ? 1 : 0, empate: resultadoReal === 'empate' ? 1 : 0, fora: resultadoReal === 'fora' ? 1 : 0 }
    const brier = ((probabilidades.casa - alvo.casa) ** 2 +
      (probabilidades.empate - alvo.empate) ** 2 +
      (probabilidades.fora - alvo.fora) ** 2) / 3
    const probReal = Math.max(1e-15, probabilidades[resultadoReal])
    const contagem = contarResultados()
    const baseline = (Object.entries(contagem) as [Resultado, number][]).sort((a, b) => b[1] - a[1])[0][0]
    avaliacoes.push({
      id: jogo.id,
      data: new Date(jogo.data).toISOString(),
      competicao: jogo.competicao,
      mandante: jogo.mandanteNome,
      visitante: jogo.visitanteNome,
      placar: `${jogo.golsMandante} × ${jogo.golsVisitante}`,
      resultadoReal,
      previsao: probabilidades,
      resultadoPrevisto,
      acertou: resultadoPrevisto === resultadoReal,
      confianca,
      brier,
      logLoss: -Math.log(probReal),
      baseline,
      baselineAcertou: baseline === resultadoReal,
    })
  }
  // O resultado só entra no histórico depois que a previsão daquele jogo foi calculada.
  historico.push({
    data: jogo.data,
    mandante: jogo.mandante,
    visitante: jogo.visitante,
    golsMandante: jogo.golsMandante,
    golsVisitante: jogo.golsVisitante,
  })
}
function resumir(lista: Avaliacao[]): Metricas {
  const n = lista.length
  const acertos = lista.filter((p) => p.acertou).length
  const acertosBaseline = lista.filter((p) => p.baselineAcertou).length
  return {
    partidasTestadas: n,
    acuracia: n ? acertos / n : 0,
    acuraciaBaseline: n ? acertosBaseline / n : 0,
    brierScore: n ? lista.reduce((s, p) => s + p.brier, 0) / n : 0,
    logLoss: n ? lista.reduce((s, p) => s + p.logLoss, 0) / n : 0,
    acertos,
    acertosBaseline,
  }
}
const porCompeticao = Object.fromEntries(
  [...new Set(avaliacoes.map((p) => p.competicao))].sort().map((nome) =>
    [nome, resumir(avaliacoes.filter((p) => p.competicao === nome))]),
)
const confianca = [
  { faixa: '50–60%', minimo: 0.5, maximo: 0.6 },
  { faixa: '60–70%', minimo: 0.6, maximo: 0.7 },
  { faixa: '70–80%', minimo: 0.7, maximo: 0.8 },
  { faixa: '80–90%', minimo: 0.8, maximo: 0.9 },
  { faixa: '90–100%', minimo: 0.9, maximo: 1.001 },
].map((faixa) => {
  const grupo = avaliacoes.filter((p) => p.confianca >= faixa.minimo && p.confianca < faixa.maximo)
  return {
    faixa: faixa.faixa,
    partidas: grupo.length,
    confiancaMedia: grupo.length ? grupo.reduce((s, p) => s + p.confianca, 0) / grupo.length : 0,
    acuracia: grupo.length ? grupo.filter((p) => p.acertou).length / grupo.length : 0,
  }
})
const relatorio = {
  geradoEm: new Date().toISOString(),
  fonte: entrada,
  partidasNoHistorico: jogos.length,
  partidasTestadas: avaliacoes.length,
  criterio: 'walk-forward cronológico; cada previsão usa somente partidas com data anterior à partida avaliada',
  metricas: resumir(avaliacoes),
  porCompeticao,
  calibracaoPorConfianca: confianca,
  observacao: 'Acurácia mede o resultado mais provável; Brier Score e Log Loss avaliam a qualidade das probabilidades. A baseline escolhe o resultado mais frequente entre os jogos anteriores disponíveis. Amostras pequenas não devem ser interpretadas como garantia de desempenho futuro.',
  partidas: avaliacoes,
}
await mkdir(dirname(saida), { recursive: true })
await writeFile(saida, JSON.stringify(relatorio, null, 2))
console.log(`Backtesting concluído: ${avaliacoes.length} partidas avaliadas de ${jogos.length} resultados históricos.`)
console.log(`Acurácia: ${(relatorio.metricas.acuracia * 100).toFixed(1)}% | baseline: ${(relatorio.metricas.acuraciaBaseline * 100).toFixed(1)}% | Brier: ${relatorio.metricas.brierScore.toFixed(4)} | Log Loss: ${relatorio.metricas.logLoss.toFixed(4)}`)
console.log(`Relatório salvo em ${saida}`)

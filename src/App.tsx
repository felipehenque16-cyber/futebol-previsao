import { useEffect, useMemo, useState } from 'react'
import type { Dados, Jogo } from './types'

const fmtJogo = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const fmtAtualizacao = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const MARGEM_FAVORITO = 0.06
type Lado = 'casa' | 'empate' | 'fora'
interface MetricasBacktest {
  partidasTestadas: number
  acuracia: number
  acuraciaBaseline: number
  brierScore: number
  logLoss: number
  acertos: number
  acertosBaseline: number
}
interface RelatorioBacktest {
  geradoEm: string
  partidasNoHistorico: number
  metricas: MetricasBacktest
  porCompeticao: Record<string, MetricasBacktest>
  observacao: string
}

function percentuais(jogo: Jogo) {
  const previsao = jogo.previsao!
  const casa = Math.round(previsao.casa * 100)
  const fora = Math.round(previsao.fora * 100)
  return { casa, fora, empate: Math.max(0, 100 - casa - fora) }
}
function maisProvavel(jogo: Jogo): { lado: Lado; claro: boolean } {
  const previsao = jogo.previsao!
  const ordem = (['casa', 'empate', 'fora'] as Lado[]).sort((a, b) => previsao[b] - previsao[a])
  return { lado: ordem[0], claro: previsao[ordem[0]] - previsao[ordem[1]] >= MARGEM_FAVORITO }
}
function resultadoReal(jogo: Jogo): Lado | null {
  if (jogo.situacao !== 'encerrado' || !jogo.placar) return null
  return jogo.placar.casa > jogo.placar.fora ? 'casa' : jogo.placar.casa < jogo.placar.fora ? 'fora' : 'empate'
}
function Selo({ time }: { time: Jogo['mandante'] }) {
  return (
    <span className="time">
      {time.escudo ? <img src={time.escudo} alt="" width={24} height={24} loading="lazy" /> : <span className="escudo-vazio" />}
      <span className="nome">{time.nome}</span>
    </span>
  )
}
function Cartao({ jogo }: { jogo: Jogo }) {
  const quando = fmtJogo.format(new Date(jogo.data))
  const real = resultadoReal(jogo)
  const pr = jogo.previsao ? percentuais(jogo) : null
  const mp = jogo.previsao ? maisProvavel(jogo) : null
  let veredito = 'Histórico insuficiente para estimar'
  if (mp) {
    if (!mp.claro) veredito = 'Confronto equilibrado'
    else if (mp.lado === 'empate') veredito = 'Empate é o resultado mais provável'
    else veredito = `Favorito: ${mp.lado === 'casa' ? jogo.mandante.nome : jogo.visitante.nome}`
  }
  return (
    <li className="cartao">
      <div className="cabeca">
        <span className={jogo.situacao === 'aoVivo' ? 'ao-vivo' : ''}>
          {jogo.situacao === 'aoVivo' ? '● Ao vivo' : quando}
        </span>
        {real && mp && <span className={mp.lado === real ? 'acerto' : 'erro'}>{mp.lado === real ? 'Previsão acertou' : 'Previsão não acertou'}</span>}
      </div>
      <div className="times">
        <Selo time={jogo.mandante} />
        <span className="placar">{jogo.placar ? `${jogo.placar.casa} × ${jogo.placar.fora}` : '×'}</span>
        <Selo time={jogo.visitante} />
      </div>
      {pr && (
        <>
          <div className="barra" role="img" aria-label={`Casa ${pr.casa}%, empate ${pr.empate}%, visitante ${pr.fora}%`}>
            <span className="b-casa" style={{ flexGrow: pr.casa }} />
            <span className="b-empate" style={{ flexGrow: pr.empate }} />
            <span className="b-fora" style={{ flexGrow: pr.fora }} />
          </div>
          <div className="numeros">
            <span>Casa {pr.casa}%</span><span>Empate {pr.empate}%</span><span>Fora {pr.fora}%</span>
          </div>
          <div className="gols-esperados">
            <span>Gols esperados</span>
            <strong>{jogo.previsao!.golsEsperadosCasa.toFixed(2)} × {jogo.previsao!.golsEsperadosFora.toFixed(2)}</strong>
          </div>
          <div className="elo-times">
            <span>Força Elo</span>
            <strong>{Math.round(jogo.previsao!.eloMandante)} × {Math.round(jogo.previsao!.eloVisitante)}</strong>
          </div>
        </>
      )}
      <p className="veredito">{veredito}</p>
    </li>
  )
}
export default function App() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<'proximos' | 'resultados'>('proximos')
  const [campeonato, setCampeonato] = useState('todos')
  const [backtest, setBacktest] = useState<RelatorioBacktest | null>(null)

  useEffect(() => {
    fetch('./dados/backtest.json')
      .then((resposta) => resposta.ok ? resposta.json() as Promise<RelatorioBacktest> : null)
      .then((relatorio) => { if (relatorio?.metricas) setBacktest(relatorio) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('./dados/jogos.json')
      .then((resposta) => (resposta.ok ? resposta.json() as Promise<Dados> : Promise.reject(new Error('Falha ao carregar dados'))))
      .then((conteudo) => { setDados(conteudo); setErro(false) })
      .catch(() => setErro(true))
      .finally(() => setCarregando(false))
  }, [])

  const campeonatos = useMemo(() => {
    const mapa = new Map<string, string>()
    dados?.jogos.forEach((jogo) => mapa.set(jogo.codigo, jogo.competicao))
    return [...mapa]
  }, [dados])
  const jogosFiltrados = useMemo(() => (dados?.jogos ?? [])
    .filter((jogo) => (aba === 'proximos' ? jogo.situacao !== 'encerrado' : jogo.situacao === 'encerrado'))
    .filter((jogo) => campeonato === 'todos' || jogo.codigo === campeonato), [dados, aba, campeonato])
  const grupos = useMemo(() => {
    const lista = [...jogosFiltrados].sort((a, b) =>
      aba === 'proximos' ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data))
    const porCamp = new Map<string, Jogo[]>()
    lista.forEach((jogo) => porCamp.set(jogo.competicao, [...(porCamp.get(jogo.competicao) ?? []), jogo]))
    return [...porCamp]
  }, [jogosFiltrados, aba])
  const comPrevisao = jogosFiltrados.filter((jogo) => jogo.previsao).length

  return (
    <>
      <header className="topo">
        <div className="marca"><span className="marca-bola">⚽</span><span>INTELIGÊNCIA DE JOGO</span></div>
        <h1>Quem leva<span>?</span></h1>
        <p>Probabilidades calculadas com estatística. Futebol é imprevisível — nenhuma previsão é garantia.</p>
        <div className="topo-selo">ANÁLISE ESTATÍSTICA · SEM APOSTAS</div>
      </header>
      <main>
        <section className="resumo" aria-label="Resumo dos dados">
          <div><strong>{jogosFiltrados.length}</strong><span>partidas na lista</span></div>
          <div><strong>{comPrevisao}</strong><span>com previsão</span></div>
          <div><strong>{jogosFiltrados.length - comPrevisao}</strong><span>sem dados suficientes</span></div>
        </section>
        <div className="controles">
          <div className="abas" role="tablist" aria-label="Tipo de partida">
            <button role="tab" aria-selected={aba === 'proximos'} onClick={() => setAba('proximos')}>Próximos</button>
            <button role="tab" aria-selected={aba === 'resultados'} onClick={() => setAba('resultados')}>Resultados</button>
          </div>
          <select value={campeonato} onChange={(e) => setCampeonato(e.target.value)} aria-label="Filtrar campeonato">
            <option value="todos">Todos os campeonatos</option>
            {campeonatos.map(([codigo, nome]) => <option key={codigo} value={codigo}>{nome}</option>)}
          </select>
        </div>
        {backtest && (
          <section className="desempenho" aria-label="Desempenho histórico do modelo">
            <div className="desempenho-titulo">
              <div><span className="sobrelinha">VALIDAÇÃO DO MODELO</span><h2>Como estamos indo?</h2></div>
              <span className="amostra">{backtest.metricas.partidasTestadas} jogos avaliados</span>
            </div>
            <div className="metricas-grid">
              <div><strong>{(backtest.metricas.acuracia * 100).toFixed(1)}%</strong><span>acerto do modelo</span></div>
              <div><strong>{(backtest.metricas.acuraciaBaseline * 100).toFixed(1)}%</strong><span>referência simples</span></div>
              <div><strong>{backtest.metricas.brierScore.toFixed(3)}</strong><span>Brier Score · menor é melhor</span></div>
              <div><strong>{backtest.metricas.logLoss.toFixed(3)}</strong><span>Log Loss · menor é melhor</span></div>
            </div>
            <h3>Precisão por campeonato</h3>
            <div className="desempenho-lista">
              {Object.entries(backtest.porCompeticao).sort((a, b) => b[1].partidasTestadas - a[1].partidasTestadas).map(([nome, m]) => (
                <div className="desempenho-linha" key={nome}>
                  <span>{nome}<small>{m.partidasTestadas} jogos</small></span>
                  <div className="desempenho-trilho"><i style={{ width: `${Math.round(m.acuracia * 100)}%` }} /></div>
                  <strong>{(m.acuracia * 100).toFixed(0)}%</strong>
                </div>
              ))}
            </div>
            <p className="nota-desempenho">{backtest.observacao}</p>
          </section>
        )}
        {carregando && <p className="aviso">Carregando partidas e previsões…</p>}
        {erro && <p className="aviso">Não foi possível carregar os dados. Tente novamente mais tarde ou gere o arquivo public/dados/jogos.json.</p>}
        {!carregando && !erro && grupos.length === 0 && <p className="aviso">Nenhuma partida encontrada para este filtro.</p>}
        {grupos.map(([titulo, jogos]) => (
          <section key={titulo}>
            <h2>{titulo}<span className="contagem">{jogos.length}</span></h2>
            <ul className="lista">{jogos.map((jogo) => <Cartao key={jogo.id} jogo={jogo} />)}</ul>
          </section>
        ))}
      </main>
      <footer>
        {dados && <p>Dados atualizados em {fmtAtualizacao.format(new Date(dados.atualizadoEm))}.</p>}
        <p>Modelo híbrido Elo + Poisson: Elo estima a força relativa dos clubes e Poisson converte o desempenho em probabilidades de gols. Gols esperados são estimativas do modelo, não xG oficial.</p>
      </footer>
    </>
  )
}

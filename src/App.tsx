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
      {time.escudo ? <img src={time.escudo} alt="" width={30} height={30} loading="lazy" /> : <span className="escudo-vazio" />}
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
    <li className="match-card">
      <div className="match-meta">
        <span className={jogo.situacao === 'aoVivo' ? 'live-label' : 'match-date'}>
          {jogo.situacao === 'aoVivo' ? <><i /> AO VIVO</> : quando}
        </span>
        {real && mp && <span className={mp.lado === real ? 'result-hit' : 'result-miss'}>{mp.lado === real ? '✓ Previsão acertou' : 'Previsão não acertou'}</span>}
      </div>
      <div className="match-teams">
        <Selo time={jogo.mandante} />
        <span className="match-score">{jogo.placar ? `${jogo.placar.casa} : ${jogo.placar.fora}` : 'VS'}</span>
        <Selo time={jogo.visitante} />
      </div>
      {pr ? (
        <div className="prediction">
          <div className="prediction-bar" role="img" aria-label={`Casa ${pr.casa}%, empate ${pr.empate}%, visitante ${pr.fora}%`}>
            <span className="bar-home" style={{ flexGrow: pr.casa }} />
            <span className="bar-draw" style={{ flexGrow: pr.empate }} />
            <span className="bar-away" style={{ flexGrow: pr.fora }} />
          </div>
          <div className="prediction-values">
            <span><i className="dot-home" /> Casa <b>{pr.casa}%</b></span>
            <span><i className="dot-draw" /> Empate <b>{pr.empate}%</b></span>
            <span><i className="dot-away" /> Fora <b>{pr.fora}%</b></span>
          </div>
          <div className="match-details">
            <div><span>Gols esperados</span><strong>{jogo.previsao!.golsEsperadosCasa.toFixed(2)} <small>:</small> {jogo.previsao!.golsEsperadosFora.toFixed(2)}</strong></div>
            <div><span>Rating Elo</span><strong>{Math.round(jogo.previsao!.eloMandante)} <small>:</small> {Math.round(jogo.previsao!.eloVisitante)}</strong></div>
          </div>
        </div>
      ) : <div className="no-prediction">Dados insuficientes para calcular uma previsão confiável.</div>}
      <p className="match-verdict">{veredito}</p>
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
  const partidasAoVivo = jogosFiltrados.filter((jogo) => jogo.situacao === 'aoVivo').length

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Quem leva? Início">
          <span className="brand-mark">QL<span>·</span></span>
          <span className="brand-copy"><strong>QUEM LEVA?</strong><small>FOOTBALL INTELLIGENCE</small></span>
        </a>
        <nav className="top-nav" aria-label="Navegação principal">
          <a className="active" href="#partidas">Partidas</a>
          <a href="#desempenho">Desempenho</a>
          <a href="#sobre">O projeto</a>
        </nav>
        <div className="top-status"><span /> ANÁLISE ATIVA</div>
      </header>

      <main className="dashboard" id="inicio">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><i /> CENTRAL DE INTELIGÊNCIA ESPORTIVA</span>
            <h1>O jogo vai além<br />do <em>palpite.</em></h1>
            <p>Dados, contexto e modelos estatísticos para entender as probabilidades por trás de cada partida.</p>
            <a className="hero-link" href="#partidas">Explorar partidas <span>↗</span></a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="hero-ball">⚽</div>
            <div className="hero-chip chip-top"><span>MODEL</span><strong>EL0 + POISSON</strong></div>
            <div className="hero-chip chip-bottom"><span>DATA DRIVEN</span><strong>NO BETTING. JUST DATA.</strong></div>
          </div>
          <div className="hero-foot"><span>01 / 03</span><span>ESTATÍSTICA APLICADA AO FUTEBOL</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>

        <section className="overview" aria-label="Resumo das partidas">
          <div className="section-kicker"><span>VISÃO GERAL</span><span>SEUS DADOS EM TEMPO REAL</span></div>
          <div className="overview-grid">
            <article className="overview-card featured"><span className="overview-icon">◈</span><span className="overview-label">PARTIDAS NA LISTA</span><strong>{jogosFiltrados.length.toString().padStart(2, '0')}</strong><small>Jogos no filtro atual</small></article>
            <article className="overview-card"><span className="overview-icon">⌁</span><span className="overview-label">COM PREVISÃO</span><strong>{comPrevisao.toString().padStart(2, '0')}</strong><small>Estimativas disponíveis</small></article>
            <article className="overview-card"><span className="overview-icon">◷</span><span className="overview-label">SEM HISTÓRICO</span><strong>{(jogosFiltrados.length - comPrevisao).toString().padStart(2, '0')}</strong><small>Dados ainda insuficientes</small></article>
            <article className="overview-card live-overview"><span className="overview-icon">●</span><span className="overview-label">AO VIVO</span><strong>{partidasAoVivo.toString().padStart(2, '0')}</strong><small>Partidas em andamento</small></article>
          </div>
        </section>

        {backtest && (
          <section className="performance-panel" id="desempenho" aria-label="Desempenho histórico do modelo">
            <div className="panel-heading">
              <div><span className="section-kicker-text">MODEL PERFORMANCE / 02</span><h2>O modelo em campo<span>.</span></h2><p>Resultados de validação histórica, jogo a jogo.</p></div>
              <div className="sample-tag"><span /> {backtest.metricas.partidasTestadas} JOGOS AVALIADOS</div>
            </div>
            <div className="performance-metrics">
              <div className="performance-metric main-metric"><span>ACURÁCIA DO MODELO</span><strong>{(backtest.metricas.acuracia * 100).toFixed(1)}<small>%</small></strong><small>Taxa de resultados corretos</small></div>
              <div className="performance-metric"><span>BASELINE</span><strong>{(backtest.metricas.acuraciaBaseline * 100).toFixed(1)}<small>%</small></strong><small>Referência estatística simples</small></div>
              <div className="performance-metric"><span>BRIER SCORE</span><strong>{backtest.metricas.brierScore.toFixed(3)}</strong><small>Menor é melhor</small></div>
              <div className="performance-metric"><span>LOG LOSS</span><strong>{backtest.metricas.logLoss.toFixed(3)}</strong><small>Menor é melhor</small></div>
            </div>
            <div className="competition-performance">
              <div className="subheading"><h3>Precisão por competição</h3><span>ACURÁCIA · AMOSTRA</span></div>
              <div className="performance-list">
                {Object.entries(backtest.porCompeticao).sort((a, b) => b[1].partidasTestadas - a[1].partidasTestadas).map(([nome, m]) => (
                  <div className="performance-row" key={nome}>
                    <span className="competition-name">{nome}<small>{m.partidasTestadas} partidas</small></span>
                    <div className="performance-track"><i style={{ width: `${Math.round(m.acuracia * 100)}%` }} /></div>
                    <strong>{(m.acuracia * 100).toFixed(0)}%</strong>
                  </div>
                ))}
              </div>
            </div>
            <p className="performance-note">{backtest.observacao}</p>
          </section>
        )}

        <section className="matches-section" id="partidas">
          <div className="matches-heading">
            <div><span className="section-kicker-text">FIXTURES & RESULTS / 01</span><h2>Central de partidas<span>.</span></h2><p>Acompanhe confrontos e probabilidades calculadas pelo modelo.</p></div>
            <div className="match-count"><strong>{jogosFiltrados.length}</strong><span>PARTIDAS</span></div>
          </div>
          <div className="filters">
            <div className="tabs" role="tablist" aria-label="Tipo de partida">
              <button role="tab" aria-selected={aba === 'proximos'} onClick={() => setAba('proximos')}>Próximos jogos</button>
              <button role="tab" aria-selected={aba === 'resultados'} onClick={() => setAba('resultados')}>Resultados</button>
            </div>
            <label className="select-wrap"><span>COMPETIÇÃO</span><select value={campeonato} onChange={(e) => setCampeonato(e.target.value)} aria-label="Filtrar campeonato">
              <option value="todos">Todos os campeonatos</option>
              {campeonatos.map(([codigo, nome]) => <option key={codigo} value={codigo}>{nome}</option>)}
            </select></label>
          </div>
          {carregando && <p className="notice">Carregando partidas e previsões…</p>}
          {erro && <p className="notice error-notice">Não foi possível carregar os dados. Tente novamente mais tarde ou gere o arquivo public/dados/jogos.json.</p>}
          {!carregando && !erro && grupos.length === 0 && <p className="notice">Nenhuma partida encontrada para este filtro.</p>}
          {grupos.map(([titulo, jogos]) => (
            <section className="competition-section" key={titulo}>
              <div className="competition-heading"><h3>{titulo}</h3><span>{jogos.length.toString().padStart(2, '0')} JOGOS</span></div>
              <ul className="match-list">{jogos.map((jogo) => <Cartao key={jogo.id} jogo={jogo} />)}</ul>
            </section>
          ))}
        </section>
      </main>
      <footer className="site-footer" id="sobre">
        <div className="footer-brand"><span className="brand-mark">QL<span>·</span></span><div><strong>QUEM LEVA?</strong><small>FOOTBALL INTELLIGENCE</small></div></div>
        <p>Modelo híbrido Elo + Poisson: Elo estima a força relativa dos clubes e Poisson converte o desempenho em probabilidades de gols. Gols esperados são estimativas do modelo, não xG oficial.</p>
        <div className="footer-bottom"><span>ANÁLISE ESTATÍSTICA · SEM APOSTAS</span>{dados && <span>DADOS ATUALIZADOS EM {fmtAtualizacao.format(new Date(dados.atualizadoEm))}</span>}<span>FEITO PARA ENTENDER O JOGO.</span></div>
      </footer>
    </div>
  )
}

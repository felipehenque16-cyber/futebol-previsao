import { useEffect, useMemo, useState } from 'react'
import type { Dados, Jogo } from './types'

const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const nomes: Record<string, string> = { BSA: 'Brasileirão Série A', CLI: 'Libertadores', CL: 'Champions League', PL: 'Premier League', PD: 'La Liga', SA: 'Serie A (Itália)', BL1: 'Bundesliga', FL1: 'Ligue 1', PPL: 'Primeira Liga', DED: 'Eredivisie', ELC: 'Championship' }
const logos: Record<string, string> = {
  BSA: 'https://assets.football-logos.cc/logos/brazil/256x256/brazilian-serie-a.f6ec92f8.png',
  CLI: 'https://assets.football-logos.cc/logos/tournaments/512x512/conmebol-libertadores.38816506.png',
  CL: 'https://assets.football-logos.cc/logos/tournaments/512x512/uefa-champions-league.effc906c.png',
  PL: 'https://assets.football-logos.cc/logos/england/512x512/english-premier-league.b597f797.png',
  PD: 'https://crests.football-data.org/PD.svg',
  SA: 'https://assets.football-logos.cc/logos/italy/512x512/serie-a.1289b16a.png',
  BL1: 'https://assets.football-logos.cc/logos/germany/512x512/bundesliga.24d9c6f9.png',
  FL1: 'https://assets.football-logos.cc/logos/france/512x512/ligue-1.bcb13eb0.png',
  PPL: 'https://crests.football-data.org/PPL.svg',
  DED: 'https://assets.football-logos.cc/logos/netherlands/512x512/eredivisie.a718427b.png',
  ELC: 'https://assets.football-logos.cc/logos/england/1500x1500/efl-championship.c50fa46f.png',
}
const nomeCamp = (j: Jogo) => nomes[j.codigo] ?? j.competicao
const escudoCamp = (codigo: string) => logos[codigo]
const prob = (j: Jogo) => {
  if (!j.previsao) return null
  const casa = Math.round(j.previsao.casa * 100)
  const fora = Math.round(j.previsao.fora * 100)
  return { casa, fora, empate: Math.max(0, 100 - casa - fora) }
}
const maiorProb = (j: Jogo) => j.previsao ? Math.max(j.previsao.casa, j.previsao.empate, j.previsao.fora) : 0
const semSerieB = (j: Jogo) => j.codigo !== 'BSB' && !/série\s*b/i.test(j.competicao)

function Escudo({ nome, url, grande = false }: { nome: string; url: string | null; grande?: boolean }) {
  return url
    ? <img className={grande ? 'team-crest large' : 'team-crest'} src={url} alt={nome} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
    : <span className={grande ? 'team-crest-fallback large' : 'team-crest-fallback'}>{nome.slice(0, 1).toUpperCase()}</span>
}
function Marca() {
  return <img className="brand-logo" src="./logo-quem-leva.svg" alt="Soccer Championship" />
}
function Probabilidades({ jogo }: { jogo: Jogo }) {
  const p = prob(jogo)
  if (!p) return <span className="no-data">Sem previsão</span>
  return <div className="prob-pills"><b>{p.casa}%</b><span>{p.empate}%</span><span>{p.fora}%</span></div>
}
function LinhaJogo({ jogo }: { jogo: Jogo }) {
  return <article className="game-row">
    <div className="game-league"><span className="league-mini">{nomeCamp(jogo)}</span><small>{jogo.situacao === 'aoVivo' ? <i className="live-dot" /> : null}{jogo.situacao === 'aoVivo' ? 'AO VIVO' : dataHora.format(new Date(jogo.data))}</small></div>
    <div className="game-team home"><strong>{jogo.mandante.nome}</strong><Escudo nome={jogo.mandante.nome} url={jogo.mandante.escudo} /></div>
    <time className={jogo.situacao === 'aoVivo' ? 'game-time live' : 'game-time'}>{jogo.placar ? `${jogo.placar.casa} : ${jogo.placar.fora}` : hora.format(new Date(jogo.data))}</time>
    <div className="game-team away"><Escudo nome={jogo.visitante.nome} url={jogo.visitante.escudo} /><strong>{jogo.visitante.nome}</strong></div>
    <Probabilidades jogo={jogo} />
  </article>
}
export default function App() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<'proximos' | 'resultados'>('proximos')
  const [campeonato, setCampeonato] = useState('todos')
  const [busca, setBusca] = useState('')
  const [secao, setSecao] = useState('Jogos')
  const [mostrarTodos, setMostrarTodos] = useState(false)
  useEffect(() => {
    let ativo = true
    const carregar = async (inicial = false) => {
      try {
        const resposta = await fetch(`./dados/jogos.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!resposta.ok) throw new Error('Falha ao carregar')
        const novosDados = await resposta.json() as Dados
        if (ativo) {
          setDados(novosDados)
          setErro(false)
        }
      } catch {
        if (ativo && inicial) setErro(true)
      } finally {
        if (ativo && inicial) setCarregando(false)
      }
    }
    void carregar(true)
    const intervalo = window.setInterval(() => { void carregar() }, 60_000)
    return () => {
      ativo = false
      window.clearInterval(intervalo)
    }
  }, [])

  const base = useMemo(() => (dados?.jogos ?? []).filter(semSerieB), [dados])
  const jogosFiltrados = useMemo(() => base
    .filter(j => aba === 'proximos' ? j.situacao !== 'encerrado' : j.situacao === 'encerrado')
    .filter(j => campeonato === 'todos' || j.codigo === campeonato)
    .filter(j => !busca || `${j.mandante.nome} ${j.visitante.nome} ${nomeCamp(j)}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')))
    .sort((a,b) => aba === 'proximos' ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data)), [base, aba, campeonato, busca])
  const destaque = base.filter(j => j.situacao !== 'encerrado').sort((a,b) => a.data.localeCompare(b.data)).find(j => j.previsao) ?? jogosFiltrados.find(j => j.previsao) ?? null
  const competicoes = useMemo(() => {
    const map = new Map<string, string>()
    base.forEach(j => map.set(j.codigo, nomeCamp(j)))
    return [...map]
  }, [base])
  const aoVivo = base.filter(j => j.situacao === 'aoVivo').length
  const comPrevisao = base.filter(j => j.previsao).length
  const confianca = base.filter(j => j.previsao).length
    ? Math.round(base.filter(j => j.previsao).reduce((s,j) => s + maiorProb(j), 0) / base.filter(j => j.previsao).length * 100)
    : 0
  const favoritos = [...base].filter(j => j.previsao).sort((a,b) => maiorProb(b)-maiorProb(a)).slice(0,3)

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="side-brand" href="#inicio" aria-label="Soccer Championship - início"><Marca /></a>
      <nav className="side-nav" aria-label="Navegação principal">
        <a className={secao === 'Jogos' ? 'selected' : ''} href="#jogos" onClick={() => setSecao('Jogos')}><span>⌂</span>Jogos</a>
        <a className={secao === 'Competições' ? 'selected' : ''} href="#competicoes" onClick={() => setSecao('Competições')}><span>🏆</span>Competições</a>
        <a className={secao === 'Estatísticas' ? 'selected' : ''} href="#estatisticas" onClick={() => setSecao('Estatísticas')}><span>▥</span>Estatísticas</a>
        <a className={secao === 'Sobre' ? 'selected' : ''} href="#sobre" onClick={() => setSecao('Sobre')}><span>●</span>Sobre</a>
      </nav>
      <div className="sidebar-promo"><div className="promo-chart">↗</div><strong>Análises precisas,<br/>decisões mais<br/>inteligentes.</strong><a href="#sobre">Quem Leva?</a></div>
      <span className="side-foot">FOOTBALL INTELLIGENCE</span>
    </aside>

    <main className="main-area" id="inicio">
      <div className="topline">
        <label className="search-box"><span>⌕</span><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar times, campeonatos..." aria-label="Buscar times e campeonatos" /></label>
        <span className="top-date">ANÁLISE ESTATÍSTICA · SEM APOSTAS</span>
      </div>

      <section className="featured-match" aria-label="Partida em destaque">
        {destaque ? <>
          <div className="featured-league"><span className="flag">⚽</span>{nomeCamp(destaque)} <span>›</span></div>
          <div className="featured-contest">
            <div className="featured-team"><Escudo nome={destaque.mandante.nome} url={destaque.mandante.escudo} grande/><strong>{destaque.mandante.nome}</strong></div>
            <div className="featured-clock"><strong>{destaque.placar ? `${destaque.placar.casa} : ${destaque.placar.fora}` : hora.format(new Date(destaque.data))}</strong><span>{destaque.situacao === 'aoVivo' ? 'AO VIVO' : dataHora.format(new Date(destaque.data))}</span></div>
            <div className="featured-team"><Escudo nome={destaque.visitante.nome} url={destaque.visitante.escudo} grande/><strong>{destaque.visitante.nome}</strong></div>
          </div>
          <div className="featured-prob"><h3>Probabilidades</h3><div><b>{prob(destaque)?.casa ?? '—'}%</b><span>{destaque.mandante.nome}</span></div><div><b>{prob(destaque)?.empate ?? '—'}%</b><span>Empate</span></div><div><b>{prob(destaque)?.fora ?? '—'}%</b><span>{destaque.visitante.nome}</span></div></div>
        </> : <div className="featured-empty"><strong>Futebol em análise</strong><span>Assim que houver partidas disponíveis, o próximo confronto aparecerá aqui.</span></div>}
      </section>

      <div className="content-grid">
        <div className="center-column">
          <div className="league-chips" aria-label="Filtros de competições">
            <button className={campeonato === 'todos' ? 'active' : ''} onClick={() => setCampeonato('todos')}>▦ <span>Todos</span></button>
            {competicoes.slice(0,4).map(([code,name]) => <button key={code} className={campeonato === code ? 'active' : ''} onClick={() => setCampeonato(code)}>{name}</button>)}
          </div>
          <section className="games-panel" id="jogos">
            <header className="panel-title"><h2>▦ <span>{aba === 'proximos' ? 'Jogos' : 'Resultados'} {aba === 'proximos' ? 'de Hoje' : 'Recentes'}</span></h2><div className="panel-tabs"><button className={aba === 'proximos' ? 'on' : ''} onClick={() => setAba('proximos')}>Próximos</button><button className={aba === 'resultados' ? 'on' : ''} onClick={() => setAba('resultados')}>Resultados</button></div></header>
            {carregando && <p className="notice">Carregando partidas e previsões…</p>}
            {erro && <p className="notice error">Não foi possível carregar os dados. Tente novamente mais tarde.</p>}
            {!carregando && !erro && jogosFiltrados.length === 0 && <p className="notice">Nenhuma partida encontrada para esse filtro.</p>}
            <div className="games-list">{jogosFiltrados.slice(0, mostrarTodos ? undefined : 12).map(j => <LinhaJogo key={j.id} jogo={j}/>)}</div>
            {jogosFiltrados.length > 12 && <button className="see-more" onClick={() => setMostrarTodos(v => !v)}>{mostrarTodos ? 'Mostrar menos' : `Ver todas as ${jogosFiltrados.length} partidas`}</button>}
          </section>
          <section className="featured-leagues" id="competicoes"><header className="panel-title"><h2>🏆 <span>Campeonatos em Destaque</span></h2><span className="muted-small">{competicoes.length} competições</span></header><div className="league-tiles">{competicoes.slice(0,4).map(([code,name]) => <button key={code} onClick={() => setCampeonato(code)}><img src={escudoCamp(code) ?? ''} alt="" onError={e => { e.currentTarget.style.visibility='hidden' }}/><span>{name}</span></button>)}</div></section>
        </div>
        <aside className="right-column">
          <section className="side-panel"><header className="side-panel-head"><h2>Competições</h2><a href="#competicoes">Ver todas →</a></header><div className="competition-links">{competicoes.slice(0,8).map(([code,name]) => <button key={code} onClick={() => setCampeonato(code)}><img src={escudoCamp(code) ?? ''} alt="" onError={e => { e.currentTarget.style.visibility='hidden' }}/><span>{name}</span><b>›</b></button>)}</div></section>
          <section className="side-panel model-panel" id="estatisticas"><h2>▥ &nbsp;Números do Modelo</h2><div className="model-number">{comPrevisao}<small> previsões calculadas</small></div><div className="model-stat"><strong>{confianca}%</strong><span>probabilidade média do resultado mais provável</span></div><div className="model-foot"><span className="green">{aoVivo} ao vivo</span><span>{base.length} partidas no conjunto</span></div></section>
          <section className="side-panel favorites-panel"><h2>⭐ Favoritos do modelo</h2>{favoritos.length ? favoritos.map(j => <div className="favorite-row" key={j.id}><span>{j.mandante.nome} x {j.visitante.nome}</span><b>{Math.round(maiorProb(j)*100)}%</b></div>) : <p className="muted-small">As previsões aparecerão quando houver dados suficientes.</p>}</section>
        </aside>
      </div>
      <footer className="site-footer" id="sobre"><Marca/><p>Probabilidades calculadas pelo modelo estatístico Elo + Poisson. Gols esperados são estimativas do modelo, não xG oficial. Este projeto é informativo e não é uma plataforma de apostas.</p>{dados && <small>Atualizado em {dataHora.format(new Date(dados.atualizadoEm))}</small>}</footer>
    </main>
  </div>
}

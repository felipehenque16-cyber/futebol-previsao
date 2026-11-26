import { useEffect, useMemo, useState } from 'react'
import type { Dados, Jogo } from './types'

const fmtJogo = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const fmtAtualizacao = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

// Diferença mínima (em pontos percentuais) entre as duas opções mais prováveis para apontar um favorito.
const MARGEM_FAVORITO = 0.06

type Lado = 'casa' | 'empate' | 'fora'

function percentuais(j: Jogo) {
  const p = j.previsao!
  const casa = Math.round(p.casa * 100)
  const fora = Math.round(p.fora * 100)
  return { casa, fora, empate: 100 - casa - fora }
}

function maisProvavel(j: Jogo): { lado: Lado; claro: boolean } {
  const p = j.previsao!
  const ordem = (['casa', 'empate', 'fora'] as Lado[]).sort((a, b) => p[b] - p[a])
  return { lado: ordem[0], claro: p[ordem[0]] - p[ordem[1]] >= MARGEM_FAVORITO }
}

function resultadoReal(j: Jogo): Lado | null {
  if (j.situacao !== 'encerrado' || !j.placar) return null
  return j.placar.casa > j.placar.fora ? 'casa' : j.placar.casa < j.placar.fora ? 'fora' : 'empate'
}

function Selo({ time }: { time: Jogo['mandante'] }) {
  return (
    <span className="time">
      {time.escudo ? <img src={time.escudo} alt="" width={22} height={22} loading="lazy" /> : <span className="escudo-vazio" />}
      <span className="nome">{time.nome}</span>
    </span>
  )
}

function Cartao({ jogo }: { jogo: Jogo }) {
  const quando = fmtJogo.format(new Date(jogo.data))
  const real = resultadoReal(jogo)
  const pr = jogo.previsao ? percentuais(jogo) : null
  const mp = jogo.previsao ? maisProvavel(jogo) : null

  let veredito = 'Poucos jogos para estimar'
  if (mp) {
    if (!mp.claro) veredito = 'Jogo equilibrado'
    else if (mp.lado === 'empate') veredito = 'Empate é o mais provável'
    else veredito = `Provável vencedor: ${mp.lado === 'casa' ? jogo.mandante.nome : jogo.visitante.nome}`
  }

  return (
    <li className="cartao">
      <div className="cabeca">
        <span>{jogo.situacao === 'aoVivo' ? 'Ao vivo' : quando}</span>
        {real && mp && <span className={mp.lado === real ? 'acerto' : 'erro'}>{mp.lado === real ? 'Previsão acertou' : 'Previsão errou'}</span>}
      </div>
      <div className="times">
        <Selo time={jogo.mandante} />
        <span className="placar">{jogo.placar ? `${jogo.placar.casa} × ${jogo.placar.fora}` : 'x'}</span>
        <Selo time={jogo.visitante} />
      </div>
      {pr && (
        <>
          <div className="barra" role="img" aria-label={`Casa ${pr.casa}%, empate ${pr.empate}%, fora ${pr.fora}%`}>
            <span className="b-casa" style={{ flexGrow: pr.casa }} />
            <span className="b-empate" style={{ flexGrow: pr.empate }} />
            <span className="b-fora" style={{ flexGrow: pr.fora }} />
          </div>
          <div className="numeros">
            <span>{pr.casa}%</span>
            <span>Empate {pr.empate}%</span>
            <span>{pr.fora}%</span>
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
  const [aba, setAba] = useState<'proximos' | 'resultados'>('proximos')
  const [campeonato, setCampeonato] = useState('todos')

  useEffect(() => {
    fetch('./dados/jogos.json')
      .then((r) => (r.ok ? (r.json() as Promise<Dados>) : Promise.reject()))
      .then(setDados)
      .catch(() => setErro(true))
  }, [])

  const campeonatos = useMemo(() => {
    const mapa = new Map<string, string>()
    dados?.jogos.forEach((j) => mapa.set(j.codigo, j.competicao))
    return [...mapa]
  }, [dados])

  const grupos = useMemo(() => {
    const lista = (dados?.jogos ?? [])
      .filter((j) => (aba === 'proximos' ? j.situacao !== 'encerrado' : j.situacao === 'encerrado'))
      .filter((j) => campeonato === 'todos' || j.codigo === campeonato)
      .sort((a, b) => (aba === 'proximos' ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data)))
    const porCamp = new Map<string, Jogo[]>()
    lista.forEach((j) => porCamp.set(j.competicao, [...(porCamp.get(j.competicao) ?? []), j]))
    return [...porCamp]
  }, [dados, aba, campeonato])

  return (
    <>
      <header className="topo">
        <h1>Quem leva?</h1>
        <p>Chance de vitória de cada jogo, calculada com estatística. Não é site de apostas.</p>
      </header>
      <main>
        <div className="controles">
          <div className="abas" role="tablist">
            <button role="tab" aria-selected={aba === 'proximos'} onClick={() => setAba('proximos')}>
              Próximos
            </button>
            <button role="tab" aria-selected={aba === 'resultados'} onClick={() => setAba('resultados')}>
              Resultados
            </button>
          </div>
          <select value={campeonato} onChange={(e) => setCampeonato(e.target.value)} aria-label="Campeonato">
            <option value="todos">Todos os campeonatos</option>
            {campeonatos.map(([codigo, nome]) => (
              <option key={codigo} value={codigo}>
                {nome}
              </option>
            ))}
          </select>
        </div>

        {erro && <p className="aviso">Não encontrei os dados. Rode <code>yarn jogos</code> para gerar o arquivo public/dados/jogos.json.</p>}
        {dados && grupos.length === 0 && <p className="aviso">Nenhum jogo nesta lista.</p>}

        {grupos.map(([titulo, jogos]) => (
          <section key={titulo}>
            <h2>{titulo}</h2>
            <ul className="lista">
              {jogos.map((j) => (
                <Cartao key={j.id} jogo={j} />
              ))}
            </ul>
          </section>
        ))}
      </main>
      <footer>
        {dados && <p>Dados atualizados em {fmtAtualizacao.format(new Date(dados.atualizadoEm))}.</p>}
        <p>Estimativa baseada nos resultados anteriores de cada campeonato. Futebol tem muita surpresa: o favorito nem sempre vence.</p>
      </footer>
    </>
  )
}

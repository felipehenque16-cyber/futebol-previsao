export interface Time {
  nome: string
  escudo: string | null
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

export interface Jogo {
  id: number
  codigo: string
  competicao: string
  data: string
  situacao: 'agendado' | 'aoVivo' | 'encerrado'
  mandante: Time
  visitante: Time
  placar: { casa: number; fora: number } | null
  previsao: Previsao | null
}

export interface Dados {
  atualizadoEm: string
  jogos: Jogo[]
}

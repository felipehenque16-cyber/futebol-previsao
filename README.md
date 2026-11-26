# Quem leva? · Previsão dos jogos

Site em React + Vite que mostra, para cada jogo, a chance estimada de vitória do
mandante, de empate e de vitória do visitante. Não tem odds, apostas nem links
de casas de apostas.

## Como funciona

- `scripts/gerar-jogos.ts` busca jogos e resultados no [football-data.org](https://www.football-data.org)
  (plano grátis) e grava `public/dados/jogos.json`.
- `scripts/modelo.ts` calcula a previsão: gols seguem uma distribuição de Poisson,
  com força de ataque e defesa de cada time tirada dos jogos anteriores da
  competição (jogos recentes pesam mais; times com poucos jogos são puxados
  para a média). Cada jogo, inclusive os já encerrados, usa só dados anteriores
  ao seu início.
- O site lê esse JSON e mostra os jogos por campeonato. Em "Resultados" dá para
  conferir se a previsão acertou.

Campeonatos: Brasileirão Série A, Libertadores, Champions League, Premier League,
La Liga, Serie A, Bundesliga, Ligue 1, Primeira Liga, Eredivisie e Championship.
Para incluir outro, adicione o código na lista `COMPETICOES` do script
(o plano grátis só libera alguns).

## Rodando

```bash
yarn install
export FOOTBALL_DATA_TOKEN=sua_chave   # grátis em football-data.org
yarn jogos    # gera public/dados/jogos.json (~1,5 min por causa do limite de requisições)
yarn dev      # http://localhost:5173
```

## Publicação

O workflow `.github/workflows/pages.yml` publica no GitHub Pages a cada push e
a cada 3 horas. Crie o secret `FOOTBALL_DATA_TOKEN` em Settings → Secrets and
variables → Actions e deixe a origem do Pages como **GitHub Actions**.

## Instalar no celular

O site é um PWA. Depois de publicado no GitHub Pages (endereço `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`):

- **Android (Chrome):** menu ⋮ → "Instalar app" (ou "Adicionar à tela inicial").
- **iPhone (Safari):** botão Compartilhar → "Adicionar à Tela de Início".

O app abre em tela cheia e, sem internet, mostra a última previsão que você viu.

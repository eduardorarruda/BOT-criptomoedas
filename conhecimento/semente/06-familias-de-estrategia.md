# Famílias de estratégia intradiária e o que a evidência diz

Resumo: os tipos de estratégia mais usados em day trade de índice, a ideia por trás de cada um, onde costumam falhar e o pouco que a pesquisa diz.

Informação de outubro de 2026. Descreve famílias para estudo; nenhuma é recomendação de investimento.

## Antes de tudo: hipótese e custo

Toda estratégia precisa responder duas perguntas antes do backtest:

1. **Por que a vantagem existiria e quem paga por ela?** Sem hipótese, testar combinações até achar uma que funcionou no passado é garimpo de dados.
2. **A vantagem esperada por operação é bem maior que o custo?** No WIN, uma ida e volta custa perto de 12 pontos em condição normal (tarifas mais slippage). Estratégias com alvo pequeno precisam acertar muito só para empatar.

## Famílias

### Tendência e rompimento

- **Ideia:** o preço que rompe uma faixa (por exemplo, a máxima ou a mínima dos primeiros 30 minutos) tende a seguir na mesma direção por um tempo.
- **Evidência:** existe pesquisa sobre **momento intradiário** em índices americanos: o retorno da primeira meia hora ajudou a prever o da última meia hora no ETF do S&P 500 entre 1993 e 2013, com efeito maior em dias voláteis e de notícias (Gao, Han, Li e Zhou). Não achamos estudo equivalente publicado para o Ibovespa futuro; a hipótese precisa ser testada no WIN.
- **Onde falha:** dias de lateralidade geram muitos rompimentos falsos; cada um custa o stop mais os custos.

### Reversão à média

- **Ideia:** afastamentos grandes de uma referência (média, VWAP, bandas) tendem a voltar.
- **Onde falha:** em dia de tendência forte, o preço não volta, e o stop é atingido várias vezes. A vantagem, quando existe, costuma estar em horizontes curtos, onde os custos pesam mais.

### Leitura de fluxo (tape reading, livro de ofertas)

- **Ideia:** desequilíbrio entre compradores e vendedores no livro antecipa movimentos de poucos ticks.
- **Onde falha:** é o terreno dos operadores de alta frequência, com co-location e latência de microssegundos. Um robô doméstico vê o livro depois deles e reage depois deles.

### Janelas de evento (notícias agendadas)

- **Ideia:** operar o movimento depois de uma divulgação (Copom, IPCA, payroll americano).
- **Onde falha:** o slippage é máximo nesse momento, túneis de leilão disparam e o preço salta. Muitos robôs fazem o contrário: **param** de operar perto de eventos.

### Filtros de regime

- Não é uma estratégia, é um interruptor: ligar a estratégia de rompimento só em regime de tendência e a de reversão só em lateralidade.
- É onde um classificador (regras, modelo estatístico ou um modelo como o Jev) pode ajudar, desde que o ganho seja medido fora da amostra.

## Sinais de que a estratégia é ilusão

- Funciona só com custo zero ou preenchimento perfeito.
- O número de variações testadas não foi registrado.
- O resultado fora da amostra é muito pior que dentro.
- Poucas operações sustentam todo o lucro, ou um único mês explica o resultado.
- Os parâmetros são muito específicos (por exemplo, média de 37 períodos e stop de 143 pontos) e mudam o resultado se mexidos um pouco.

## Fonte(s)

- Gao, Han, Li e Zhou — [Intraday Momentum: The First Half-Hour Return Predicts the Last Half-Hour Return](https://www.smallake.kr/wp-content/uploads/2015/01/SSRN-id2440866.pdf) (versão de trabalho, 2014)
- B3 — [Metodologia de cálculo de túneis de negociação](https://www.b3.com.br/data/files/B7/04/ED/E1/87A7061099BE5706790D8AA8/Metodologia-de-Calculo-de-Tuneis-de-Negociacao.pdf)
- Bailey, Borwein, López de Prado e Zhu — [The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf)
- ZenTrade — [`docs/fundamentacao.md`](../../docs/fundamentacao.md) (famílias de estratégia e evidência em cripto)

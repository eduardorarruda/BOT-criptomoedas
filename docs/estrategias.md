# Estratégias

Uma estratégia diz **quando** comprar e vender. Ela não decide sozinha: o sinal dela passa pela IA (que argumenta) e pelo motor de risco (que tem a palavra final). O código está em [`packages/dominio`](../packages/dominio/src) (`regras.ts`, `catalogo.ts`, `estrategia.ts`, `saidas.ts`, `dimensionamento.ts`, `risco.ts`, `modelos.ts`).

> **Aviso de risco.** Operar criptomoedas pode causar perda, inclusive de todo o valor investido. Estratégia que deu lucro no passado não garante lucro no futuro. Nada aqui é recomendação de investimento nem promessa de resultado. Comece sempre na testnet ou no papel, em modo `observar`.

## A árvore de regras

A regra de entrada (e a de saída, opcional) é uma árvore. Os galhos agrupam; as folhas comparam.

| Nó         | O que faz                                           |
| ---------- | --------------------------------------------------- |
| `e`        | verdadeiro se **todas** as condições do grupo forem |
| `ou`       | verdadeiro se **alguma** condição do grupo for      |
| `nao`      | inverte a condição de dentro                        |
| `comparar` | compara dois operandos com um comparador            |

Operandos:

| Operando                                 | Exemplo                                                     | Valor                                                   |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| `preco`                                  | `{ "tipo": "preco" }`                                       | fechamento do último candle fechado                     |
| `abertura`, `maxima`, `minima`, `volume` | `{ "tipo": "maxima" }`                                      | o campo do último candle fechado                        |
| `numero`                                 | `{ "tipo": "numero", "valor": 30 }`                         | constante                                               |
| `indicador`                              | `{ "tipo": "indicador", "nome": "sma", "periodo": 50 }`     | um indicador do catálogo (abaixo), numa saída escolhida |
| `multiplicar`                            | `{ "tipo": "multiplicar", "operando": {…}, "fator": 0.98 }` | outro operando vezes um fator (ex.: 98% da média)       |

### Indicadores

Indicadores com mais de uma linha pedem `saida`: o operando aponta para **uma** linha. Exemplo: `{ "tipo": "indicador", "nome": "bollinger", "periodo": 20, "desvios": 2, "saida": "inferior" }` aparece na explicação como `banda inferior de Bollinger(20, 2)`.

| `nome`           | Parâmetros                        | `saida`                                                   | O que mede                                                                              | Usa     |
| ---------------- | --------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| `sma`            | `periodo`                         | —                                                         | média simples dos N fechamentos                                                         | C       |
| `ema`            | `periodo`                         | —                                                         | média exponencial (semente: média simples do primeiro período)                          | C       |
| `macd`           | `rapida`, `lenta`, `periodoSinal` | `macd`, `sinal`, `histograma`                             | EMA(rápida) − EMA(lenta); sinal = EMA dessa linha; histograma = linha − sinal (Appel)   | C       |
| `adx`            | `periodo`                         | `adx`, `maisDI`, `menosDI`                                | força da tendência de 0 a 100 e a direção por +DI/−DI (Wilder, 1978)                    | H, L, C |
| `rsi`            | `periodo`                         | —                                                         | índice de força relativa, 0 a 100 (Wilder)                                              | C       |
| `estocastico`    | `periodo`, `suavizacao`           | `k`, `d`                                                  | %K = posição do fechamento na faixa dos N candles; %D = média de %K (Lane)              | H, L, C |
| `roc`            | `periodo`                         | —                                                         | variação % contra N candles atrás                                                       | C       |
| `momento`        | `periodo`                         | —                                                         | variação em preço contra N candles atrás                                                | C       |
| `atr`            | `periodo`                         | —                                                         | amplitude média verdadeira (Wilder; semente = média dos N primeiros TR, como o TA-Lib)  | H, L, C |
| `bollinger`      | `periodo`, `desvios`              | `media`, `superior`, `inferior`, `percentualB`, `largura` | SMA ± k desvios-padrão populacionais; %B (0 = inferior, 1 = superior); largura relativa | C       |
| `donchian`       | `periodo`                         | `superior`, `inferior`, `meio`                            | maior máxima e menor mínima dos N candles **anteriores** (sem o atual)                  | H, L    |
| `volumeMedio`    | `periodo`                         | —                                                         | média dos últimos N volumes                                                             | V       |
| `volumeRelativo` | `periodo`                         | —                                                         | volume do último candle ÷ média dos N **anteriores** (1,5 = 50% acima)                  | V       |

Os testes conferem os indicadores contra os exemplos publicados da StockCharts ChartSchool (RSI e Bandas de Bollinger) e contra uma implementação de referência independente, com frações exatas, das definições de Wilder, Appel e Lane. Um teste de propriedade garante que **nenhum indicador muda quando chegam candles futuros** — e o Donchian deixa o candle atual de fora justamente para que "fechou acima do topo do canal" possa ser verdade.

Indicadores trabalham em `number` (são análise e rodam a cada candle de cada robô e do backtest); preço de ordem, stop e quantidade continuam em decimal exato.

Comparadores: `<`, `<=`, `>`, `>=`, `cruzouAcima` e `cruzouAbaixo`. Os de cruzamento olham dois candles: `A cruzouAcima B` é verdade quando no candle anterior `A ≤ B` e no atual `A > B`.

Além das comparações, a árvore tem a regra de **horário**, `{ "tipo": "horario", "de": "12:00", "ate": "15:00" }`, que vale quando o candle **abre** em `[de, ate)`: o início conta e o fim não. Lê a hora de abertura do último candle fechado (nada do futuro), no fuso do mercado: Brasília no mini índice e o fuso da instância (`ZENTRADE_FUSO`, padrão `America/Sao_Paulo`) no cripto. Se `de` for maior que `ate`, a janela passa da meia-noite (`22:00` a `02:00`); `de` igual a `ate` é recusado. Combina com E, OU e NÃO, vale no backtest e no robô ao vivo, e no Construtor é o bloco "Horário".

Regras de avaliação:

- Só candles **fechados** entram na conta. Nada de decidir com candle pela metade.
- A árvore é avaliada **inteira**, sem atalho, para a explicação mostrar todas as condições. A explicação sai do mesmo percurso que a decisão, então nunca diverge dela.
- Faltou histórico para um indicador (ex.: `SMA(200)` com 150 candles)? A condição é falsa e a explicação diz `dados insuficientes para SMA(200)`. O mesmo vale quando o contexto não traz máxima, mínima ou volume: o indicador nunca inventa um valor a partir do fechamento.
- O contexto de mercado (`ContextoMercado`) leva `fechamentos` (obrigatório) e, alinhados a eles, `aberturas`, `maximas`, `minimas` e `volumes`. O motor monta o contexto completo a partir dos candles fechados (`contextoDeCandles`); chamadores antigos que só mandam fechamentos continuam funcionando.
- Limites, validados antes de gravar: até 12 níveis de profundidade, até 200 nós, períodos inteiros entre 1 e 500 (no MACD, a média rápida menor que a lenta), desvios de Bollinger maiores que 0 e até 10, suavização do estocástico entre 1 e 50.

## Exemplo: média + RSI

Compra quando o preço está acima da média de 50 candles **e** o RSI de 14 sai da sobrevenda (cruza 30 para cima). Vende pela regra de saída quando o RSI passa de 70 — ou antes, pelo stop ou pelo alvo.

```json
{
  "nome": "Média 50 + RSI 14",
  "entrada": {
    "tipo": "e",
    "regras": [
      {
        "tipo": "comparar",
        "esquerda": { "tipo": "preco" },
        "comparador": ">",
        "direita": { "tipo": "indicador", "nome": "sma", "periodo": 50 }
      },
      {
        "tipo": "comparar",
        "esquerda": { "tipo": "indicador", "nome": "rsi", "periodo": 14 },
        "comparador": "cruzouAcima",
        "direita": { "tipo": "numero", "valor": 30 }
      }
    ]
  },
  "saida": {
    "tipo": "comparar",
    "esquerda": { "tipo": "indicador", "nome": "rsi", "periodo": 14 },
    "comparador": ">",
    "direita": { "tipo": "numero", "valor": 70 }
  },
  "stop": 0.02,
  "alvoLiquido": 0.015,
  "taxa": 0.001
}
```

A explicação que fica no diário tem esta cara:

```
(preço (63.380) > SMA(50) (59.998,26): sim) e (RSI(14) (84,1464) cruzou acima de 30: não)
```

Aqui o preço está acima da média, mas o RSI não acabou de cruzar 30 — então não há compra.

## O que acontece com e sem posição

**Sem posição**, a regra de entrada é avaliada. Se for verdadeira, o sinal é `COMPRAR` já com stop e alvo calculados.

**Com posição aberta**, nesta ordem:

1. Preço chegou ao **stop** → `VENDER` (motivo: stop). Vale o **stop efetivo**: o maior entre o stop da entrada e o que o stop móvel ou o empate já subiram (veja abaixo).
2. Preço chegou ao **alvo** → `VENDER` (motivo: alvo).
3. A **regra de saída** (se existir) é verdadeira → `VENDER` (motivo: regra de saída).
4. Passaram `tempoMaximo` candles desde a entrada → `VENDER` (motivo: tempo).
5. Senão, `AGUARDAR`, com stop e alvo na explicação.

Stop e alvo são calculados sobre o **preço médio** da posição, que vem das execuções confirmadas ([ADR 003](adr/003-posicao-derivada-das-execucoes.md)).

## Stop e alvo líquido, com taxas

Os percentuais são frações: `0.02` = 2%. A `taxa` é a da corretora **por ponta** (compra e venda pagam cada uma).

**Stop:**

```
precoStop = entrada × (1 − stop)
```

**Alvo líquido** é o lucro que sobra **depois das duas taxas**. Comprar uma unidade custa `entrada × (1 + taxa)`; vender rende `alvo × (1 − taxa)`. Para sobrar `alvoLiquido` sobre o custo:

```
alvo × (1 − taxa) = entrada × (1 + taxa) × (1 + alvoLiquido)

precoAlvo = entrada × (1 + taxa) × (1 + alvoLiquido) / (1 − taxa)
```

Com `entrada = 60.000`, `taxa = 0,1%`, `alvoLiquido = 1,5%` e `stop = 2%`:

| Valor                    | Conta                          | Resultado |
| ------------------------ | ------------------------------ | --------- |
| stop                     | 60.000 × 0,98                  | 58.800,00 |
| empate (alvo líquido 0%) | 60.000 × 1,001 / 0,999         | 60.120,12 |
| alvo                     | 60.000 × 1,001 × 1,015 / 0,999 | 61.021,92 |

Repare no empate: com 0,1% por ponta, o preço precisa subir uns 0,2% só para pagar as taxas. O motor de risco **barra** qualquer compra cujo alvo fique abaixo do empate (`alvo_abaixo_das_taxas`) e qualquer compra **sem stop** ou com stop acima do preço.

## Saídas além do stop fixo

Todos os campos abaixo são **opcionais**. Sem eles, a estratégia funciona exatamente como antes.

| Campo                    | Exemplo                                           | O que faz                                                                                                     |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `stopAtr`                | `{ "periodo": 14, "multiplo": 2 }`                | stop inicial = entrada − k × ATR(n) do candle da entrada; o `stop` % vira o **teto** da distância             |
| `stopMovel`              | `{ "tipo": "percentual", "distancia": 0.03 }`     | stop sobe para (maior máxima desde a entrada) × (1 − distância)                                               |
| `stopMovel`              | `{ "tipo": "atr", "periodo": 22, "multiplo": 3 }` | stop sobe para maior máxima − k × ATR(n) (a "saída de candelabro")                                            |
| `empate`                 | `{ "gatilho": 0.02 }`                             | depois de a máxima passar de entrada × (1 + gatilho), o stop vai para o preço de empate (as duas taxas pagas) |
| `tempoMaximo`            | `48`                                              | vende depois de N candles do intervalo com a posição aberta                                                   |
| `tamanhoPorVolatilidade` | `{ "periodo": 20, "multiplo": 2 }`                | quantidade = risco por operação ÷ (k × ATR(n)) — veja "Quanto comprar"                                        |

Faixas: períodos de 1 a 500, múltiplos de ATR maiores que 0 e até 20, distância do stop móvel entre 0% e 50%, gatilho do empate acima do custo das duas taxas (0,2% com 0,1% por ponta) e abaixo de 100%, tempo máximo de 1 a 1000 candles. Sem dados para o ATR na entrada, o stop cai no percentual e a explicação diz por quê.

### Como o stop efetivo sobe

O estado da posição aberta fica num `Acompanhamento` imutável: preço de entrada, **stop efetivo**, **maior máxima desde a entrada** e **candles passados**. A cada candle **fechado** do intervalo do robô:

```ts
const passo = atualizarStop(estrategia, acompanhamento, contexto); // contexto termina no candle que fechou
acompanhamento = passo.acompanhamento; // máxima e candles sempre andam
if (passo.novoStop) trocarOrdemDeStop(passo.novoStop); // só quando o stop subiu
const sinal = decidir(estrategia, { ...contexto, preco, acompanhamento }, posicao);
```

- O novo stop é o **maior** entre o stop atual e os candidatos (stop móvel e empate). Por isso ele **nunca desce** e **nunca passa da maior máxima** — os testes de propriedade conferem as duas coisas em séries aleatórias.
- `novoStop` é `null` quando nada mudou: a ordem de stop na corretora fica como está.
- Se o stop subir acima do preço atual (o candle foi longe e voltou), `decidir` já devolve `VENDER` por stop.
- Comprou agora? `iniciarAcompanhamento(estrategia, posicao)` começa com o stop da posição, a máxima na entrada e zero candles. Depois de um reinício, `reconstruirAcompanhamento(estrategia, inicial, contexto, candlesDesdeEntrada)` repassa os candles um a um, cada um só com o que se sabia naquele momento.
- Sem acompanhamento no contexto, `decidir` usa o stop da entrada e não conta tempo — o comportamento de antes.

**No motor** (`apps/motor/src/nucleo/acompanhamento.ts`), o `Acompanhamento` vive em memória e é atualizado a cada candle fechado do intervalo com posição aberta:

- Stop que subiu vira o **stop efetivo**: vai para o diário (`stop_efetivo` da compra, só sobe) e a proteção no livro da corretora é trocada pelo caminho idempotente do stop na corretora — cancela a ordem antiga e coloca a nova, uma vez por alta ([ADR 007](adr/007-protecao-sai-sempre.md)).
- A vigia de 1 minuto (a segunda linha de defesa) usa o mesmo stop efetivo.
- A **saída por tempo** é tratada como a regra de saída: é uma decisão nova (consulta o agente, pede aprovação no modo sugerir, a pausa barra) e, antes de vender, tira a proteção do livro.
- Depois de um reinício, o motor refaz o acompanhamento com `reconstruirAcompanhamento`, a partir do stop gravado e dos candles do buffer fechados desde a primeira compra da posição; os testes conferem que o resultado bate com o caminho ao vivo.

## Quanto comprar

A quantidade não vem da estratégia nem da IA. O dimensionamento procura, por **busca binária** sobre os múltiplos do passo de lote, a **maior quantidade** que respeita ao mesmo tempo:

- o **risco por operação**: se o stop for atingido, a perda (incluindo as duas taxas) não passa do valor configurado;
- o **disponível**: o menor entre saldo livre e o que falta para a exposição máxima;
- os **filtros da corretora**: quantidade mínima e máxima, passo do lote e valor mínimo da ordem.

```
perdaPorUnidade = (preço − stop) + preço × taxa + stop × taxa
custoPorUnidade = preço × (1 + taxa)
```

No exemplo acima, com risco por operação de US$ 10 e US$ 1.000 disponíveis, a perda por unidade é 1.318,80, então a quantidade fica em **0,00758 BTC** (ordem de US$ 454,80). Se nem o mínimo da corretora cabe, não há ordem. A IA pode pedir **menos** tamanho (`tamanhoRelativo` < 1), nunca mais.

**Tamanho pela volatilidade.** Com `tamanhoPorVolatilidade`, o sinal de compra leva `distanciaRisco = k × ATR(n)` e a perda por unidade usa a **maior** entre essa distância e a distância até o stop:

```
saída pessimista = min(stop, preço − k × ATR)
perdaPorUnidade  = (preço − saída) + preço × taxa + saída × taxa
```

Em mercado agitado (ATR alto), a posição fica menor; em mercado calmo, maior — e o risco por operação vale nos dois casos, mesmo que o stop esteja mais longe que k × ATR.

## Modelos de exemplo

O construtor tem **Começar de um modelo**: cinco exemplos conhecidos, das famílias com a evidência menos fraca em cripto — tendência/momento e rompimento —, já montados para estudar, rodar no backtest e adaptar. Estão em [`modelos.ts`](../packages/dominio/src/modelos.ts) e passam nas mesmas validações de qualquer estratégia.

> **Exemplo educativo, para estudar e testar no backtest e no papel. Não é recomendação de investimento nem promessa de resultado: desempenho passado, inclusive o de estudos publicados, não garante desempenho futuro.**

### Rompimento de Donchian 20/10

Compra quando o fechamento passa da maior máxima dos 20 candles anteriores e sai quando fecha abaixo da menor mínima dos 10 anteriores — a regra dos “Turtle Traders” dos anos 1980: deixar a tendência correr e cortar cedo o que não andou. O stop fica a 2 ATR da entrada e o tamanho da posição sai do mesmo ATR, então cada operação arrisca parecido com o mercado calmo ou agitado. Tende a funcionar em tendências longas e fortes; sofre em mercado lateral, com rompimentos falsos em sequência (muitas perdas pequenas antes de um ganho grande). O alvo fica longe de propósito: quem encerra é a regra de saída ou o stop.

### Tendência EMA 9/21 com ADX e volume

Compra quando a EMA de 9 cruza para cima a de 21, mas só se o ADX(14) mostrar tendência com alguma força (acima de 20) e o volume do candle vier 20% acima da média — dois filtros para evitar cruzamentos no meio do nada. Vende no cruzamento contrário, e um stop móvel a 3 ATR da maior máxima protege o ganho no caminho. Tende a funcionar quando o mercado engata uma direção com participação; falha em lateralidade agitada, quando as médias se cruzam várias vezes, e sempre entra e sai com atraso, porque médias olham para trás.

### Volta à média com Bollinger e filtro SMA 200

Compra quando o preço fecha abaixo da banda inferior de Bollinger(20, 2), mas só com o preço acima da média de 200 candles — a aposta é numa queda curta dentro de uma alta maior, não em pegar faca caindo. Sai quando o preço volta à média das bandas, ou depois de 20 candles sem resolver. Tende a funcionar em mercado de alta com correções rasas; falha quando a queda vira tendência (a banda inferior desce junto e o stop é quem encerra) e em quedas rápidas que atravessam a SMA 200 de uma vez.

### Momento com MACD

Compra quando a linha do MACD(12, 26, 9) cruza para cima a linha de sinal com o preço acima da EMA de 50 — momento a favor de uma tendência que já existe. Sai quando o histograma volta a ficar negativo. O stop inicial fica a 2 ATR, e depois de +3% ele vai para o empate (as duas taxas pagas). Tende a funcionar em altas com fôlego e correções curtas; falha em mercado de lado, onde MACD e sinal se cruzam o tempo todo, e devolve parte do ganho porque o sinal de saída também chega atrasado.

### RSI(2) em tendência de alta

Compra quando o RSI de apenas 2 candles cai abaixo de 10 com o preço acima da média de 200 — a ideia popularizada por Larry Connors: num mercado em alta, dois ou três candles de queda forte costumam ser seguidos de repique. Sai quando o preço fecha acima da média de 5 ou depois de 10 candles. Tende a funcionar em altas firmes e mercados que voltam à média no curto prazo; falha quando a queda continua (o RSI fica baixo por vários candles e o stop é atingido) e é sensível às taxas, porque os ganhos por operação são pequenos.

## Como ler o backtest

O backtest roda a estratégia sobre candles históricos com as **mesmas funções do robô** (decisão, agente fixo que concorda, motor de risco, ordem idempotente) numa corretora de papel, e devolve métricas, a curva do patrimônio contra o buy and hold e uma validação (`POST /api/v1/backtests` e `GET /api/v1/backtests/:id`). Ele quer ser **honesto**, não bonito: na dúvida, assume o pior.

### Premissas (o que é simulado e como)

Por padrão a ordem decidida no fechamento de um candle é executada **no fechamento dele**, mais deslizamento. A opção `execucao: "proximaAbertura"` (na tela: "Executar ordens: na abertura do candle seguinte") executa no preço de **abertura do candle seguinte**, que é quando a ordem de fato chegaria; é mais conservador. Vale para a entrada e para a saída por regra, por tempo e por stop móvel decididas no fechamento (stop e alvo seguem valendo dentro do candle). Sem candle seguinte, no último candle da janela, a entrada não abre e a saída sai no fechamento dele; no WIN, a zeragem do fim do pregão continua no fechamento do último candle do dia. O stop e o alvo do cripto são calculados sobre o preço de decisão (o fechamento); no WIN, sobre o preço executado.

| Item             | Padrão                                                                                                                              | Como entra                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Taxa por ponta   | 0,1% (Binance VIP 0); opção 0,075% (pagando com BNB)                                                                                | cobrada em toda compra e venda                                                 |
| Deslizamento     | 5 pontos-base                                                                                                                       | contra você em toda execução; inclui a latência entre decidir e a ordem chegar |
| Meio spread      | 2 pontos-base                                                                                                                       | ordem a mercado cruza o livro; soma ao deslizamento                            |
| Limites de risco | os de um robô novo: perda diária 2% do saldo, exposição 30%, risco por operação 0,5%, 4 ordens por hora, pausa de 60 min após perda | o mesmo motor de risco do robô; dá para copiar os limites de um robô seu       |
| Sem limites      | só se pedir                                                                                                                         | marcado na tela como **menos realista**                                        |
| Stop e alvo      | dentro do candle                                                                                                                    | veja abaixo                                                                    |
| Capital          | `MOTOR_BACKTEST_SALDO` (1000) ou o informado                                                                                        | Sharpe sem taxa livre de risco (contra zero)                                   |

**Stop e alvo dentro do candle.** O robô vigia o preço a cada minuto; o backtest usa a mínima e a máxima do candle ([`intrabar.ts`](../apps/motor/src/backtest/intrabar.ts)):

1. abriu abaixo do stop (salto): sai na abertura, que é pior que o stop;
2. abriu acima do alvo: sai na abertura;
3. a mínima tocou o stop: sai no stop — **mesmo que a máxima também tenha tocado o alvo**. Sem dado mais fino não dá para saber o que veio primeiro, então conta o **pior caso** (a tela diz em quantos candles isso aconteceu);
4. a máxima tocou o alvo: sai no alvo.

Com **precisão de 1 minuto** (períodos de até 31 dias), o backtest baixa os candles de 1 minuto e o primeiro minuto que toca um nível decide. A saída passa pelo mesmo ciclo do robô (plano, risco, ordem), então paga taxa, deslizamento e spread.

As saídas da estratégia valem como o domínio define: o **stop por ATR** fica acertado na compra; o **stop móvel** e o **empate** sobem o stop a cada candle fechado (`atualizarStop`), e o stop novo vale a partir da vigia do candle **seguinte**; a **saída por tempo** e um stop que subiu acima do fechamento vendem no fechamento. O tamanho pela volatilidade vem do próprio sinal. Enquanto o motor ao vivo não guardar o acompanhamento (veja "Estado da integração" acima), o backtest mostra o que o robô fará **depois** dessa integração.

### As métricas

Retornos por candle `rₜ = Pₜ/Pₜ₋₁ − 1`, com `P₀` = capital inicial; `A` = candles por ano em um mercado de **365 dias** (8760 para 1h, 35 040 para 15m).

| Métrica                             | Fórmula / leitura                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Resultado líquido e bruto           | líquido = patrimônio final − inicial (já com custos); bruto = líquido + taxas + deslizamento pagos   |
| CAGR                                | `(final/inicial)^(1/anos) − 1`, só com 1 ano ou mais                                                 |
| Volatilidade anual                  | desvio amostral dos retornos × √A                                                                    |
| Sharpe                              | média ÷ desvio × √A                                                                                  |
| Sortino                             | média ÷ √(Σ min(r, 0)² / n) × √A (desvio para baixo, alvo zero)                                      |
| Calmar                              | CAGR ÷ maior queda (só com CAGR)                                                                     |
| Maior queda e duração               | do pico ao vale; duração do pico até recuperar o pico (ou até o fim, e a tela diz que não recuperou) |
| Fator de lucro, expectativa, payoff | Σ ganhos ÷ \|Σ perdas\|; resultado médio por operação; ganho médio ÷ \|perda média\|                 |
| Tempo exposto                       | fração dos candles que começaram com posição aberta                                                  |
| Buy and hold                        | comprar tudo na abertura do primeiro candle e vender no último fechamento, **com os mesmos custos**  |

### A validação

- **Dentro × fora da amostra** (padrão 70/30): os primeiros 70% do período contra os 30% finais. Se você ajustou a estratégia olhando o começo, o fim é a prova. A tela marca "piorou" quando o lucro de dentro vira prejuízo fora, ou quando o Sharpe de fora cai abaixo da metade do de dentro — **regra prática**, não teste estatístico.
- **Walk-forward** (Pardo): janelas de teste seguidas, cada uma depois de um trecho de referência (rolante, do mesmo tamanho; ou ancorado no início). Sem otimizador de parâmetros, ele avalia a **mesma** estratégia em cada janela e mostra se o resultado se repete: fração de janelas no lucro, média e desvio do retorno e do Sharpe, e a eficiência (retorno por dia no teste ÷ na referência). Com k janelas e fração f dentro: teste = T ÷ (k + f/(1 − f)).
- **Monte Carlo das operações**: 1000 sequências (semente fixa: mesmo pedido, mesmo resultado) sorteadas **com reposição** entre os retornos das operações; mostra as faixas de 5%, 50% e 95% do retorno final e da maior queda, e a chance de ruína (perder o limite escolhido do capital em **algum momento**). Supõe que as operações são independentes: se as perdas vêm em sequência por causa do mercado, o risco real é maior.
- **Tentativas e Sharpe deflacionado.** Cada backtest concluído conta como tentativa da estratégia (todas as versões: mudar um parâmetro e rodar de novo é tentar de novo). Com N tentativas, o melhor Sharpe tende a ser sorte. A tela mostra:
  - **Sharpe probabilístico** (Bailey & López de Prado, 2012): a chance de o Sharpe verdadeiro ser positivo, considerando o tamanho da amostra, a assimetria e a curtose dos retornos;
  - **Sharpe deflacionado** (Bailey & López de Prado, 2014): a mesma chance contra o Sharpe que o acaso daria escolhendo o melhor de N, `√V × ((1 − γ)·Z⁻¹(1 − 1/N) + γ·Z⁻¹(1 − 1/(N·e)))`, com V a variância dos Sharpes entre as tentativas (ou a do próprio estimador, com menos de duas). Abaixo de 95%, desconfie; abaixo de 50%, provavelmente é sorte;
  - **Período mínimo** (MinBTL, Bailey, Borwein, López de Prado e Zhu, 2014): quantos anos de dados seriam precisos para esse Sharpe não aparecer por acaso em N tentativas — com 45 tentativas, 5 anos para um Sharpe anual de 1. É o único aviso com base publicada;
  - **Desconto de Harvey & Liu** (2015, ajuste de Bonferroni): o Sharpe depois de multiplicar o valor-p pelo número de tentativas.
- **Avisos de amostra** (regras práticas, e a tela diz isso): menos de 30 operações (alerta) ou de 100 (atenção); período abaixo de 90 dias ou de 1 ano; o mercado só subiu (ou só caiu) em todas as janelas — um regime só; rodou sem limites; candles em que stop e alvo couberam juntos.

### O veredito

O painel "Veredito" lista verificações verdes, amarelas e vermelhas em português claro — terminou no lucro depois dos custos, bate o buy and hold, mais de 100 operações, fora da amostra manteve, lucro na maioria das janelas, risco de ruína baixo, o Sharpe resiste às tentativas, período suficiente, com os limites do robô. Ele **descreve o passado simulado**: não recomenda investir nem operar, e verde não quer dizer lucro no futuro.

### O que o backtest ainda não mostra

Falhas de conexão, ordens recusadas pela corretora, liquidez fina (o deslizamento é fixo, não depende do tamanho da ordem), funding e o seu próprio comportamento quando o robô perde. Backtests de antes desta validação continuam aparecendo, marcados como antigos (sem deslizamento, com limites relaxados e stop só no fechamento). O caminho continua: backtest → `observar` na testnet → `sugerir` → `auto` com valores pequenos.

### Ordens de stop na corretora de papel

Hoje o backtest decide a saída intrabar em [`intrabar.ts`](../apps/motor/src/backtest/intrabar.ts) e a envia como ordem a mercado pelo ciclo do robô. Quando a corretora de papel ganhar ordens de stop/OCO em repouso (`packages/corretora/src/papel.ts`), o caminho é: na compra, colocar a OCO (stop + alvo) na corretora de papel; a cada candle, `alimentar` o candle completo para a corretora executar as ordens em repouso pela mínima e pela máxima (com a mesma regra de pior caso); trocar a ordem quando `atualizarStop` devolver `novoStop`; e trocar `vigiarDentroDoCandle` em [`rodar.ts`](../apps/motor/src/backtest/rodar.ts) por conferir as execuções da corretora. Os testes de `intrabar.test.ts` e de `rodar.test.ts` (stop, alvo, ambíguo, 1 minuto, stop móvel) servem de contrato para a troca.

## Backtest no mini índice

O backtest também simula o **mini índice (WIN)** da B3, a fase 1 de [Mini índice e Jev](mini-indice-e-jev.md#fases-e-critérios-de-avanço): só backtest, sem robô ao vivo e sem corretora. Na tela Backtests, escolha o mercado:

- **Mini índice — WIN (dados reais importados):** o histórico do próprio WIN, exportado do MetaTrader 5 e importado por CSV ([dados da B3](dados-b3.md)). É o caminho recomendado. Sem candles importados, a tela explica como exportar e importar.
- **Mini índice — WIN (aproximação pelo Ibovespa):** o índice à vista (`WIN-IBOV`), quando há candles dele. O resultado vem com o aviso: "Aproximação: o índice à vista não tem a base do futuro nem o horário completo do WIN; valide com dados reais do WIN antes de operar."

Intervalos: 5m, 15m e 1h. Não há candles de 1 minuto da B3, então a precisão de 1 minuto não vale no WIN.

### Comprado, vendido ou os dois

O WIN se opera nos dois sentidos. A estratégia ganha uma **direção** (`comprado`, `vendido` ou `ambos`; sem ela, `comprado`) e, para vender a descoberto, uma **regra de entrada vendida** e, opcional, uma **regra de saída vendida** (recompra). Tudo do lado vendido é o espelho do comprado: o stop fica acima da entrada e só desce; o alvo fica abaixo; o stop por ATR é entrada + k × ATR; o stop móvel acompanha a **menor mínima**; o empate vale depois de uma queda do tamanho do gatilho. Se as regras de compra e de venda dizem sim no mesmo candle, a estratégia fica de fora. Testes de propriedade conferem a simetria: o vendido no gráfico espelhado faz exatamente o mesmo que o comprado no original.

O à vista de cripto só compra: estratégia vendida ou nos dois sentidos não roda no backtest de cripto e não vira robô (a API recusa e a tela explica).

### O modelo do contrato

| Item              | Como é simulado (padrão)                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrato          | R$ 0,20 por ponto por contrato; tick de 5 pontos; contratos inteiros                                                                                                                          |
| Execução          | no fechamento do candle da decisão, levado ao tick **contra** você (compra para cima, venda para baixo) e mais o deslizamento                                                                 |
| Deslizamento      | 1 tick por lado, em toda execução (entrada, stop, alvo, zeragem)                                                                                                                              |
| Tarifa da B3      | R$ 0,25 por contrato por lado (emolumentos + registro de day trade de quem opera pouco); configurável                                                                                         |
| Corretagem        | R$ 0 por contrato por lado; configurável                                                                                                                                                      |
| Stop e alvo       | dentro do candle, no pior caso: comprado, o stop é tocado pela mínima; vendido, pela **máxima**; os dois no mesmo candle, conta o stop; salto de abertura além do stop sai na abertura        |
| Sessão (Brasília) | entradas das 09:15 às 17:30; o candle do leilão de abertura (o primeiro do dia) não abre posição                                                                                              |
| Zeragem           | no fechamento do candle que termina às 18:15 ou depois, ou no último candle do dia: nada dorme posicionado                                                                                    |
| Tamanho           | contratos = ⌊risco ÷ (pontos do stop × 0,20 + custos de ida e volta)⌋; risco padrão de R$ 100 por operação                                                                                    |
| Limites           | no máximo 5 contratos e no máximo capital ÷ margem (R$ 155 por contrato, a margem de day trade da B3; a corretora pode exigir mais); perda diária, ordens por hora e pausa após perda do robô |
| Capital           | R$ 5.000, se o pedido não disser outro                                                                                                                                                        |

Exemplo da nota 04: risco de R$ 50 e stop de 150 pontos: 150 × 0,20 + 2,50 = R$ 32,50 por contrato, e 50 ÷ 32,50 = 1,5, logo 1 contrato. Se o resultado for zero, a operação não cabe e não é feita (o relatório conta esses sinais).

### O que o resultado mostra

- **Reais e pontos:** resultado líquido, bruto (antes de tarifa, corretagem e deslizamento), por contrato, contratos negociados, tarifas da B3, corretagem e deslizamento (em reais e em pontos), resultado das compras e das vendas, maior queda em reais e em % do pico.
- **IR estimado:** 20% do lucro líquido de cada mês em day trade, com o prejuízo de day trade levado adiante sem prazo, e o **resultado depois do IR (estimado)**. O IRRF de 1% ("dedo-duro") aparece só como informação: é antecipação e abate o DARF. **Não é parecer tributário.**
- **Referências:** comprar e segurar não faz sentido num futuro de day trade. As referências são **ficar de fora** (zero, sem custo) e **sempre comprado na sessão** (1 contrato da abertura à zeragem, todo pregão, com os mesmos custos). A segunda entra nos gráficos onde o cripto mostra o buy and hold.
- **Validação:** a mesma do cripto (dentro e fora da amostra, walk-forward, Monte Carlo, tentativas e Sharpe deflacionado), com o Sharpe anualizado pelos candles do pregão, não por 365 × 24 h.
- **Veredito:** além das verificações de sempre, "custos consomem X% do ganho bruto", lucro depois do IR estimado, comparação com sempre comprado na sessão, dados reais ou aproximação e sinais que não couberam no risco.

### Modelos do mini índice

Quatro modelos em 5 minutos, nos dois sentidos e com taxa zero (os custos vêm do modelo do contrato): **rompimento da faixa de abertura** (30 min), **tendência EMA 9/21 com ADX**, **volta à média com Bollinger no pregão** e **Donchian 20/10 com stop por ATR**. Para eles, a árvore de regras ganhou dois indicadores do pregão, que recomeçam a cada dia de Brasília e não olham candle de depois: o **VWAP do dia** (sem volume, como no índice à vista, não tem valor) e a **faixa de abertura** (máxima e mínima dos primeiros N minutos; só existe depois que eles passam). São exemplos para estudar, não recomendação. Qualquer estratégia pode rodar no WIN: a `taxa` percentual dela (a da corretora de cripto) é ignorada ali, porque o custo do mini índice é por contrato e já entra pelo modelo do contrato; o alvo líquido e o empate ficam em percentual do preço, sem taxa.

### O que este backtest ainda não mostra

Rolagem e vencimento (a série é contínua como veio do CSV), leilões e túneis de preço, circuit breaker, deslizamento maior na abertura e em notícias (configure mais ticks para ver o efeito), margem que muda com a volatilidade e o DARF abaixo de R$ 10, que fica para o mês seguinte. A fase 1 só avança se o resultado fora da amostra, depois dos custos, passar nos critérios escritos antes (veja o estudo).

## Aviso, de novo

Este projeto é software de apoio à decisão. Ele não sabe o futuro, e nenhuma combinação de média, RSI e IA sabe. Use só dinheiro que você pode perder.

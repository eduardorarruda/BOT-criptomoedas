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

O backtest roda a estratégia sobre candles históricos, com as taxas configuradas, e devolve métricas e a curva do patrimônio (`POST /api/v1/backtests` e `GET /api/v1/backtests/:id`). Ao ler:

- **Retorno líquido** já desconta as taxas. Compare com simplesmente ter comprado e segurado no mesmo período.
- **Maior queda** (do pico ao vale) diz quanto você teria visto o saldo cair. Pergunte-se se aguentaria isso sem desligar o robô na pior hora.
- **Número de operações**: poucas operações tornam qualquer número pouco confiável. Dez trades bons podem ser sorte.
- **Taxa de acerto** sozinha engana: acertar 80% com ganhos pequenos e errar 20% com perdas grandes dá prejuízo. Olhe junto com o ganho médio e a perda média.
- **Curva**: prefira uma subida irregular mas constante a um salto único. Um salto único costuma ser um evento que não se repete.
- **Períodos diferentes**: teste em mercado subindo, caindo e de lado. O fluxo de revalidação semanal compara os últimos 30 dias com os 90 anteriores e avisa quando o recente piora.
- **Excesso de ajuste**: se você mexeu nos parâmetros até o backtest ficar bonito, ele provavelmente decorou o passado. Separe um período que você não usou para ajustar e confira nele.

O que o backtest **não** mostra: deslizamento em mercado com pouca liquidez, falhas de conexão, ordens recusadas e o seu próprio comportamento quando o robô perde. Por isso o caminho é sempre: backtest → `observar` na testnet → `sugerir` → `auto` com valores pequenos.

## Aviso, de novo

Este projeto é software de apoio à decisão. Ele não sabe o futuro, e nenhuma combinação de média, RSI e IA sabe. Use só dinheiro que você pode perder.

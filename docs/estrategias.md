# Estratégias

Uma estratégia diz **quando** comprar e vender. Ela não decide sozinha: o sinal dela passa pela IA (que argumenta) e pelo motor de risco (que tem a palavra final). O código está em [`packages/dominio`](../packages/dominio/src) (`regras.ts`, `estrategia.ts`, `dimensionamento.ts`, `risco.ts`).

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

| Operando      | Exemplo                                                     | Valor                                                                                  |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `preco`       | `{ "tipo": "preco" }`                                       | fechamento do último candle fechado                                                    |
| `numero`      | `{ "tipo": "numero", "valor": 30 }`                         | constante                                                                              |
| `indicador`   | `{ "tipo": "indicador", "nome": "sma", "periodo": 50 }`     | `sma` (média simples), `ema` (exponencial) ou `rsi` (índice de força relativa, Wilder) |
| `multiplicar` | `{ "tipo": "multiplicar", "operando": {…}, "fator": 0.98 }` | outro operando vezes um fator (ex.: 98% da média)                                      |

Comparadores: `<`, `<=`, `>`, `>=`, `cruzouAcima` e `cruzouAbaixo`. Os de cruzamento olham dois candles: `A cruzouAcima B` é verdade quando no candle anterior `A ≤ B` e no atual `A > B`.

Regras de avaliação:

- Só candles **fechados** entram na conta. Nada de decidir com candle pela metade.
- A árvore é avaliada **inteira**, sem atalho, para a explicação mostrar todas as condições. A explicação sai do mesmo percurso que a decisão, então nunca diverge dela.
- Faltou histórico para um indicador (ex.: `SMA(200)` com 150 candles)? A condição é falsa e a explicação diz `dados insuficientes para SMA(200)`.
- Limites, validados antes de gravar: até 12 níveis de profundidade, até 200 nós e período de indicador entre 1 e 500.

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

1. Preço chegou ao **stop** → `VENDER` (motivo: stop).
2. Preço chegou ao **alvo** → `VENDER` (motivo: alvo).
3. A **regra de saída** (se existir) é verdadeira → `VENDER` (motivo: regra de saída).
4. Senão, `AGUARDAR`, com stop e alvo na explicação.

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

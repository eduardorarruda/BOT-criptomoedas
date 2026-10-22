# Cofre de tendência no sistema: o backtest do ZenTrade contra a conta do estudo (22/10/2026)

O estudo (`COFRE-TENDENCIA.md`, `cofre-tendencia.mjs`) é uma conta pura. Aqui o MESMO cofre roda no sistema: o modelo `cofre-tendencia-sma400` (4h, SMA 400, entrada e saída só na vela que abre às 17:00 de Brasília = 20:00 UTC, taxa de 0,1%, tamanho por alocação de 100% da exposição máxima, stop de 49% e alvo de +99% como proteção contra desastre) passa pelo `rodarBacktest` de verdade: mesmo ciclo do robô ao vivo (plano, motor de risco, corretora de papel, ordens idempotentes), execução na abertura da vela seguinte, taxa de 0,1% mais 5 pb de deslizamento e 2 pb de meio spread por lado (os mesmos 0,17% por troca do estudo). Resultado de teste, não recomendação.

## Comparação (BTC e ETH, do 401º candle de 4h, março de 2019, a outubro de 2026)

```
par     | sistema: retorno  pior queda  ordens (stops, alvos) | estudo: retorno  pior queda  trocas | estudo com 99,5% investido: retorno  pior queda
BTCUSDT |   2145.33%    -61.80%   141 (0, 3)  |   2290.12%    -61.95%   135 |   2260.81%    -61.76%
ETHUSDT |   2719.97%    -57.96%   135 (0, 6)  |   2921.02%    -58.78%   123 |   2888.17%    -58.59%
```

(`ordens` = compras e vendas que o sistema executou. O estudo bate com o `COFRE-TENDENCIA.md`: BTC 2290% e −62%, ETH 2921% e −59%.)

**As decisões são as mesmas.** Cada compra e cada venda do estudo aparece no sistema, no mesmo dia: BTC 135 trocas + 3 vendas pelo alvo e 3 recompras = 141 ordens; ETH 123 + 6 + 6 = 135. A pior queda bate dentro de 0,8 ponto (−61,80% contra −61,95%; −57,96% contra −58,78%). O retorno final do sistema fica 6% abaixo (BTC) e 7% abaixo (ETH) em patrimônio final, por duas diferenças DELIBERADAS, que não existem na conta pura:

1. **Folga de 0,5% do saldo** (`FOLGA_DA_ALOCACAO`). O estudo põe 100% do capital; o sistema deixa 0,5% do saldo livre de fora para a ordem a mercado não estourar o saldo com o deslizamento e o spread. Sem essa folga, o primeiro teste do sistema com 100% do saldo foi recusado em quase toda compra (saldo insuficiente depois dos 7 pb) e o retorno caiu a −13% no BTC: foi o que o roteiro pegou antes de a folga existir. A coluna "estudo com 99,5% investido" mostra só o efeito dela: BTC 2290% → 2261%, ETH 2921% → 2888%.
2. **O alvo de +99%** (o máximo que o domínio aceita: `alvoLiquido` < 100%). Quando o preço dobra a partir da entrada, o sistema vende no alvo (BTC 3 vezes, ETH 6) e recompra na decisão seguinte, às 17:00 do dia seguinte, se o preço ainda estiver acima da média. Custa 0,34% por ciclo e o tempo fora do mercado nesse intervalo; é a diferença restante (BTC 2261% → 2145%; ETH 2888% → 2720%). O stop de 49% não agiu em nenhuma das duas (a regra de saída encerra antes).

O resto (preço de execução na abertura em vez do fechamento anterior, arredondamento ao passo da corretora) é desprezível nestas séries.

## O que isso prova e o que não prova

- Prova que o modelo, como está no sistema (regra de horário na abertura da vela no fuso de Brasília, SMA 400 de 4h, tamanho por alocação, histórico de 400 velas carregado), reproduz as decisões e a curva do estudo, com os custos do sistema.
- Não prova nada além do estudo: continuam valendo os limites dele (a queda por moeda ainda é grande, ~20 trocas por ano, viés de sobrevivência das moedas, uma janela só).
- A carteira de 15 moedas não foi refeita no sistema (cada robô opera uma moeda; a conta de carteira com peso igual é a do estudo). BTC e ETH são os dois casos pedidos.

## Como repetir

```
corepack pnpm turbo run build --filter=@zentrade/motor...
COFRE_DADOS=/caminho/pesquisa/filtro-ml/dados/4h node pesquisa/queda/cofre-sistema.mjs [BTCUSDT ETHUSDT ...]
```

Leva cerca de 45 s por moeda. Os dados de 4h são ignorados pelo git (cache de pesquisa). Sem eles, a versão sintética roda no CI: `apps/motor/src/backtest/cofre-equivalencia.test.ts` compara o sistema com a conta do estudo em 4.000 velas determinísticas e exige as mesmas trocas, retorno dentro de 1% mais 2% do retorno e pior queda dentro de 1 ponto.

## Como usar com dinheiro de verdade

O cofre não dimensiona pelo risco por operação (não tem stop de verdade). A compra é `fração × exposição máxima` do robô, limitada pelo saldo livre menos a folga: quem manda é a exposição máxima que a pessoa configura (ela é o "tamanho do cofre"). No backtest, o modo "sem limites" usa o saldo inicial como exposição máxima; o modo "robô" usa os limites do robô (os padrões de um robô novo são 30% do saldo). A perda diária máxima do robô continua valendo e pode barrar uma entrada do dia.

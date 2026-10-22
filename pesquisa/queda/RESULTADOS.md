# Estratégia para mercado em queda — espelho vendido da P1 (22/10/2026)

Pré-registro: vende a descoberto quando o preço fecha abaixo da mínima das 20 velas anteriores e abaixo da SMA 200; sai quando fecha acima da máxima das 10 anteriores ou no stop de 2×ATR(20) (teto 10%). Velas de 4h, 15 pares USDT da Binance, 2019-01 a 2026-10, execução na abertura seguinte, stop intrabar no pior caso. Custos: à vista 0,1%/lado; futuros 0,05%/lado; +7 pb/lado de deslizamento; vendido paga financiamento de 0,01%/8h (conservador). US$ 1.000 por operação. Script: `pesquisa/queda/simular.mjs` (dados de `pesquisa/filtro-ml/baixar-dados.ts 4h`). Resultado de teste, não recomendação.

```
pares: 15 | período: 2019-01-01 a hoje

== P1 comprada (à vista)
  total        2620 ops | acerto 31% | ganho médio 14.73% | perda média -4.06% | líquido US$  45450
  2019          183 ops | acerto 33% | ganho médio 13.83% | perda média -4.28% | líquido US$   3214
  2020          324 ops | acerto 40% | ganho médio 15.61% | perda média -3.97% | líquido US$  12392
  2021          405 ops | acerto 31% | ganho médio 31.46% | perda média -6.06% | líquido US$  23102
  2022 (baixa)  264 ops | acerto 31% | ganho médio 8.98% | perda média -4.20% | líquido US$   -421
  2023          389 ops | acerto 28% | ganho médio 12.85% | perda média -3.57% | líquido US$   3836
  2024          402 ops | acerto 29% | ganho médio 13.88% | perda média -3.52% | líquido US$   6216
  2025          343 ops | acerto 28% | ganho médio 7.48% | perda média -3.70% | líquido US$  -2078
  2026          310 ops | acerto 29% | ganho médio 6.63% | perda média -3.08% | líquido US$   -810
  pares no lucro: 14/15

== Espelho vendido (futuros)
  total        2589 ops | acerto 31% | ganho médio 7.92% | perda média -3.98% | líquido US$  -7147
  2019          214 ops | acerto 29% | ganho médio 7.78% | perda média -3.96% | líquido US$  -1075
  2020          231 ops | acerto 29% | ganho médio 12.18% | perda média -4.15% | líquido US$   1511
  2021          312 ops | acerto 31% | ganho médio 9.39% | perda média -6.64% | líquido US$  -4997
  2022 (baixa)  463 ops | acerto 37% | ganho médio 8.90% | perda média -4.31% | líquido US$   2890
  2023          296 ops | acerto 26% | ganho médio 5.58% | perda média -2.85% | líquido US$  -2031
  2024          348 ops | acerto 30% | ganho médio 6.36% | perda média -3.40% | líquido US$  -1498
  2025          435 ops | acerto 34% | ganho médio 5.70% | perda média -3.60% | líquido US$  -2004
  2026          290 ops | acerto 26% | ganho médio 8.98% | perda média -3.05% | líquido US$     57
  pares no lucro: 3/15

== P1 comprada (futuros)
  total        2620 ops | acerto 31% | ganho médio 14.65% | perda média -3.98% | líquido US$  48070
  2019          183 ops | acerto 34% | ganho médio 13.71% | perda média -4.22% | líquido US$   3397
  2020          324 ops | acerto 40% | ganho médio 15.59% | perda média -3.89% | líquido US$  12716
  2021          405 ops | acerto 31% | ganho médio 31.56% | perda média -5.96% | líquido US$  23507
  2022 (baixa)  264 ops | acerto 31% | ganho médio 8.97% | perda média -4.13% | líquido US$   -157
  2023          389 ops | acerto 29% | ganho médio 12.60% | perda média -3.51% | líquido US$   4225
  2024          402 ops | acerto 30% | ganho médio 13.75% | perda média -3.44% | líquido US$   6618
  2025          343 ops | acerto 28% | ganho médio 7.50% | perda média -3.62% | líquido US$  -1735
  2026          310 ops | acerto 29% | ganho médio 6.65% | perda média -2.99% | líquido US$   -500
  pares no lucro: 14/15

== Compra + venda (futuros)
  total        5209 ops | acerto 31% | ganho médio 11.31% | perda média -3.98% | líquido US$  40923
  2019          397 ops | acerto 31% | ganho médio 10.72% | perda média -4.07% | líquido US$   2321
  2020          555 ops | acerto 36% | ganho médio 14.42% | perda média -4.01% | líquido US$  14226
  2021          717 ops | acerto 31% | ganho médio 21.90% | perda média -6.26% | líquido US$  18510
  2022 (baixa)  727 ops | acerto 35% | ganho médio 8.92% | perda média -4.24% | líquido US$   2733
  2023          685 ops | acerto 27% | ganho médio 9.75% | perda média -3.22% | líquido US$   2194
  2024          750 ops | acerto 30% | ganho médio 10.27% | perda média -3.42% | líquido US$   5120
  2025          778 ops | acerto 31% | ganho médio 6.41% | perda média -3.61% | líquido US$  -3739
  2026          600 ops | acerto 28% | ganho médio 7.70% | perda média -3.02% | líquido US$   -443
  pares no lucro: 13/15
```

**Conclusão:** o espelho vendido perde no total (−US$ 7.147, lucro em só 3 de 15 pares); só rende num mercado de baixa longo e firme (2022: +US$ 2.890). Somado à P1 comprada, melhora 2022 mas piora o total. Em cripto, a melhor resposta à queda continua sendo ficar de fora. Alerta: a P1 comprada ficou negativa em 2025 e 2026 — a vantagem pode estar diminuindo.

# Variante: vendido só com a SMA 200 caindo (22/10/2026)

Pré-registrada antes de rodar, uma tentativa: o vendido só entra com a SMA 200 abaixo da SMA 200 de 50 velas atrás. Resto igual a `simular.mjs`. Script: `simular-media-caindo.mjs`.

```
== P1 comprada (futuros)
  total        2620 ops | acerto 31% | ganho médio 14.65% | perda média -3.98% | líquido US$  48070
  pares no lucro: 14/15
== Espelho vendido (futuros)
  total        2589 ops | acerto 31% | ganho médio 7.92% | perda média -3.98% | líquido US$  -7147
  pares no lucro: 3/15
== Vendido só com a média caindo (futuros)
  total        1715 ops | acerto 31% | ganho médio 8.29% | perda média -3.91% | líquido US$  -2072
  pares no lucro: 6/15
== Compra + venda (futuros)
  total        5209 ops | acerto 31% | ganho médio 11.31% | perda média -3.98% | líquido US$  40923
  pares no lucro: 13/15
== Compra + venda só com a média caindo (futuros)
  total        4335 ops | acerto 31% | ganho médio 12.14% | perda média -3.95% | líquido US$  45998
  pares no lucro: 14/15
```

**Conclusão:** o filtro corta o prejuízo do vendido (−US$ 7.147 → −US$ 2.072; 3 → 6 pares no lucro), mas ele continua negativo, e a regra única (compra + venda) segue abaixo de só comprar (+US$ 45.998 contra +US$ 48.070). Em 2025 a regra única perde mais que só comprar. Não adotar.

# Por que a P1 piorou em 2025–2026 (22/10/2026)

Mesmos dados e regras de `simular.mjs` (15 pares, 4h, à vista). Script: `investigar-p1.mjs`.

```
ano  | mercado: retorno médio  acima SMA200  oscilação/vela  eficiência | P1: ops  acerto  ganho méd  maiores 10% dos ganhos  duração ganho  rompimento falso  líquido/op
2020 | 206.5%   57.3%    3.3%  0.203 |  324   39.8%   15.6%   60.4%   47 velas   19.8%    3.8%
2021 | 1470.9%   57.4%    4.4%  0.181 |  405   31.4%   31.5%  152.8%   44 velas   24.9%    5.7%
2022 | -67.0%   31.1%    2.9%  0.193 |  264   30.7%    9.0%   42.7%   31 velas   20.8%   -0.2%
2023 | 151.9%   53.8%    2.0%  0.198 |  389   27.8%   12.8%   53.5%   49 velas   32.9%    1.0%
2024 |  75.9%   51.4%    2.5%  0.188 |  402   29.1%   13.9%   59.9%   42 velas   20.9%    1.5%
2025 | -29.3%   39.1%    2.4%  0.199 |  343   27.7%    7.5%   26.1%   34 velas   29.7%   -0.6%
2026 | -13.0%   47.9%    1.8%  0.187 |  310   29.0%    6.6%   26.6%   35 velas   31.9%   -0.3%
```

**Diagnóstico:** 2025 e 2026 foram anos de queda para as moedas (−29% e −13% em média; menos tempo acima da SMA 200), como 2022. A P1 vive dos poucos ganhos enormes das altas longas (os 10% maiores ganhos: 54–153% nos anos bons, 26% em 2025–26); sem altas longas, ela perde pouco (−0,2% a −0,6% por operação), com mais rompimentos falsos (~30% contra ~20%) e menos oscilação. É o perfil esperado de seguimento de tendência comprado: não é sinal de que a regra quebrou, mas o lucro depende de o mercado voltar a ter altas longas.

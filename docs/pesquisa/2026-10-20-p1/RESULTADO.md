# Confirmação do P1 no backtest do sistema — 20/10/2026

P1 = Donchian 20/10 + preço > SMA 200, velas de 4h, 15 pares USDT da pesquisa `pesquisa/filtro-ml`, 2021-01-01 a 2026-10-01, execução na abertura do candle seguinte, tamanho pelo risco do backtest (modo robô, padrões), uma conta por par com a mesma fatia do capital. Resultado de teste, não recomendação.

```
BTC   ops 138 | acerto 33% | volta 130.03 | B&H 288.1 | DD 5.0% | fora 2.47% | WF+ 100% | sharpe 1.08 | exposto 27%
ETH   ops 154 | acerto 27% | volta 131.64 | B&H 363.5 | DD 7.0% | fora 8.05% | WF+ 80% | sharpe 1.03 | exposto 29%
BNB   ops 154 | acerto 35% | volta 125.28 | B&H 2052.1 | DD 6.0% | fora 3.62% | WF+ 80% | sharpe 0.86 | exposto 28%
SOL   ops 165 | acerto 30% | volta 133.33 | B&H 7802.2 | DD 7.5% | fora 4.52% | WF+ 60% | sharpe 1.08 | exposto 27%
XRP   ops 135 | acerto 24% | volta 122.21 | B&H 676.4 | DD 9.7% | fora 5.36% | WF+ 60% | sharpe 0.68 | exposto 20%
ADA   ops 144 | acerto 26% | volta 114.39 | B&H 135.5 | DD 9.8% | fora 0.75% | WF+ 80% | sharpe 0.50 | exposto 22%
DOGE  ops 139 | acerto 29% | volta 138.64 | B&H 2017.3 | DD 6.0% | fora 2.68% | WF+ 60% | sharpe 1.13 | exposto 19%
LTC   ops 145 | acerto 31% | volta 92.83 | B&H 54.0 | DD 17.4% | fora -1.52% | WF+ 20% | sharpe -0.21 | exposto 25%
LINK  ops 156 | acerto 27% | volta 101.03 | B&H 127.4 | DD 11.5% | fora 2.48% | WF+ 80% | sharpe 0.06 | exposto 26%
DOT   ops 128 | acerto 27% | volta 103.92 | B&H 13.2 | DD 7.7% | fora -2.08% | WF+ 60% | sharpe 0.16 | exposto 20%
TRX   ops 165 | acerto 36% | volta 121.83 | B&H 1256.1 | DD 8.6% | fora -1.83% | WF+ 60% | sharpe 0.68 | exposto 30%
AVAX  ops 149 | acerto 32% | volta 125.86 | B&H 342.1 | DD 6.2% | fora -0.39% | WF+ 60% | sharpe 0.89 | exposto 23%
ATOM  ops 148 | acerto 26% | volta 90.55 | B&H 26.9 | DD 15.2% | fora -5.37% | WF+ 20% | sharpe -0.34 | exposto 21%
BCH   ops 137 | acerto 30% | volta 119.57 | B&H 89.2 | DD 12.5% | fora -7.18% | WF+ 60% | sharpe 0.59 | exposto 25%
ETC   ops 128 | acerto 27% | volta 128.50 | B&H 156.6 | DD 7.4% | fora -0.97% | WF+ 40% | sharpe 0.95 | exposto 20%

CARTEIRA (15 contas iguais): volta 118.64 a cada 100 em 5.7 anos | CAGR 3.02% | Sharpe 1.47 | maior queda 3.9% | B&H médio 1026.7 | moedas no lucro 13/15 | fora da amostra + 8/15

```

Leitura: vantagem pequena e estável (Sharpe 1,47, queda máxima 3,9%), retorno baixo (~3%/ano em dólar) com o risco padrão; comprar e segurar rendeu muito mais no período, com quedas de 70–90% em 2022. Fora da amostra (≈ últimos 30%) só 8/15 pares positivos: a vantagem pode estar diminuindo. Viés de sobrevivência na escolha dos pares continua.

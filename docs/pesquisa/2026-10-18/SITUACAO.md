# Situação dos testes — 18/10/2026

Retrato de onde o trabalho parou. Números "a cada 100" = quanto voltou de cada 100 investidos (capital do teste proporcionalizado). Tudo é resultado de teste, não recomendação de investimento.

Dados brutos: `dados/metricas-completas.json` (todos os backtests, com validação), `dados/decisoes-claude.json` e `dados/placar-claude.json`. Scripts que geraram tudo: `scripts/` (leem o token de `~/.config/zentrade/token-operar` e falam com a API local em `127.0.0.1:8095`; consultar um backtest por vez — 40 de uma vez estoura o limite de requisições).

## 1. Cripto — modelos originais (regra pura, sem o Claude)

Custos: 0,1% por lado + 5 pb de deslizamento + 2 pb de meio spread (~0,34% ida e volta).

### 180 dias (abr–out/2026)

| Estratégia      | 5 min           | 1 hora      |
| --------------- | --------------- | ----------- |
| Donchian · BTC  | 13,70 (913 ops) | 97,11 (66)  |
| EMA 9/21 · ETH  | 96,99 (138)     | 99,25 (24)  |
| Bollinger · SOL | 90,81 (367)     | 101,12 (30) |
| MACD · BNB      | 29,98 (677)     | 90,46 (88)  |
| RSI(2) · BTC    | 76,56 (901)     | 98,27 (93)  |

Em 5 min o resultado bruto ≈ 0: as taxas comem tudo (o Donchian pagou 86 de taxa a cada 100).

### 2 anos

| Estratégia      | 1 hora      | 4 horas     | 1 dia       |
| --------------- | ----------- | ----------- | ----------- |
| Donchian · BTC  | 75,36 (295) | 100,00 (70) | 103,19 (11) |
| EMA · ETH       | 98,10 (76)  | 99,71 (24)  | 100,97 (5)  |
| Bollinger · SOL | 98,66 (115) | 97,82 (36)  | 99,75 (9)   |
| MACD · BNB      | 73,60 (367) | 93,62 (101) | 105,74 (16) |
| RSI(2) · BTC    | 89,47 (375) | 96,55 (93)  | 99,69 (17)  |

Comprar e segurar no período: BTC 120, BNB 121, ETH 91, SOL 67.

**Conclusão:** vela maior perde menos porque paga menos taxa (Donchian: taxa de 28,75 em 1h → 4,66 em 4h → 0,32 em 1d), não porque acerta mais (acerto de 20–65% em todas). O +1,12 do Bollinger 1h em 180 dias virou −1,34 em 2 anos (era sorte).

## 2. Pesquisa de variantes (2 anos, mesmas 4 moedas, 4h e 1d) — 40 backtests, todos concluídos

Critério de melhora: ganhar da original na maioria das 4 moedas E no período fora da amostra (30% final, que a regra não "viu").

| Variante                                       | 4 horas — média (lucrou · fora da amostra +) | 1 dia — média (lucrou · fora +)          |
| ---------------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| P0 Donchian 20/10 (original)                   | 103,45 (4/4 · 4/4)                           | 101,37 (3/4 · 3/4)                       |
| **P1 Donchian 20/10 + preço acima da SMA 200** | **106,16 (4/4 · 4/4)**, acerto 33%           | 101,72 (4/4 · 3/4)                       |
| P2 Donchian 55/20 + SMA 200                    | 101,22 (2/4 · 2/4)                           | 103,23 (4/4 · 4/4), só 5–6 ops por moeda |
| P3 MACD (original)                             | 97,98 (1/4 · 1/4)                            | 102,37 (3/4 · 4/4)                       |
| P4 MACD + SMA 200 + ADX > 20                   | 99,90 (2/4 · 2/4)                            | 100,47 (2/4 · 1/4)                       |

P1 em 4h, por moeda: BTC 104,25 · ETH 111,47 · SOL 106,18 · BNB 102,74 (49–54 operações cada, acerto 30–37%). Ganha de comprar e segurar no ETH e no SOL; perde no BTC e no BNB (que subiram ~20%).

**Leitura:** o filtro de tendência longa melhora o Donchian (P0 → P1) em 4h, de forma consistente nas 4 moedas e fora da amostra. É o **melhor candidato até agora**, mas o ganho é pequeno (~3% ao ano) e foram 10 variantes testadas — o Sharpe deflacionado de cada backtest (em `tentativas`) desconta isso. O filtro ADX não ajudou o MACD.

## 3. Mini índice (WIN) — 4 pregões reais da B3 (13–16/10/2026)

Importados no banco local (`importar-negocios-b3`): 451 velas de 5m, 152 de 15m, 40 de 1h; rolagem WINV26→WINZ26 em 14/10.

Com o risco padrão de R$ 100/operação quase nada operou (52 sinais barrados: o stop de 1 contrato passa de R$ 100 — **ajustar o padrão**). Com capital de R$ 10.000 e risco de R$ 300:

| Estratégia               | 5 min                  | 15 min       |
| ------------------------ | ---------------------- | ------------ |
| Faixa de abertura 30 min | 3 ops, 0 certas, 92,35 | 3 ops, 92,35 |
| EMA 9/21 + ADX           | 5 ops, 2 certas, 97,59 | 1 op, 97,43  |
| Bollinger volta à média  | 5 ops, 2 certas, 94,15 | 1 op, 97,87  |
| Donchian + ATR           | 4 ops, 1 certa, 92,88  | 2 ops, 94,90 |

No WIN os custos são centavos (o prejuízo vem da direção). 4 dias é amostra pequena demais para concluir.

## 4. Claude (robôs na testnet, 5m, Claude CLI do usuário)

Placar em 18/10: 29 decisões, 28 avaliadas. **Vetou todas; 26 de 28 vetos certos (93%, faixa provável 77–98%)**. Nenhuma aprovação ainda → a precisão das aprovações (meta ≥ 80%) ainda não foi medida. Desde a versão com três cenários + taxas + contexto completo, ele recebe custos, ATR, tendência maior e o próprio placar.

## 5. Onde o trabalho parou

- `integracao-v2` = `main` no GitHub (3228f53) + este relatório: backtest WIN, placar, três cenários, fuso de Brasília, importador da B3.
- Branch `coleta-win` (worktree `../zentrade-wt/coleta-win`, commit `67c9d04`, **WIP não testado**): upload dos ZIPs da B3 pela tela (API, fila no motor, tela) quase pronto; faltava gerar a migração. **O conector MT5 não começou.**
- Robôs: 5 em auto na testnet, 5 min, usando o Claude do usuário (consome o limite do plano).

## 6. Próximos passos

1. Terminar `coleta-win`: migração, testes, revisão; depois o conector MT5 (o usuário abre uma conta demo de MT5 numa corretora brasileira).
2. Confirmar P1 com mais moedas/períodos; testar P1 no WIN com anos de dados (MT5) e colocar o Claude como filtro por cima ("reprocessar dias passados", fase 2 do placar).
3. Ajustar o risco padrão do WIN (R$ 100 não cabe 1 contrato).
4. Laboratório de estratégias (o Claude propõe, o sistema testa, o Claude compara) — a rodada manual mostrou ganho pequeno mas consistente com o filtro de tendência.

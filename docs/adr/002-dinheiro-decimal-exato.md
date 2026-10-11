# ADR 002 — Dinheiro em decimal exato

**Situação:** aceita · 2026-10

## Contexto

Em ponto flutuante, `0,1 + 0,2` dá `0,30000000000000004`. Num robô que arredonda o lote para o passo da corretora, compara com o mínimo e soma taxas, esse resíduo vira ordem recusada, posição que nunca zera e resultado que não bate com o extrato.

## Decisão

- Preço de ordem, quantidade, saldo, taxa e resultado são **decimais exatos** (`decimal.js`, por um clone próprio com 40 dígitos e arredondamento bancário). Entrada pela função `dec()`; saída em texto por `paraTexto()`, sem notação científica.
- Entre serviços, decimais trafegam **como texto** (`"0.00123"`), nunca como número JSON.
- Indicadores técnicos (médias, RSI) são análise e podem usar `number`. A fronteira é clara: o que vira ordem ou dinheiro é decimal.
- Fora do TypeScript, a mesma regra vale: o relatório diário do n8n soma taxas com `BigInt` sobre o texto, não com `Number`.

## Consequências

- Um pouco mais de verbosidade (`a.plus(b)` em vez de `a + b`) em troca de contas que batem com a corretora.
- Testes cobrem os casos clássicos (lote, passo, mínimo, soma de taxas).
- Formatação para pessoas (ex.: `US$ 12,50`) pode passar por `number`, porque é só exibição.

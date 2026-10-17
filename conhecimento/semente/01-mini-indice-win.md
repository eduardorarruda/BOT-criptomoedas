# Especificação do mini índice (WIN)

Resumo: o que é o contrato futuro mini de Ibovespa, quanto vale cada ponto, como se forma o código e quando vence.

Informação de outubro de 2026. Não é recomendação de investimento.

## O contrato

- **Nome oficial:** Futuro Mini de Ibovespa. **Código de negociação:** WIN.
- **Objeto:** o índice Ibovespa, cotado em pontos.
- **Valor do ponto:** R$ 0,20 por contrato. Um contrato a 130.000 pontos corresponde a cerca de R$ 26.000 de exposição (130.000 × 0,20).
- **Variação mínima (tick):** 5 pontos, ou R$ 1,00 por contrato.
- **Lote:** 1 contrato.
- **Liquidação:** financeira. Ninguém entrega ações; no vencimento, a diferença é paga em dinheiro.
- **Contrato "cheio":** o IND tem a mesma lógica com ponto maior. O WIN existe para permitir exposição menor.

## Código e vencimento

- O código é `WIN` + letra do mês + ano com dois dígitos. Exemplo: `WINZ26` é o contrato de dezembro de 2026.
- Só há vencimentos em **meses pares**: G (fevereiro), J (abril), M (junho), Q (agosto), V (outubro), Z (dezembro).
- O vencimento é a **quarta-feira mais próxima do dia 15** do mês de vencimento, que também é o último dia de negociação. Se não houver pregão, passa para o seguinte.
- Exemplos: o `WINV26` venceu em 14/10/2026; o `WINZ26` vence em 16/12/2026. Feriados podem mudar a data; o calendário de vencimentos da B3 é a referência.
- No dia do vencimento, o contrato que vence para de ser negociado mais cedo (17h00 na grade consultada).

## Rolagem

- A liquidez migra para o contrato seguinte nos dias antes do vencimento. Quem opera só no dia (day trade) apenas troca o código que acompanha.
- A B3 tem um instrumento próprio de rolagem, o `WI1`, com horário diferente do WIN.
- Plataformas costumam mostrar um código genérico (como `WINFUT`) para gráficos, mas o envio de ordem exige o código exato do contrato vigente.
- Para backtest, é preciso juntar os contratos numa série contínua com regra de troca explícita; sem isso aparecem saltos de preço falsos no dia da troca.

## Limites de preço

- **Limite de oscilação diária:** 10% sobre o preço de ajuste do dia anterior.
- **Túneis de negociação:** a B3 recusa ofertas fora de uma faixa dinâmica (túnel de rejeição) e abre um leilão automático quando um negócio sairia fora da faixa (túnel de leilão). Ver a nota sobre horários e leilões.

## Margem

- Para **day trade**, a B3 fixa uma margem mínima por contrato para o varejo: R$ 155,00 no WIN desde 2/2/2026. A corretora pode exigir mais.
- Para **carregar posição** para o dia seguinte, a margem é calculada pela B3 e é muito maior (textos de corretoras citam alguns milhares de reais por contrato; o valor muda com a volatilidade).
- Margem não é medida de risco. Uma variação de 1% do índice, perto de 1.300 pontos, equivale a cerca de R$ 260 por contrato, mais que a margem mínima de day trade.

## Conta rápida de pontos em reais

| Movimento         | Por contrato |
| ----------------- | ------------ |
| 1 tick (5 pontos) | R$ 1,00      |
| 50 pontos         | R$ 10,00     |
| 100 pontos        | R$ 20,00     |
| 500 pontos        | R$ 100,00    |
| 1.000 pontos      | R$ 200,00    |

## Fonte(s)

- B3 — [Futuro Mini de Ibovespa](https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/futuro-mini-de-ibovespa.htm)
- B3 — [Horários de negociação: índices](https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/horario-de-negociacao/derivativos/indices/)
- B3 — [Oscilação diária de negociação (nov/2025)](https://www.b3.com.br/data/files/57/31/0B/84/577BA9105B12E5A9AC094EA8/Oscilacao%20Maxima%20Diaria%20-%20PT%20-%2021112025.pdf)
- B3 — [Margem mínima requerida para minicontratos](https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/regras-e-parametros-de-negociacao/margem-minima-requerida-e-guia-educacional-para-minicontratos/)
- InfoMoney — [Novos valores de margem mínima da B3 para day trade](https://www.infomoney.com.br/mercados/b3-revisa-margens-minimas-redefine-capital-exigido-no-day-trade/)
- Nelogica — [Como enviar ordens com a ProfitDLL](https://blog.nelogica.com.br/como-enviar-ordens-profitdll/) (exigência do código exato do contrato)

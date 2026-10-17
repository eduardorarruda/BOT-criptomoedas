# Horários, leilões e circuit breaker na B3

Resumo: em que horário o mini índice negocia, o que são os leilões e túneis de preço e o que acontece com ordens num circuit breaker.

Informação de outubro de 2026. Os horários mudam ao longo do ano; confira o ofício circular vigente da B3. Não é recomendação de investimento.

## Horário do WIN

- Desde 9/3/2026, o mercado de derivativos funciona das **9h00 às 18h30**. A mudança acompanhou o início do horário de verão nos Estados Unidos e na Europa (Ofício Circular 005/2026-PRE).
- Na grade de índices consultada em outubro de 2026, o **WIN** tem:
  - **pré-abertura** 5 minutos antes das 9h00 (ofertas entram, mas não há negócio);
  - **negociação contínua** das 9h00 às 18h25;
  - **call eletrônico de fechamento** às 18h25;
  - **janela do preço de ajuste** das 17h00 às 17h15;
  - no dia do vencimento, o contrato que vence encerra às 17h00.
- **After-market do WIN:** a grade consultada não mostra sessão estendida para o WIN, só para o instrumento de rolagem (`WI1`). Textos de corretoras citam negociação até 19h; isso não foi confirmado na página da B3.
- A B3 costuma ajustar a grade quando o horário de verão americano começa e termina (o próximo fim é em novembro de 2026).

## Leilões e túneis

A B3 usa três mecanismos de faixa de preço:

- **Túnel de rejeição:** a oferta que chega com preço fora de uma faixa em torno do preço de referência é recusada na entrada. A faixa acompanha o mercado ao longo do dia.
- **Túnel de leilão:** se um negócio for fechar fora da faixa, o sistema não executa e abre um **leilão automático**. No leilão, os negócios saem a um preço único, o que maximiza a quantidade negociada.
- **Túnel de proteção:** durante um leilão, se o preço teórico sair da faixa, o fim do leilão é prorrogado.

O preço de referência do túnel é, em geral, o último negócio (ajustado pelas melhores ofertas) ou o preço de referência calculado pela B3.

**Por que isso importa para um robô:**

- uma ordem pode ser **recusada** ou ficar **parada num leilão** justamente quando o preço anda rápido;
- uma ordem stop, ao disparar, vira ordem comum e está sujeita às mesmas faixas;
- o robô precisa tratar "rejeitada" e "em leilão" como estados normais e não reenviar ordens em loop.

## Limite de oscilação diária

O WIN tem limite de 10% sobre o preço de ajuste do dia anterior. Diferente do túnel, é estático ao longo do dia.

## Circuit breaker

Medido pela queda do Ibovespa em relação ao fechamento do dia anterior:

| Queda | O que acontece                       |
| ----- | ------------------------------------ |
| 10%   | Negociação suspensa por 30 minutos   |
| 15%   | Nova suspensão, por 1 hora           |
| 20%   | Suspensão por prazo definido pela B3 |

Durante a suspensão, nenhuma ordem executa, inclusive stop. A posição aberta fica exposta ao preço da reabertura.

## Regras práticas que um robô pode adotar (exemplos, não recomendação)

- Não abrir posição na pré-abertura nem nos primeiros minutos do pregão.
- Zerar tudo alguns minutos antes do call de fechamento.
- Parar de abrir posição se o último negócio recebido tiver mais de alguns segundos (dado atrasado).
- Tratar suspensão como "não operar" até a reabertura estabilizar.

## Fonte(s)

- Bora Investir/B3 — [B3 muda horários de negociação a partir de 9 de março](https://borainvestir.b3.com.br/noticias/mercado/b3-a-bolsa-do-brasil-muda-horarios-de-negociacao-a-partir-de-9-de-marco-confira/)
- B3 — [Horários de negociação: índices](https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/horario-de-negociacao/derivativos/indices/)
- B3 — [Metodologia de cálculo de túneis de negociação](https://www.b3.com.br/data/files/B7/04/ED/E1/87A7061099BE5706790D8AA8/Metodologia-de-Calculo-de-Tuneis-de-Negociacao.pdf)
- B3 — [Oscilação diária de negociação (nov/2025)](https://www.b3.com.br/data/files/57/31/0B/84/577BA9105B12E5A9AC094EA8/Oscilacao%20Maxima%20Diaria%20-%20PT%20-%2021112025.pdf)
- Bora Investir/B3 — [Entenda o que é e como funciona o circuit breaker](https://borainvestir.b3.com.br/noticias/mercado/entenda-o-que-e-e-como-funciona-o-circuit-breaker/)

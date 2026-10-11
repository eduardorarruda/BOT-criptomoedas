# ADR 001 — A IA propõe, o risco decide

**Situação:** aceita · 2026-10

## Contexto

Modelos de linguagem erram com confiança, alucinam fontes, saem do ar e podem ser manipulados por texto que leem (notícias, por exemplo). Um robô que deixa a IA enviar ordens herda todos esses defeitos com dinheiro na mesa. Ao mesmo tempo, a IA é boa para juntar contexto: casos parecidos no histórico, notícias recentes, regras da corretora.

## Decisão

- A IA devolve só uma **proposta estruturada** (`PropostaAgente`: ação, confiança, tamanho relativo, stop, alvo, justificativa, riscos e fontes). Nenhuma ferramenta do agente envia ordem.
- A quantidade sai do **dimensionamento** (busca binária pelo maior lote que cabe no risco, no saldo e nos filtros da corretora). A IA só pode **pedir menos** tamanho (`tamanhoRelativo` ≤ 1).
- O **motor de risco** (`avaliarRisco` em `packages/dominio`) é código simples, determinístico e testado. Ele aprova ou barra, sempre com o motivo: parada total, frequência, perda diária, exposição, pausa após perda, stop ausente ou inválido, alvo que não cobre as taxas, confiança abaixo do mínimo e filtros da corretora.
- Falha, timeout (60 s) ou resposta fora do esquema da IA = **não operar**.

## Consequências

- O pior caso de uma IA ruim é perder oportunidades, não perder dinheiro além dos limites.
- Vendas que encerram posição passam mesmo com perda diária estourada ou confiança baixa: sair reduz risco. Só a parada total e a frequência barram vendas.
- Mudanças no risco exigem teste; o pacote `dominio` exige 90% de cobertura.
- Ninguém abre exceção a isso, nem para "só desta vez" (está no [CONTRIBUTING](../../CONTRIBUTING.md)).

# O modelo de segurança do ZenTrade

Resumo: quem decide o quê dentro do ZenTrade (regras, IA e motor de risco), por que a IA nunca envia ordem e o que acontece quando algo falha.

Informação de outubro de 2026, válida para o ZenTrade com Binance e para o desenho proposto para mini índice. Não é recomendação de investimento.

## Três papéis separados

1. **As regras decidem quando há sinal.** A estratégia é uma árvore de regras escrita pela pessoa (indicadores, horários, condições). É determinística: o mesmo dado gera a mesma decisão.
2. **A IA argumenta.** Recebe o sinal e o contexto e devolve uma proposta: agir ou aguardar, com confiança, justificativa, riscos e fontes. Pode pedir **menos** tamanho, nunca mais. **Não envia ordem** e não tem ferramenta para isso.
3. **O motor de risco tem a palavra final.** Determinístico, roda depois da IA e antes de qualquer ordem. Confere stop, perda do dia, número de operações, exposição, parada total. Se barrar, a ordem não sai, e o motivo fica registrado.

## O pior caso é não operar

- Se a IA falhar, demorar demais ou estiver sem orçamento, a decisão é **não operar**.
- Se a corretora ou a conexão cair, o robô não abre posição nova.
- Nenhuma falha deve resultar em ordem a mais.

## Proteção na corretora

- Toda entrada tem stop.
- O stop fica registrado onde sobrevive à queda do ZenTrade (no livro da corretora ou da bolsa). O robô confere a cada candle como segunda linha.
- Pausa e parada total barram **entradas**; o stop sempre pode sair.
- No mini índice, onde o OCO pode ser emulado, a primeira versão prevê só o stop no livro, para evitar que uma perna órfã abra posição contrária.

## Caminho até o dinheiro real

- Robô novo nasce em **observar** (só registra).
- Depois, **sugerir**: propõe e espera aprovação humana (por exemplo, pelo Telegram), com prazo para expirar.
- Só então **auto**, e primeiro em papel ou testnet. Dinheiro real exige confirmação extra.

## Registro de cada decisão

Cada decisão guarda: a explicação da regra, a proposta da IA com as fontes, as barreiras do risco e, depois, o desfecho. A posição nunca é gravada à mão; é recalculada a partir das execuções confirmadas pela corretora.

## O que isso significa para quem usa uma IA rápida (como o Jev)

- Um modelo rápido entra no lugar da IA (papel 2), nunca no lugar do risco (papel 3).
- A probabilidade que ele devolve é tratada como opinião a ser medida, não como garantia.
- Limites, tamanho, stop e zeragem continuam no código.

## Fonte(s)

- ZenTrade — [`docs/arquitetura.md`](../../docs/arquitetura.md)
- ZenTrade — [ADR 001: a IA propõe, o risco decide](../../docs/adr/001-ia-propoe-risco-decide.md)
- ZenTrade — [ADR 007: a proteção sai sempre](../../docs/adr/007-protecao-sai-sempre.md)
- ZenTrade — [`docs/mini-indice-e-jev.md`](../../docs/mini-indice-e-jev.md)

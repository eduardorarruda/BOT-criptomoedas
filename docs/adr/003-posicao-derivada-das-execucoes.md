# ADR 003 — A posição é derivada das execuções

**Situação:** aceita · 2026-10

## Contexto

Gravar "quanto tenho" num campo e atualizá-lo a cada ordem cria duas verdades: o campo e o histórico. Basta uma ordem parcial, uma taxa cobrada no próprio ativo ou um processo que cai no meio para elas divergirem — e ninguém sabe qual está certa.

## Decisão

- A posição **não é gravada**. É calculada (`posicaoDe` em `packages/dominio`) a partir das **execuções confirmadas pela corretora**: quantidade, preço médio ponderado, resultado realizado líquido de taxas e taxas pagas.
- A execução já chega com a quantidade líquida (se a taxa sai no próprio ativo, o adaptador desconta) e a taxa convertida para a moeda de cotação.
- Venda maior que a posição é erro, não número negativo.
- A ordem é **reservada antes de enviar**, com um `idCliente` único: se o motor cair entre enviar e gravar, a reconciliação consulta a corretora por esse id e não reenvia.

## Consequências

- Uma fonte da verdade: a posição sempre bate com o que a corretora confirmou.
- Recalcular custa uma leitura das execuções do robô; para os volumes de um robô pessoal isso é barato e pode ganhar cache sem mudar a regra.
- Corrigir um erro é corrigir uma execução, e a posição se ajusta sozinha.

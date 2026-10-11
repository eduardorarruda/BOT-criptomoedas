# Como contribuir

Obrigado pelo interesse no ZenTrade.

1. Abra uma issue antes de mudanças grandes, para combinarmos o caminho.
2. Teste primeiro: toda mudança de comportamento vem com teste. O pacote `dominio` exige 90% de cobertura.
3. `corepack pnpm check` precisa passar (lint, tipos e testes).
4. Dinheiro é sempre decimal exato (`dec()`), nunca `number`.
5. A IA nunca envia ordem: ela propõe, o motor de risco decide. Não abra exceção a isso.
6. Commits no formato `tipo: descrição` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`).

## Licença das contribuições

O ZenTrade é AGPL-3.0. Ao abrir um pull request você concorda com o [acordo de contribuição](CLA.md), que permite ao mantenedor também oferecer o projeto sob licença comercial.

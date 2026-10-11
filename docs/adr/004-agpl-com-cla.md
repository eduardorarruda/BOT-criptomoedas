# ADR 004 — Licença AGPL-3.0 com acordo de contribuição

**Situação:** aceita · 2026-10

## Contexto

O ZenTrade quer ser aberto: quem opera dinheiro precisa poder ler o código que opera. Também quer evitar que alguém feche o projeto num serviço pago sem devolver melhorias, e manter a porta aberta para uma licença comercial que sustente o desenvolvimento.

## Decisão

- Licença **AGPL-3.0**: quem oferecer o ZenTrade modificado como serviço pela rede precisa disponibilizar o código das modificações.
- Contribuições seguem o **[CLA](../../CLA.md)**: o autor continua dono, licencia sob a AGPL e concede ao mantenedor o direito de sublicenciar (inclusive comercialmente). O pull request inclui a frase de concordância.

## Consequências

- Uso pessoal e auto-hospedado é livre.
- Empresas que não querem as obrigações da AGPL podem negociar uma licença comercial com o mantenedor.
- O CLA cria um passo a mais para contribuir; ele é curto e explicado no [CONTRIBUTING](../../CONTRIBUTING.md).
- Dependências precisam ser compatíveis com a AGPL (MIT, Apache-2.0, BSD e similares são).

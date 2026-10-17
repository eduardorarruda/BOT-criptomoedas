# Plataformas para automatizar o mini índice

Resumo: as formas que uma pessoa física tem de mandar ordens automáticas de WIN (Profit, ProfitDLL, MetaTrader 5, APIs de terceiros), com custo, sistema operacional e limitações.

Informação de outubro de 2026. Preços e condições mudam; confirme com a corretora e o fornecedor. Não é recomendação de investimento nem de fornecedor.

## Profit (Nelogica) com automação de estratégias

- A estratégia é escrita na linguagem da plataforma (NTSL) e roda **dentro do Profit**.
- O Profit tem versão **nativa para Linux** desde agosto de 2026 (Ubuntu 18.04+, Debian 10+, Fedora 32+), nas versões Training, One, Plus, Pro e Ultra. As versões personalizadas de corretoras (white label) ainda não têm Linux.
- Recursos de ordem na plataforma: OCO, stop móvel, breakeven automático.
- A automação é gratuita em conta de simulação e paga em conta real (valores a confirmar com a Nelogica).
- Limitação: a lógica fica presa na plataforma; não conversa com sistemas externos.

## ProfitDLL (Nelogica)

- Biblioteca para programas externos: dados em tempo real, histórico e **roteamento de ordens** (enviar, alterar, cancelar, zerar posição).
- Tipos de ordem no roteamento: **Market, Limit e StopLimit**. OCO não aparece entre as funções de roteamento listadas.
- Exige licença ativa da ProfitDLL; preço não encontrado em página pública.
- **Linux:** sem versão nativa. A Nelogica publicou o passo a passo para rodar o Python para Windows dentro do **Wine** e carregar a DLL, sem máquina virtual.
- Detalhes que importam: uma licença por conexão; o envio de ordem exige o código exato do contrato (por exemplo, `WINZ26`), não o genérico; a senha de roteamento é diferente da senha de login.

## MetaTrader 5 via corretora

- Várias corretoras oferecem MT5 para a B3 (citadas em textos de terceiros: XP, Clear, Rico).
- Robôs em MQL5 rodam dentro do terminal. Para programas externos, existe o pacote Python oficial `MetaTrader5`, que **só tem versões para Windows x64** e exige o terminal aberto.
- **Linux:** roda-se o terminal e o Python para Windows no Wine, com uma ponte (por exemplo, `pymt5linux`) para o Python do Linux. É solução da comunidade, não do fabricante.
- Contas demo existem, mas há relatos de demos que não mostram ativos da B3; confira com a corretora.

## APIs de terceiros

- Empresas como a Cedro oferecem APIs REST, WebSocket e FIX para dados e ordens na B3, por meio de corretoras parceiras, também para pessoa física. Preço sob consulta.
- A B3 **não** oferece suas APIs a pessoas físicas; elas são só para empresas.

## Comparação rápida

| Caminho       | Linux                          | Integração externa | Ordens                         | Custo                        |
| ------------- | ------------------------------ | ------------------ | ------------------------------ | ---------------------------- |
| Profit + NTSL | Nativo                         | Não                | OCO e stop na plataforma       | Plano + módulo               |
| ProfitDLL     | Pelo Wine (com guia oficial)   | Sim                | Market, Limit, StopLimit       | Licença (sob consulta)       |
| MT5 + Python  | Pelo Wine (guia da comunidade) | Sim                | Mercado, limitada, stop, SL/TP | Em geral grátis na corretora |
| Cedro         | Qualquer                       | Sim, HTTP          | Envio, edição, cancelamento    | Sob consulta                 |

## Perguntas para fazer à corretora ou ao fornecedor

1. A ordem stop fica no livro da B3 ou no servidor da plataforma ou da corretora?
2. A conta de simulação aceita ordens por API ou DLL?
3. Há termo de uso específico para automação?
4. Qual a margem de day trade que ela exige para o WIN?
5. O uso de dados por um robô pessoal tem tarifa extra da B3 (categoria "non-display")?
6. Ela atua como contraparte (RLP) nas ordens de varejo?

## Fonte(s)

- Nelogica — [Profit para Linux](https://blog.nelogica.com.br/profit-linux/)
- Nelogica — [Como usar a ProfitDLL no Linux](https://blog.nelogica.com.br/profitdll-linux/)
- Nelogica — [Como enviar ordens com a ProfitDLL](https://blog.nelogica.com.br/como-enviar-ordens-profitdll/)
- MQL5 — [Integração com Python](https://www.mql5.com/en/docs/python_metatrader5)
- PyPI — [MetaTrader5](https://pypi.org/project/MetaTrader5/)
- MQL5, fórum — [Guia para instalar MT5 e o pacote Python no Linux](https://www.mql5.com/en/forum/457940)
- GitHub — [pymt5linux](https://github.com/hpdeandrade/pymt5linux)
- TraderBot — [Corretoras com MetaTrader 5 na B3](https://blog.traderbot.com.br/corretoras-com-metatrader-5-na-b3/)
- Cedro — [API Trading](https://www.cedrotech.com/apis/api-trading/)
- B3 — [Portal de APIs](https://developers.b3.com.br/apis)
- B3 — [Política Comercial de Market Data 2026](https://www.b3.com.br/data/files/94/95/30/28/F54599100A29E189AC094EA8/Politica%20Comercial%20de%20Market%20Data_2026.pdf)

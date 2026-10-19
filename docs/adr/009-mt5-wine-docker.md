# ADR 009 — Conector MT5 automático: Wine + mt5linux, perfil opcional

**Situação:** aceita · 2026-10

## Contexto

A pessoa pediu que o ZenTrade busque os dados do WIN automaticamente, com um botão, em vez de exportar o CSV à mão no MetaTrader 5 ([docs/dados-b3.md](../dados-b3.md#importar-o-win-de-um-csv-metatrader-5-ou-generico)). A biblioteca oficial `MetaTrader5` (PyPI) só fala com o terminal MT5, que só existe para **Windows**. O resto do ZenTrade roda em containers Linux (`infra/docker-compose.yml`); não há (e não deve haver) uma VM Windows na stack só para isto.

A B3 proíbe coleta automatizada das próprias páginas (ver aviso no topo de `docs/dados-b3.md`); isso não se aplica aqui: o MT5 é o terminal da **corretora**, lendo dados que ela já distribui para a conta, não uma página da B3.

## Alternativas avaliadas

| Opção                                               | Como funciona                                                                                                                                                                                                 | Problema                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| VM Windows dedicada                                 | MT5 nativo + script Python local                                                                                                                                                                              | Pesada, fora do `docker compose`, mais uma coisa para o usuário manter rodando                                  |
| Wine + MT5 + API Python, do zero                    | Construir a imagem na mão                                                                                                                                                                                     | Reinventa um problema já resolvido; frágil (o setup do Wine para o MT5 tem detalhes finos: fontes, `.NET`, DPI) |
| **Wine + MT5 + `mt5linux`/RPyC, projeto existente** | Container com Wine roda o terminal MT5 (headless, por VNC se precisar depurar) e expõe a API Python por RPyC (porta interna 8001); o `mt5linux` do lado "Linux" chama essa API como se fosse o pacote oficial | É o caminho adotado                                                                                             |

Pesquisa (outubro de 2026): o projeto [`gmag11/MetaTrader5-Docker-Image`](https://github.com/gmag11/MetaTrader5-Docker-Image) (também publicado como `gmag11/MetaTrader5-Docker`) empacota Wine + MT5 + um servidor RPyC na porta 8001, com VNC web para depuração visual quando necessário; licença **MIT**. O pacote [`mt5linux`](https://github.com/lucas-campagna/mt5linux) do lado de quem chama (aqui, dentro do próprio container, por um pequeno serviço Python) fala com esse RPyC e replica a assinatura de `MetaTrader5` (`initialize`, `login`, `symbol_select`, `copy_rates_range`, `symbols_get`…), então o código de coleta é o mesmo da documentação oficial do PyPI.

**Login sem GUI:** não precisa de fork nem de automação de clique. O terminal sobe sem conta; quem abre a sessão é o coletor, chamando `initialize(login=…, password=…, server=…)` pelo RPyC a cada pedido (e `shutdown()` ao terminar). A conta chega no corpo de cada requisição HTTP interna (decifrada pelo motor ou pela API só na memória, nunca escrita em disco nem em log) e nada é guardado no container.

**Tamanho da imagem:** Wine + MT5 + as dependências de GUI somam várias centenas de MB a mais de 1 GB, bem mais pesado que as outras imagens do ZenTrade (Node). Por isso o serviço entra como **perfil opcional do compose** (`--profile mt5`), nunca no perfil `app` padrão: quem não usa o mini índice automático não baixa nem constrói essa imagem.

## Decisão

- Dois serviços no perfil `mt5` do `infra/docker-compose.yml`: `mt5-terminal` (a imagem Wine + MT5 + RPyC do projeto `gmag11/MetaTrader5-Docker-Image`, sem conta) e `coletor-mt5` (Python slim + `mt5linux`, `infra/coletor-mt5/`). **Nenhum publica porta no host**: só a rede interna do compose os alcança.
- O `coletor-mt5` é um processo Python mínimo (só biblioteca padrão + `mt5linux`) para falar com o RPyC e expõe uma API HTTP interna simples (`POST /coletar {simbolo, intervalo, de, ate}` → barras OHLCV em JSON), para o motor (Node) não precisar de um cliente RPyC.
- O motor (TypeScript) chama essa API HTTP e grava os candles em `candles` com `substituirCandlesB3`/`gravarCandlesB3` de `apps/motor/src/dados-b3` — a mesma gravação idempotente do importador de arquivos da B3, para não duplicar lógica.
- **Só leitura.** O conector nunca chama `order_send` nem qualquer função de envio de ordem; a API HTTP interna não tem rota alguma para isso (um teste automatizado, `coletor-mt5.guarda.test.ts`, falha se o coletor passar a usar qualquer função de ordem, posição ou histórico de negócios do MT5).
- Credenciais (servidor, login, senha da conta **demo**) cifradas com a mesma cifra de envelope das chaves da Binance (`ZENTRADE_CHAVE_MESTRA`), gravadas em `credenciais_mt5` (RLS por pessoa), nunca devolvidas pela API nem logadas — ver `packages/banco/src/repositorios/credenciais-mt5.ts`.
- Sem conta real disponível para testar neste momento: o motor fala com uma porta `FonteBarrasMt5` (`apps/motor/src/dados-b3/fonte-mt5.ts`), com uma implementação HTTP real e uma falsa para os testes. A imagem do coletor é construível e documentada, mas nenhum teste automatizado exige login de verdade.

## Consequências

- Quem não quer o mini índice automático não paga o custo da imagem pesada (perfil opcional).
- A imagem do terminal é de terceiros e **não foi puxada nem testada contra uma conta real nesta entrega**: o nome/tag padrão (`gmag11/metatrader5_vnc:latest`, variável `MT5_TERMINAL_IMAGEM`) e a versão do `mt5linux` precisam ser conferidos na primeira subida. Se o projeto parar de ser mantido, a imagem pode ser gerada a partir do repositório (MIT).
- O RPyC (porta 8001) nunca é exposto fora da rede do compose: comprometer a rede interna do Docker seria necessário para chegar nele. Ainda assim, por ser um protocolo de execução remota de código, o `coletor-mt5` não deve rodar em rede compartilhada com serviços não confiáveis.
- Dados do MT5 vêm no fuso do **servidor da corretora**, não em UTC nem necessariamente em Brasília: a conversão (`apps/motor/src/dados-b3/fuso-mt5.ts`) usa o fuso configurado (nome IANA acompanha o horário de verão do servidor) ou detecta o deslocamento **dia a dia** pela abertura de 09:00 de Brasília (arredondada para meia hora), e é testada com vários deslocamentos e com a troca de horário de verão no meio do período.

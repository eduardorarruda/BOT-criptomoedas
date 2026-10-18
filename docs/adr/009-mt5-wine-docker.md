# ADR 009 — Conector MT5 automático: Wine + mt5linux, perfil opcional

**Situação:** aceita · 2026-10

## Contexto

A pessoa pediu que o ZenTrade busque os dados do WIN automaticamente, com um botão, em vez de exportar o CSV à mão no MetaTrader 5 ([docs/dados-b3.md](../dados-b3.md#importar-o-win-de-um-csv-metatrader-5-ou-generico)). A biblioteca oficial `MetaTrader5` (PyPI) só fala com o terminal MT5, que só existe para **Windows**. O resto do ZenTrade roda em containers Linux (`infra/docker-compose.yml`); não há (e não deve haver) uma VM Windows na stack só para isto.

A B3 proíbe coleta automatizada das próprias páginas (ver aviso no topo de `docs/dados-b3.md`); isso não se aplica aqui: o MT5 é o terminal da **corretora**, lendo dados que ela já distribui para a conta, não uma página da B3.

## Alternativas avaliadas

| Opção | Como funciona | Problema |
| --- | --- | --- |
| VM Windows dedicada | MT5 nativo + script Python local | Pesada, fora do `docker compose`, mais uma coisa para o usuário manter rodando |
| Wine + MT5 + API Python, do zero | Construir a imagem na mão | Reinventa um problema já resolvido; frágil (o setup do Wine para o MT5 tem detalhes finos: fontes, `.NET`, DPI) |
| **Wine + MT5 + `mt5linux`/RPyC, projeto existente** | Container com Wine roda o terminal MT5 (headless, por VNC se precisar depurar) e expõe a API Python por RPyC (porta interna 8001); o `mt5linux` do lado "Linux" chama essa API como se fosse o pacote oficial | É o caminho adotado |

Pesquisa (outubro de 2026): o projeto [`gmag11/MetaTrader5-Docker-Image`](https://github.com/gmag11/MetaTrader5-Docker-Image) (também publicado como `gmag11/MetaTrader5-Docker`) empacota Wine + MT5 + um servidor RPyC na porta 8001, com VNC web para depuração visual quando necessário; licença **MIT**. O pacote [`mt5linux`](https://github.com/lucas-campagna/mt5linux) do lado de quem chama (aqui, dentro do próprio container, por um pequeno serviço Python) fala com esse RPyC e replica a assinatura de `MetaTrader5` (`initialize`, `login`, `symbol_select`, `copy_rates_range`, `symbols_get`…), então o código de coleta é o mesmo da documentação oficial do PyPI.

**Login sem GUI:** o terminal aceita `/login:<conta>` na linha de comando, e o fork [`marlonsc/mt5-docker`](https://github.com/marlonsc/mt5-docker) do mesmo projeto acrescenta login automático por variáveis de ambiente (`MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER`), sem precisar abrir a tela do terminal nem automatizar clique. É esse o caminho: o `coletor-mt5` recebe servidor, login e senha (já decifrados pelo motor, nunca gravados no container) como variáveis de ambiente do processo, geradas a cada subida do perfil.

**Tamanho da imagem:** Wine + MT5 + as dependências de GUI somam várias centenas de MB a mais de 1 GB, bem mais pesado que as outras imagens do ZenTrade (Node). Por isso o serviço entra como **perfil opcional do compose** (`--profile mt5`), nunca no perfil `app` padrão: quem não usa o mini índice automático não baixa nem constrói essa imagem.

## Decisão

- Serviço novo `coletor-mt5`, perfil `mt5` do `infra/docker-compose.yml`, construído a partir de uma imagem Wine + MT5 + RPyC do tipo `gmag11/MetaTrader5-Docker-Image` (ou o fork com login por variável de ambiente). **Sem porta publicada no host**: só a rede interna do compose alcança o serviço.
- Dentro do container (ou num container vizinho da mesma rede), um processo Python mínimo usa `mt5linux` para falar com o RPyC e expõe uma API HTTP interna simples (`POST /coletar {simbolo, intervalo, de, ate}` → barras OHLCV em JSON), para o motor (Node) não precisar de um cliente RPyC.
- O motor (TypeScript) chama essa API HTTP e grava os candles em `candles` com `substituirCandlesB3`/`gravarCandlesB3` de `apps/motor/src/dados-b3` — a mesma gravação idempotente do importador de arquivos da B3, para não duplicar lógica.
- **Só leitura.** O conector nunca chama `order_send` nem qualquer função de envio de ordem; a API HTTP interna não tem rota alguma para isso (ver [`docs/seguranca.md`](../seguranca.md) e o princípio de "a IA propõe, o risco decide" não se aplica aqui porque não há decisão alguma — é um importador de dados).
- Credenciais (servidor, login, senha da conta **demo**) cifradas com a mesma cifra de envelope das chaves da Binance (`ZENTRADE_CHAVE_MESTRA`), gravadas em `credenciais_mt5` (RLS por pessoa), nunca devolvidas pela API nem logadas — ver `packages/banco/src/repositorios/credenciais-mt5.ts`.
- Sem conta real disponível para testar neste momento: o motor fala com uma porta `FonteBarrasMt5` (`apps/motor/src/dados-b3/fonte-mt5.ts`), com uma implementação HTTP real e uma falsa para os testes. A imagem do coletor é construível e documentada, mas nenhum teste automatizado exige login de verdade.

## Consequências

- Quem não quer o mini índice automático não paga o custo da imagem pesada (perfil opcional).
- Login sem GUI depende de um fork de terceiro (`marlonsc/mt5-docker`) além do projeto principal; se esse fork parar de ser mantido, a alternativa é gerar a imagem própria a partir do `gmag11/MetaTrader5-Docker-Image` original e aplicar o mesmo patch de variáveis de ambiente (são poucas linhas no entrypoint).
- O RPyC (porta 8001) nunca é exposto fora da rede do compose: comprometer a rede interna do Docker seria necessário para chegar nele. Ainda assim, por ser um protocolo de execução remota de código, o `coletor-mt5` não deve rodar em rede compartilhada com serviços não confiáveis.
- Dados do MT5 vêm no fuso do **servidor da corretora**, não em UTC nem necessariamente em Brasília: a conversão (`apps/motor/src/dados-b3/fuso-mt5.ts`) detecta o deslocamento comparando com o horário conhecido do pregão (09:00 Brasília) e é testada com vários deslocamentos, incluindo mudança de horário de verão de outros países.

# Dados da B3: candles do mini índice (WIN) e do Ibovespa (WIN-IBOV)

Esta página cobre a parte de **dados** da fase 1 de [Mini índice e Jev](mini-indice-e-jev.md#fases-e-critérios-de-avanço): de onde vêm os candles intradiários para testar estratégias no mini índice, como importá-los e o que a aproximação pelo Ibovespa não é. O modelo do contrato no backtest (ponto, tick, custos da B3, zeragem) é outra parte.

> **Aviso.** Pesquisa feita em outubro de 2026. Não é parecer jurídico: os termos de uso citados mudam, e quem roda o ZenTrade é quem aceita os termos de cada fonte. Fontes marcadas com **(só busca)** apareceram só no resumo de um buscador e precisam ser conferidas.

## Resumo

- **Não achamos fonte gratuita que permita, com clareza, baixar por programa candles intradiários do Ibovespa.** A brapi.dev permite e já é usada no projeto, mas candles intradiários só saem no plano **Pro** (pago). O Yahoo Finance proíbe coleta automatizada nos termos de uso. A B3 só publica de graça a série **diária** (COTAHIST) e proíbe coleta automatizada nas páginas de consulta.
- **O que foi implementado:** a fonte **brapi** (o Ibovespa, `^BVSP`, gravado como `WIN-IBOV`), atrás de uma porta que aceita outras fontes; a **importação de CSV**, pensada para a exportação de barras do **MetaTrader 5**; e a **importação dos arquivos oficiais "Negócio a negócio" da B3** (`importar-negocios-b3`), baixados à mão no BDI, que dão o **próprio WIN** negócio a negócio, de graça, para os últimos 20 pregões. Arquivo da B3 e MT5 dão o WIN de verdade, melhor do que qualquer aproximação; são o caminho recomendado para a fase 1.
- **Quanto histórico de 5 minutos:** a FAQ da brapi fala em intradiário "de até 7 dias"; num teste nosso (outubro de 2026, com um ticker de teste que a brapi libera sem token), `interval=5m` com `range=3mo` devolveu **41 pregões, cerca de 60 dias corridos**. Não deu para conferir com o `^BVSP`, que exige token. Como a brapi só guarda essa janela, rode a importação de tempos em tempos: o que já está no banco fica (até a retenção de 3 anos, abaixo).

## O contrato com o backtest

| Item        | Valor                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Tabela      | `candles` (`packages/banco/src/esquema/mercado.ts`), a mesma dos candles da Binance                                  |
| `simbolo`   | `WIN-IBOV` para o Ibovespa (aproximação); `WIN` para o mini índice de verdade (arquivo da B3 ou CSV)                 |
| `intervalo` | `5m`, `15m` e `1h`. Importando 5m, o 15m e o 1h são montados a partir dele                                           |
| Horários    | `abertura` e `fechamento` em UTC (ms na API), como os candles da Binance; `fechamento = abertura + intervalo − 1 ms` |
| Preços      | pontos do índice, em decimal (texto), sem ponto flutuante                                                            |
| Sessão      | só o pregão regular de derivativos: abertura de **09:00 até antes de 18:25** de Brasília, de segunda a sexta         |
| Buracos     | **nenhum candle é inventado**: hora sem negócio, feriado e falha da fonte ficam sem candle                           |
| Leitura     | o backtest lê `WIN` e `WIN-IBOV` **só do banco**; nunca chama a Binance para eles                                    |

O Ibovespa à vista negocia de cerca de 10:00 a 17:00 (mais o call de fechamento), então o `WIN-IBOV` cobre menos horas do que o `WIN`: o filtro guarda só o que a fonte manda dentro da janela de 09:00 a 18:25.

## Fontes avaliadas

| Fonte                                                                                                                                        | Intradiário                     | Custo                                                | Uso num projeto aberto                                                                                                                                                      | Decisão                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [brapi.dev](https://brapi.dev/docs/acoes) (`^BVSP`)                                                                                          | 1m a 90m, só no plano Pro       | Pro: R$ 116,66/mês no anual (R$ 166,66 no mensal)    | Os [termos](https://brapi.dev/terms-of-use) dão licença limitada ao plano e proíbem revender ou redistribuir os dados; guardar e montar séries para uso próprio é permitido | **Implementada** (`--fonte brapi`)              |
| Yahoo Finance (API de gráfico, não oficial)                                                                                                  | sim                             | grátis                                               | Os [termos do Yahoo](https://legal.yahoo.com/xw/en/yahoo/terms/otos/index.html), item 2(b)(ix), proíbem coletar dados "por qualquer meio automatizado" sem permissão prévia | **Não implementada**                            |
| [B3, COTAHIST](https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/mercado-a-vista/series-historicas/) | não: só diário                  | grátis                                               | arquivo público para download                                                                                                                                               | Não serve para intradiário                      |
| [B3, consulta de cotações e negócios](https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/cotacoes/)             | negócios do pregão, pela página | grátis para consulta                                 | A página diz que os dados são da B3, só para consulta, e que é "expressamente vedada a coleta automatizada"                                                                 | **Não implementada** (coleta automatizada)      |
| B3, BDI: arquivo "Negócio a negócio" de derivativos, baixado **à mão**                                                                       | sim: todos os negócios do dia   | grátis                                               | a pessoa baixa o arquivo no site; o ZenTrade só lê o arquivo que ela já tem, sem acessar a B3                                                                               | **Implementada** (`importar-negocios-b3`)       |
| B3, market data licenciado (UP2DATA e distribuidores)                                                                                        | sim                             | pago, contrato B2B                                   | licença própria                                                                                                                                                             | Fora do alcance de uma pessoa física            |
| [Twelve Data](https://twelvedata.com/pricing)                                                                                                | sim                             | o plano grátis (Basic) cobre 3 bolsas                | plano grátis só para uso interno                                                                                                                                            | a B3 não aparece entre os dados do plano grátis |
| **MetaTrader 5 da corretora** (exportar barras em CSV)                                                                                       | sim, do **próprio WIN**         | grátis para clientes em várias corretoras (só busca) | dados para uso próprio de quem tem a conta; o arquivo não vai para o repositório                                                                                            | **Implementada** (`importar-candles-csv`)       |

Sobre o MetaTrader 5: XP, Rico e Clear oferecem o MT5 sem custo a clientes, e a Clear tem conta demo (só busca; [Clear, MetaTrader](https://corretora.clear.com.br/plataformas/metatrader/)). O histórico que cada servidor guarda varia; peça "barras ilimitadas" nas opções do gráfico antes de exportar ([NeoTraderBot](https://neotraderbot.com/2023/01/26/extraindo-dados-historicos-da-metatrader/)).

### Limites da brapi

Pela [página de planos](https://brapi.dev/pricing) e pela [FAQ de intervalos](https://brapi.dev/faq/quais-sao-os-timeframes-disponiveis), em outubro de 2026:

| Plano    | Intervalos                                                   | Histórico         | Atualização   | Pedidos         | Ativos por pedido |
| -------- | ------------------------------------------------------------ | ----------------- | ------------- | --------------- | ----------------- |
| Gratuito | só `1d`                                                      | até 3 meses       | a cada 30 min | 15 mil por mês  | 1                 |
| Startup  | só `1d`                                                      | até 1 ano         | a cada 15 min | 150 mil por mês | 10                |
| Pro      | `1m`, `2m`, `5m`, `15m`, `30m`, `60m`, `90m`, `1d` e maiores | 10+ anos (diário) | a cada 5 min  | 500 mil por mês | 20                |

- **Intradiário e período:** a brapi só aceita faixas relativas a hoje (`range=1d`, `5d`, `1mo`, `3mo`…), sem data de início. O comando pede a menor faixa que cobre o `--desde` e recorta. A FAQ fala em "até 7 dias" para intradiário; no nosso teste, 5m veio com cerca de 60 dias. Se a fonte começar depois do pedido, o comando avisa.
- **Taxa:** as respostas anônimas vieram com `ratelimit-limit: 20` por janela de 60 s e `x-brapi-concurrency-limit: 1`. O comando faz um pedido por execução, espera o `Retry-After` no 429 (até 60 s) e tenta de novo até 4 vezes, com recuo exponencial em falha de rede e erro 5xx.
- **Atraso:** irrelevante para backtest.
- **Origem:** a brapi diz que [não é distribuidora licenciada da B3](https://brapi.dev/faq/a-brapi-e-distribuidora-licenciada-da-b3) e que usa dados públicos. Isso é com ela; para nós vale a licença dos termos dela.
- **Segredo:** o token vai só no cabeçalho `Authorization`, nunca na URL nem nas mensagens (o texto de erro da brapi é repassado com o token trocado por `[oculto]`).

## Importar o Ibovespa (`WIN-IBOV`) pela brapi

Precisa de `BRAPI_TOKEN` (o mesmo das cotações de FIIs; para intradiário, de um plano Pro) e de `DATABASE_URL`.

```bash
corepack pnpm --filter "@zentrade/motor..." build
corepack pnpm --filter @zentrade/motor importar-candles-b3 -- --fonte brapi --intervalo 5m --desde 2026-09-01
# no Docker (o motor recebe BRAPI_TOKEN do .env):
docker compose --env-file .env -f infra/docker-compose.yml --profile app run --rm motor \
  node dist/comandos/importar-candles-b3.js --fonte brapi --intervalo 5m --desde 2026-09-01
```

| Opção         | Padrão  | O que faz                                                                  |
| ------------- | ------- | -------------------------------------------------------------------------- |
| `--fonte`     | `brapi` | de onde buscar (hoje só `brapi`)                                           |
| `--intervalo` | `5m`    | `5m`, `15m` ou `1h`; com `5m`, grava também 15m e 1h; com `15m`, também 1h |
| `--desde`     | (exige) | primeiro dia, `AAAA-MM-DD`, em Brasília                                    |
| `--ate`       | hoje    | último dia, inclusive                                                      |

A saída diz quantos candles vieram, quantos foram ignorados (sem preço ou com preço impossível), o primeiro e o último (em Brasília), quantos foram gravados em cada intervalo, quantos estavam fora do pregão e quantos ainda estavam em formação (o candle do minuto atual não entra). **Rodar de novo não duplica nada** (upsert pela chave símbolo, intervalo e abertura). Para juntar mais do que os ~60 dias que a brapi devolve, agende a importação (por exemplo, toda semana, com `--desde` de 10 dias atrás).

## Importar o WIN de um CSV (MetaTrader 5 ou genérico)

```bash
corepack pnpm --filter "@zentrade/motor..." build
corepack pnpm --filter @zentrade/motor importar-candles-csv -- \
  --simbolo WIN --intervalo 5m --arquivo ~/Downloads/WIN_M5.csv [--fuso America/Sao_Paulo]
# no Docker, monte o arquivo dentro do container:
docker compose --env-file .env -f infra/docker-compose.yml --profile app run --rm \
  -v "$PWD/WIN_M5.csv:/dados/WIN_M5.csv:ro" motor \
  node dist/comandos/importar-candles-csv.js --simbolo WIN --intervalo 5m --arquivo /dados/WIN_M5.csv
```

| Opção         | Padrão              | O que faz                                                                                                |
| ------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| `--simbolo`   | (exige)             | `WIN` (o contrato) ou `WIN-IBOV` (se o CSV for do índice)                                                |
| `--intervalo` | (exige)             | `5m`, `15m` ou `1h`: o intervalo **das linhas do arquivo**; os maiores são montados a partir dele        |
| `--arquivo`   | (exige)             | o CSV, até 256 MB; caminho relativo vale de onde você chamou o `pnpm`                                    |
| `--fuso`      | `America/Sao_Paulo` | o fuso do horário escrito no arquivo: nome IANA (`Europe/Athens`) ou deslocamento fixo (`+03:00`, `UTC`) |
| `--formato`   | `auto`              | `mt5`, `generico` ou `auto` (reconhece pelo cabeçalho)                                                   |

**Exportar do MetaTrader 5:** Exibir → Símbolos → aba **Barras** → escolha o símbolo do WIN (o contínuo, como `WIN$`, ou um vencimento, como `WINZ26`), o período (M5) e as datas → **Pedir** → **Exportar barras**. O arquivo sai separado por tabulação, com o cabeçalho `<DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE> <TICKVOL> <VOL> <SPREAD>` e data `AAAA.MM.DD`. O volume gravado é o `<VOL>` (contratos); sem essa coluna, o `<TICKVOL>`. Arquivo em UTF-16 ou UTF-8, com ou sem BOM, com fim de linha do Windows ou não: tanto faz.

**O fuso do servidor (`--fuso`).** O MT5 escreve a hora **do servidor da corretora**, que não é necessariamente a de Brasília. Confira no arquivo a hora da primeira barra de um pregão normal do WIN: se for 09:00, o servidor está em Brasília (o padrão serve); se for 15:00, ele está 6 h à frente, em UTC+3, e o certo é `--fuso +03:00`. Se o servidor segue o horário de verão de algum lugar, use o nome IANA daquele lugar (por exemplo, `Europe/Athens`), que acompanha as mudanças. Datas antes de 2019 com o padrão `America/Sao_Paulo` já levam em conta o horário de verão brasileiro daquela época.

**CSV genérico:** cabeçalho `data,hora,abertura,maxima,minima,fechamento,volume` (em qualquer ordem, com ou sem acento), data `AAAA-MM-DD` ou `DD/MM/AAAA`, hora `HH:MM` ou `HH:MM:SS`. Separado por vírgula, os números usam ponto (`128000.5`); separado por ponto e vírgula (planilha brasileira), vale `128.000,50`.

**Linhas estranhas não param a importação.** Linha vazia e cabeçalho repetido são pulados; linha com colunas a menos, data ou hora que não existe, número inválido, máxima abaixo da mínima (ou da abertura, ou do fechamento), preço zero ou negativo e horário fora da grade do intervalo (por exemplo, 09:03 num arquivo de 5m) são ignoradas, e a saída mostra as 20 primeiras com o número da linha e o motivo. Duas linhas com o mesmo horário: vale a última. O que fica fora do pregão (antes das 09:00, depois das 18:25, fim de semana) não é gravado e aparece na contagem.

## Importar o WIN dos arquivos de negócios da B3

A B3 publica no BDI, de graça, o arquivo com **todos os negócios do dia** de cada derivativo, inclusive o WIN, para os **últimos 20 dias úteis**. O ZenTrade monta as velas a partir dele.

**Onde baixar (à mão):** BDI → **Derivativos** → **Derivativos de bolsa** → tabela **"Negócio a negócio"** → **"Histórico dos últimos 20 dias úteis"** → um arquivo por pregão, `DD-MM-AAAA_NEGOCIOSAVISTA_DRV.zip` (~60 MB, com um `.txt` de ~560 MB dentro). **O sistema não baixa nada sozinho:** a B3 proíbe a coleta automatizada nas páginas de consulta, então quem baixa é a pessoa, e o comando só lê os arquivos que ela já tem. Como a B3 só guarda 20 pregões, baixe de tempos em tempos (por exemplo, toda semana) e importe: o que já está no banco fica (até a retenção de 3 anos).

```bash
corepack pnpm --filter "@zentrade/motor..." build
corepack pnpm --filter @zentrade/motor importar-negocios-b3 -- --arquivos ~/Downloads/*_NEGOCIOSAVISTA_DRV.zip
# com ajuste de rolagem (veja abaixo):
corepack pnpm --filter @zentrade/motor importar-negocios-b3 -- --arquivos ~/Downloads/*_NEGOCIOSAVISTA_DRV.zip --ajuste diferenca
```

| Opção        | Padrão   | O que faz                                                                                                                    |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--arquivos` | (exige)  | um ou mais `.zip` do BDI (ou o `.txt`/`.csv` de dentro); aceita padrão (`'pasta/*_DRV.zip'`), expandido pelo próprio comando |
| `--simbolo`  | `WIN`    | só `WIN`: o arquivo é do contrato, não do índice                                                                             |
| `--ajuste`   | `nenhum` | `nenhum` (cada dia com os preços do próprio contrato) ou `diferenca` (ajuste de rolagem para trás)                           |

**No Docker** (a stack do usuário, em `infra/`): monte a pasta dos arquivos só para leitura e rode o comando no container do motor. Depois de atualizar o código, reconstrua a imagem do motor (`... build motor`): a biblioteca de zip (`yauzl`) entra na imagem pelo `pnpm deploy --prod` do `motor.Dockerfile`. O padrão vai entre aspas para o próprio comando expandir dentro do container (o shell de fora não enxerga `/dados`):

```bash
cd infra
docker compose -p zentrade --env-file ~/.config/zentrade/local.env --profile app run --rm --no-deps \
  -v ~/Downloads:/dados:ro motor \
  node dist/comandos/importar-negocios-b3.js --arquivos '/dados/*_NEGOCIOSAVISTA_DRV.zip'
```

Para um arquivo só, dá para montar só ele (`-v ~/Downloads/16-10-2026_NEGOCIOSAVISTA_DRV.zip:/dados/16.zip:ro` e `--arquivos /dados/16.zip`) ou copiar para um container em execução com `docker cp`.

### O formato

Texto separado por `;`, com cabeçalho e vírgula decimal:

```
DataReferencia;CodigoInstrumento;AcaoAtualizacao;PrecoNegocio;QuantidadeNegociada;HoraFechamento;CodigoIdentificadorNegocio;TipoSessaoPregao;DataNegocio;CodigoParticipanteComprador;CodigoParticipanteVendedor;TipoDoCanal
2026-10-16;WINZ26;0;209500,000;4300;090055940;10;1;2026-10-16;88;88;1
```

O significado dos campos está no [glossário "Negócios Listados" da B3](https://www.b3.com.br/data/files/8A/C0/D8/94/54066810DE2C7168AC094EA8/Glossario_NegociosListados.pdf); o que o importador faz com cada um:

| Campo                        | Como é lido                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CodigoInstrumento`          | só contrato futuro do mini índice, `^WIN[FGHJKMNQUVXZ]\d\d$` (WINV26, WINZ26, WING27…). DI, dólar, opções de WIN (`WINX26C…`) e o resto do arquivo são pulados sem ler a linha inteira                                                            |
| `PrecoNegocio`               | pontos, com vírgula decimal (`209500,000`); lido como inteiro de milésimos, sem ponto flutuante                                                                                                                                                   |
| `QuantidadeNegociada`        | **contratos**: é o volume da vela (veja abaixo)                                                                                                                                                                                                   |
| `HoraFechamento`             | `HHMMSSmmm`, horário de Brasília (o glossário diz UTC−3, que é Brasília desde o fim do horário de verão em 2019); junto com `DataNegocio`, vira o instante em UTC                                                                                 |
| `AcaoAtualizacao`            | `0` = negócio novo; `2` = **cancelado**: a linha repete o número (`CodigoIdentificadorNegocio`), o preço e a quantidade do negócio que cai, com a hora do cancelamento. O negócio cancelado sai da vela; outro valor vai para as linhas ignoradas |
| `TipoSessaoPregao`           | só `1` (sessão regular); `6` (after hours) é contado e ignorado                                                                                                                                                                                   |
| `CodigoIdentificadorNegocio` | desempata a ordem de negócios no mesmo milissegundo (o arquivo não vem em ordem de horário)                                                                                                                                                       |

**A quantidade é em contratos, não multiplicada.** Os primeiros negócios do dia (4300, 300…) são o leilão de abertura, com lotes grandes. Conferido no arquivo de 16/10/2026: no WINZ26, o menor valor é 1 e só 775 dos 6.746.605 negócios têm quantidade múltipla de 100; a soma dá 18.979.794 contratos (2,8 contratos por negócio em média). O glossário descreve o campo como "quantidade de negócios", mas os números só fecham como contratos.

**Cancelamentos:** como o cancelamento pode vir depois do negócio no arquivo, o importador lê o arquivo de novo, só quando houver cancelamento de WIN, deixando os negócios cancelados de fora. Nos quatro dias conferidos (13 a 16/10/2026) não houve nenhum no WIN (houve em DI, opções de dólar e outros), nem negócio de WIN fora da sessão 1.

### Velas, pregão e o leilão de fechamento

- Velas de **5 minutos** montadas direto dos negócios (abertura = primeiro negócio pelo horário, máxima, mínima, fechamento = último, volume = soma dos contratos); 15m e 1h saem do 5m pelo mesmo agregador dos outros importadores. **Intervalo sem negócio fica sem vela.** Exemplo real: em 15/10/2026 o leilão de abertura do WINZ26 só terminou às 09:05:07, então o dia começa na vela das 09:05.
- Vale a janela de pregão do módulo (09:00 até antes de 18:25, a mesma dos outros importadores). O **leilão de fechamento** (os negócios das ~18:31) fica de fora: a última vela é a das 18:20 e fecha no último negócio antes das 18:25. O preço do leilão é o "fechamento" que o BDI mostra; a saída do comando mostra os dois. Em 16/10/2026: última vela fecha em 210.300; leilão em 210.800.
- O arquivo é lido em stream direto do `.zip` (sem descompactar em disco; ~200 MB de memória), e os negócios viram barras na hora: nada das 7 a 9 milhões de linhas por dia fica guardado. Nos testes, cerca de 1,5 minuto por arquivo numa máquina de 4 núcleos ocupada com outras tarefas.

### Rolagem: qual contrato vira o `WIN`

Cada pregão usa **um contrato só, o de maior quantidade negociada no dia** (o "cheio"). Como o backtest do WIN zera no fim do pregão, ele nunca atravessa a troca de contrato posicionado. A saída diz o contrato de cada dia e os outros que negociaram.

Exemplo real: em 13/10/2026 o cheio foi o WINV26 (20.074.263 contratos, contra 645.867 do WINZ26); o WINV26 venceu em 14/10, quando o WINZ26 já tinha 20.030.942 contra 2.394.859. A rolagem aparece assim:

```
rolagem em 2026-10-14: WINV26 → WINZ26, diferença de +4.445 pontos (fechamentos de 2026-10-13)
```

A diferença é o fechamento do contrato novo menos o do antigo, no mesmo pregão (o anterior à rolagem; se o novo não negociou nele, o próprio dia da rolagem). Ela existe porque os vencimentos negociam com base diferente (juros até o vencimento).

- **`--ajuste nenhum` (padrão):** cada dia guarda os preços negociados de verdade. Dentro do dia, nada muda. **Entre dias**, a série salta na rolagem: indicador que olha para trás além do pregão (EMA longa, Donchian, máxima ou mínima de N dias, ATR com aquecimento no dia anterior) vê um "gap" que nenhum operador viveu.
- **`--ajuste diferenca`:** os dias **antes** de cada rolagem andam a diferença (ajuste para trás, "back-adjusted"): o contrato atual fica com os preços de verdade e a série não salta. O custo: os preços antigos deixam de ser os negociados (alvo e stop em pontos não mudam; níveis absolutos e porcentagens, sim). O ajuste vale **dentro dos arquivos de uma mesma importação**: para uma série ajustada inteira, importe todos os pregões juntos (os dias que já estavam no banco e não foram reimportados ficam como estavam). Rolagem sem os dois contratos num mesmo pregão dos arquivos fica com diferença desconhecida e não é ajustada (a saída avisa).

### Gravação

- **Reimportar um pregão substitui as velas daquele dia** (5m, 15m e 1h do `WIN`, de 00:00 a 24:00 de Brasília): nada duplica, e vela que não existe mais na fonte some. Pregões que não estão nos arquivos não são tocados. Funciona com trecho já comprimido pelo TimescaleDB (testado). A troca de cada pregão é **uma transação só** (apaga e grava juntos): se algo falhar no meio, o pregão fica como estava.
- Vários arquivos de uma vez são gravados em ordem de data, qualquer que seja a ordem passada. O mesmo pregão em dois arquivos é recusado antes de gravar qualquer coisa.
- Linha estranha (preço, hora ou quantidade inválidos, colunas a menos) não para a leitura: a saída mostra as 20 primeiras com o número da linha e o motivo.
- Conferências do caminho: o arquivo precisa existir e ser `.zip`, `.txt` ou `.csv`; o `.zip` precisa ter um único `.txt`/`.csv` dentro, deflate ou sem compressão, com até 4 GB descompactado, e o tamanho que sai precisa bater com o declarado no zip. Nenhum comando de shell é chamado com o caminho.

### Conferido com os arquivos de 13 a 16/10/2026

| Pregão | Contrato | Negócios usados (pregão) | Velas 5m · 15m · 1h | Primeira → última vela | Mínima – máxima | Última vela fecha | Leilão de fechamento |
| ------ | -------- | ------------------------ | ------------------- | ---------------------- | --------------- | ----------------- | -------------------- |
| 13/10  | WINV26   | 7.109.503                | 113 · 38 · 10       | 09:00 → 18:20          | 206.075–208.515 | 206.350           | 206.230              |
| 14/10  | WINZ26   | 6.946.407                | 113 · 38 · 10       | 09:00 → 18:20          | 207.615–211.750 | 208.645           | 208.995              |
| 15/10  | WINZ26   | 7.037.767                | 112 · 38 · 10       | 09:05 → 18:20          | 207.235–210.800 | 208.435           | 208.495              |
| 16/10  | WINZ26   | 6.743.898                | 113 · 38 · 10       | 09:00 → 18:20          | 208.075–210.535 | 210.300           | 210.800              |

Os números de 16/10 foram conferidos de forma independente (contagem direta no arquivo): 6.743.898 negócios do WINZ26 antes das 18:25, mínima 208.075, máxima 210.535, último 210.300.

## Como os dados ficam no banco

- **Upsert idempotente** na tabela `candles`, em lotes de 1000. Corrigir um candle (importando de novo) atualiza o candle e os agregados dele. O importador de negócios da B3 vai além: apaga o pregão inteiro antes de gravar (veja acima).
- **15m e 1h saem do que está no banco** no intervalo importado, não só do lote recebido: uma importação parcial (a fonte começou no meio de uma hora) não estraga uma hora que já estava completa. Grupo que ainda não fechou não é gravado.
- **Retenção e compressão:** a tabela apaga candles com **mais de 3 anos** e comprime os de mais de 30 dias (migração `0002`). O upsert funciona em trecho comprimido (testado), mas **histórico de mais de 3 anos some** na limpeza seguinte; o comando avisa quando o pedido passa disso.
- Os agregados contínuos `candles_5m` e `candles_1h` são montados só a partir de candles de 1m (os da Binance): os da B3 não entram neles.
- **No backtest**, `candlesHistoricos` lê `WIN` e `WIN-IBOV` só do banco. O aquecimento (200 candles) é contado em pregões, não em horas corridas: a leitura vai bem mais para trás e o backtest usa os últimos 200 antes do início. Sem candles no período, o backtest falha dizendo qual comando rodar. A precisão de 1 minuto, opcional, fica vazia (não há 1m da B3 no contrato).

Para testes e demonstração há uma semente determinística em `apps/motor/src/teste/win-ibov.ts`: 3 pregões (1º a 3 de julho de 2026) de `WIN-IBOV` em 5m, inventados. Nenhum dado baixado entra no repositório.

## O que o `WIN-IBOV` não é

O Ibovespa serve para começar, mas o resultado de um backtest nele **não é** o resultado da mesma estratégia no WIN:

- **Horário:** o índice à vista vai de cerca de 10:00 a 17:00; o WIN, de 09:00 a 18:25. Falta a primeira hora do WIN, que costuma ser a mais agitada, e o fim da tarde. Estratégia de abertura não dá para testar no proxy.
- **Nível:** o futuro negocia com diferença (base) em relação ao índice, por causa de juros e dividendos até o vencimento; a diferença muda ao longo do contrato. Alvo e stop em pontos absolutos se comportam parecido, mas não igual.
- **Vencimento e rolagem:** o índice não vence; o WIN vence a cada dois meses e tem salto na rolagem.
- **Volume:** o índice não tem volume de contratos; o volume que vem da fonte (às vezes 0) não diz nada sobre a liquidez do WIN. Indicador de volume não vale no proxy.
- **Tick:** o WIN anda de 5 em 5 pontos; o índice tem casas decimais. Custos e slippage em ticks são aplicados pelo modelo do contrato no backtest.
- **Buracos da fonte:** em dados de terceiros há pregões que começam alguns candles depois da abertura; nada é preenchido.

Por isso o caminho recomendado para a fase 1 é o **WIN de verdade**: os arquivos "Negócio a negócio" da B3 (grátis, oficiais, os últimos 20 pregões, juntando de tempos em tempos) e, para histórico mais longo, o MetaTrader 5 importado por CSV.

## Acrescentar outra fonte

Uma fonte implementa a porta `FonteCandlesB3` (`apps/motor/src/dados-b3/fonte.ts`: `buscar({ intervalo, desde, ate })` devolve candles válidos) e é registrada em `apps/motor/src/comandos/importar-candles-b3.ts`. Filtro de pregão, candle em formação, agregação e gravação já vêm prontos (`gravarCandlesB3`). Antes, confira se os termos da fonte permitem uso automatizado e guardar os dados.

## Pendências

- **1 minuto:** o contrato com o backtest tem 5m, 15m e 1h. A fase 1 pede série de 1 minuto; o MT5 exporta M1, mas importar `1m` é uma extensão a combinar com o backtest.
- **Histórico além de 20 pregões pelos arquivos da B3:** só juntando com o tempo; o BDI não guarda mais que isso.
- **Leilão de fechamento:** fica fora da janela de 09:00 a 18:25 do contrato com o backtest; se a estratégia precisar do preço de ajuste do dia, isso é uma extensão a combinar.
- **Criar backtest pela API:** a validação atual do símbolo (`/^[A-Z0-9]{5,20}$/`, em `packages/contratos/src/backtest.ts` e `dados.ts`) recusa `WIN` e `WIN-IBOV`; isso fica com a parte do backtest do WIN.
- **Profundidade do `^BVSP` no plano Pro:** não conferida (exige token).

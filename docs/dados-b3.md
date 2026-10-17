# Dados da B3: candles do mini índice (WIN) e do Ibovespa (WIN-IBOV)

Esta página cobre a parte de **dados** da fase 1 de [Mini índice e Jev](mini-indice-e-jev.md#fases-e-critérios-de-avanço): de onde vêm os candles intradiários para testar estratégias no mini índice, como importá-los e o que a aproximação pelo Ibovespa não é. O modelo do contrato no backtest (ponto, tick, custos da B3, zeragem) é outra parte.

> **Aviso.** Pesquisa feita em outubro de 2026. Não é parecer jurídico: os termos de uso citados mudam, e quem roda o ZenTrade é quem aceita os termos de cada fonte. Fontes marcadas com **(só busca)** apareceram só no resumo de um buscador e precisam ser conferidas.

## Resumo

- **Não achamos fonte gratuita que permita, com clareza, baixar por programa candles intradiários do Ibovespa.** A brapi.dev permite e já é usada no projeto, mas candles intradiários só saem no plano **Pro** (pago). O Yahoo Finance proíbe coleta automatizada nos termos de uso. A B3 só publica de graça a série **diária** (COTAHIST) e proíbe coleta automatizada nas páginas de consulta.
- **O que foi implementado:** a fonte **brapi** (o Ibovespa, `^BVSP`, gravado como `WIN-IBOV`), atrás de uma porta que aceita outras fontes, e a **importação de CSV**, pensada para a exportação de barras do **MetaTrader 5**. Pelo MT5 da corretora dá para ter o histórico do **próprio WIN**, que é melhor do que qualquer aproximação; esse é o caminho recomendado para a fase 1.
- **Quanto histórico de 5 minutos:** a FAQ da brapi fala em intradiário "de até 7 dias"; num teste nosso (outubro de 2026, com um ticker de teste que a brapi libera sem token), `interval=5m` com `range=3mo` devolveu **41 pregões, cerca de 60 dias corridos**. Não deu para conferir com o `^BVSP`, que exige token. Como a brapi só guarda essa janela, rode a importação de tempos em tempos: o que já está no banco fica (até a retenção de 3 anos, abaixo).

## O contrato com o backtest

| Item        | Valor                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Tabela      | `candles` (`packages/banco/src/esquema/mercado.ts`), a mesma dos candles da Binance                                  |
| `simbolo`   | `WIN-IBOV` para o Ibovespa (aproximação); `WIN` para o mini índice de verdade, importado de CSV                      |
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
| [B3, consulta de cotações e negócios](https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/cotacoes/)             | negócios do pregão, pela página | grátis para consulta                                 | A página diz que os dados são da B3, só para consulta, e que é "expressamente vedada a coleta automatizada"                                                                 | **Não implementada**                            |
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

## Como os dados ficam no banco

- **Upsert idempotente** na tabela `candles`, em lotes de 1000. Corrigir um candle (importando de novo) atualiza o candle e os agregados dele.
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

Por isso o caminho recomendado para a fase 1 é o **WIN do MetaTrader 5**, importado por CSV.

## Acrescentar outra fonte

Uma fonte implementa a porta `FonteCandlesB3` (`apps/motor/src/dados-b3/fonte.ts`: `buscar({ intervalo, desde, ate })` devolve candles válidos) e é registrada em `apps/motor/src/comandos/importar-candles-b3.ts`. Filtro de pregão, candle em formação, agregação e gravação já vêm prontos (`gravarCandlesB3`). Antes, confira se os termos da fonte permitem uso automatizado e guardar os dados.

## Pendências

- **1 minuto:** o contrato com o backtest tem 5m, 15m e 1h. A fase 1 pede série de 1 minuto; o MT5 exporta M1, mas importar `1m` é uma extensão a combinar com o backtest.
- **Criar backtest pela API:** a validação atual do símbolo (`/^[A-Z0-9]{5,20}$/`, em `packages/contratos/src/backtest.ts` e `dados.ts`) recusa `WIN` e `WIN-IBOV`; isso fica com a parte do backtest do WIN.
- **Profundidade do `^BVSP` no plano Pro:** não conferida (exige token).

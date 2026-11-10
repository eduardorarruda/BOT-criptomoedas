// Pregão de papel do mini índice (WIN): roda as estratégias de estrategias.json, em 15m e 1h, sobre as
// velas reais do dia (vindas do MT5 da corretora e gravadas no banco), com o MESMO motor do
// backtest do WIN (custos da B3, deslizamento, zeragem, risco em reais). Duas versões de cada:
//   • sem Claude: a regra pura;
//   • com Claude: cada entrada que a regra pediu vai ao agente (com as velas só até o sinal) e
//     só conta se ele aprovar. As saídas seguem a regra. Cada sinal é perguntado UMA vez
//     (cache em saida/claude-cache-v2.json). Junto vai a "máquina do tempo"
//     (maquina-do-tempo.mjs): o placar da mesma regra nos 2 anos anteriores (total, mesma
//     faixa de horário, mesmo lado) e a simulação do resto da sessão; com amostra
//     suficiente, o agente decide por ela.
// Nada envia ordem: é simulação com dinheiro de mentira.
//
// Roda dentro de um container do motor (precisa do dist e do DATABASE_URL), pelo rodar.sh:
//   docker compose ... run --rm --no-deps -v "<esta pasta>:/app/pesquisa-win" \
//     motor node /app/pesquisa-win/pregao.mjs [--dia AAAA-MM-DD] [--sem-claude] [--max-claude N]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ConfiguracaoBacktestEsquema, configuracaoWin } from "@zentrade/contratos";
import { contextoDeCandles, decidirComSentido, dec, POSICAO_ZERADA } from "@zentrade/dominio";
import { candlesHistoricos } from "/app/dist/backtest/candles-historicos.js";
import { limitesDoWin } from "/app/dist/backtest/win/limites-win.js";
import { modeloWinDe } from "/app/dist/backtest/win/modelo.js";
import { HISTORICO_WIN, rodarBacktestWin } from "/app/dist/backtest/win/rodar.js";
import { abrirBancoDosComandos } from "/app/dist/comandos/banco.js";
import { operacaoDoPedido, velasDoPedido } from "/app/dist/nucleo/contexto-operacao.js";
import { AgenteHttp } from "/app/dist/portas/agente-http.js";
import { historicoDoSinal, sessoesParaBlocos, simularResto, VALOR_PONTO } from "./maquina-do-tempo.mjs";

const PASTA = "/app/pesquisa-win";
const SAIDA = `${PASTA}/saida`;
const INTERVALOS = ["15m", "1h"];
const SALDO = "10000";
const RISCO = "300";
const TIMEOUT_AGENTE_MS = 150_000;
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
/** Quanto do passado a máquina do tempo mede (a mesma regra) e de onde ela sorteia (velas de 5 min). */
const HISTORICO_DIAS = 730;
const SORTEIO_DIAS = 100;
const ZERAGEM = "18:15:00";
/** Sinal mais velho que isso é recuperação de atraso: vai em modo replay (sem dados do futuro). */
const SINAL_RECENTE_MS = 15 * 60_000;
const TICK_PONTOS = 5;

function argumentos(lista) {
  const a = { dia: null, claude: true, maxClaude: 80 };
  for (let i = 0; i < lista.length; i++) {
    if (lista[i] === "--dia") a.dia = lista[++i];
    else if (lista[i] === "--sem-claude") a.claude = false;
    else if (lista[i] === "--max-claude") a.maxClaude = Number(lista[++i]);
  }
  return a;
}

/** Brasília é UTC−3 (sem horário de verão desde 2019). */
const hojeB3 = () => new Date(Date.now() - 3 * HORA_MS).toISOString().slice(0, 10);
const msBrasilia = (dia, hora) => Date.parse(`${dia}T${hora}-03:00`);
const horaBR = (ms) => new Date(ms - 3 * HORA_MS).toISOString().slice(11, 16);

function lerJson(caminho, padrao) {
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    return padrao;
  }
}

/** O índice do candle em cuja decisão a operação abriu (execução na abertura do seguinte). */
function candleDaDecisao(candles, abertaEm) {
  const i = candles.findIndex((c) => c.fechamento + 1 >= abertaEm);
  if (i < 0) return -1;
  return candles[i].abertura === abertaEm ? i - 1 : i;
}

/** O contexto e o sinal da regra no fechamento do candle da decisão (stop e alvo vêm daqui). */
function sinalNaDecisao(e, candles, i) {
  const ctx = contextoDeCandles(candles.slice(Math.max(0, i + 1 - HISTORICO_WIN), i + 1));
  return { ctx, s: decidirComSentido(e, { ...ctx, preco: candles[i].fecha }, null) };
}

function pedidoAoAgente(e, intervalo, candles, i, sentido, modelo, decisao, historico) {
  const c = candles[i];
  const { ctx, s } = decisao;
  // O contrato do agente fala a língua do robô ao vivo: COMPRAR abre comprado; sem posição,
  // VENDER abre vendido (o agente lê o lado em operacao.sentido).
  const sinal =
    sentido === "comprado"
      ? {
          acao: "COMPRAR",
          stop: s.stop,
          alvo: s.alvo,
          explicacao: s.explicacao,
          ...(s.distanciaRisco ? { distanciaRisco: s.distanciaRisco } : {}),
        }
      : { acao: "VENDER", motivo: "regra de saída", explicacao: `entrada vendida: ${s.explicacao}` };
  const velas = velasDoPedido(ctx);
  const custos = {
    mercado: "win",
    tarifaPorContrato: modelo.custos.tarifaB3.toString(),
    corretagemPorContrato: modelo.custos.corretagem.toString(),
    deslizamentoTicks: modelo.custos.deslizamentoTicks,
  };
  return {
    // De quem é a análise (custo e orçamento da IA): o rodar.sh passa o dono dos robôs.
    ...(process.env.WIN_PAPEL_USUARIO ? { usuarioId: process.env.WIN_PAPEL_USUARIO } : {}),
    // O agente exige 5+ caracteres no símbolo; WINFUT é o nome usual do mini índice contínuo.
    robo: { id: `win-papel-${e.id.slice(0, 8)}-${intervalo}`, simbolo: "WINFUT", intervalo },
    sinal,
    preco: c.fecha,
    fechamentos: ctx.fechamentos,
    posicao: POSICAO_ZERADA,
    operacao: operacaoDoPedido(e, custos, sentido),
    ...(velas ? { velas } : {}),
    ...(historico ? { historico } : {}),
    // Sinal recente: o agente usa o "agora" de verdade e consulta a base de conhecimento.
    // Sinal velho (recuperando atraso): modo replay, para nada vir do futuro do sinal.
    ...(Date.now() - (c.fechamento + 1) > SINAL_RECENTE_MS ? { ate: c.fechamento + 1 } : {}),
  };
}

const aprovou = (p, sentido) =>
  p.acao === (sentido === "comprado" ? "comprar" : "vender") &&
  p.avaliacao?.aprovada !== false &&
  !p.vetoGrave;

function resumo(ops) {
  const soma = (f) => ops.reduce((s, o) => s + f(o), 0);
  const certas = ops.filter((o) => o.liquido > 0).length;
  return {
    operacoes: ops.length,
    certas,
    erradas: ops.length - certas,
    acerto: ops.length ? certas / ops.length : null,
    bruto: soma((o) => o.bruto),
    custos: soma((o) => o.custos),
    liquido: soma((o) => o.liquido),
  };
}

/** Custos de ida e volta de 1 contrato em % do valor negociado (tarifa, corretagem e deslizamento). */
function custoIdaEVoltaPct(modelo, preco) {
  const reais =
    2 * (Number(modelo.custos.tarifaB3) + Number(modelo.custos.corretagem)) +
    2 * modelo.custos.deslizamentoTicks * TICK_PONTOS * VALOR_PONTO;
  return (reais / (preco * VALOR_PONTO)) * 100;
}

/** As operações que a mesma regra fez no passado (antes do dia), no formato da máquina do tempo. */
async function operacoesPassadas(banco, semVelas, e, intervalo, inicio, modelo, limites) {
  const de = inicio - HISTORICO_DIAS * DIA_MS;
  const candles = await candlesHistoricos(
    { banco: banco.mercado, corretora: semVelas },
    { simbolo: "WIN", intervalo, inicio: de, fim: inicio },
    HISTORICO_WIN,
  );
  const r = rodarBacktestWin({
    simbolo: "WIN",
    candles,
    estrategia: e,
    modelo,
    limites,
    saldoInicial: dec(SALDO),
    inicio: de,
    fim: inicio,
    execucao: "proximaAbertura",
  });
  const desde = r.candles[0]?.abertura ?? de;
  return {
    fonte: `WIN ${intervalo}, mesma regra, ${horaDia(desde)} a ${horaDia(inicio - 1)}`,
    ops: r.operacoes.map((o) => ({
      abertaEm: o.abertaEm,
      sentido: o.sentido,
      contratos: o.contratos,
      entrada: Number(o.entrada),
      resultado: Number(o.resultado),
    })),
  };
}

const horaDia = (ms) => new Date(ms - 3 * HORA_MS).toISOString().slice(0, 10);

function operacaoDoResultado(o) {
  return {
    abertaEm: o.abertaEm,
    fechadaEm: o.fechadaEm,
    entrada: horaBR(o.abertaEm),
    saida: horaBR(o.fechadaEm),
    sentido: o.sentido,
    contratos: o.contratos,
    precoEntrada: Number(o.entrada),
    precoSaida: Number(o.saida),
    motivo: o.motivo,
    bruto: Number(o.bruto),
    custos: Number(o.tarifas) + Number(o.corretagem) + Number(o.deslizamento),
    liquido: Number(o.resultado),
    claude: null,
  };
}

async function principal() {
  const a = argumentos(process.argv.slice(2));
  const dia = a.dia ?? hojeB3();
  const inicio = msBrasilia(dia, "09:00:00");
  const fim = Math.min(Date.now(), msBrasilia(dia, "18:30:00"));
  const estrategias = lerJson(`${PASTA}/estrategias.json`, []);
  if (estrategias.length === 0)
    throw new Error("estrategias.json vazio: rode o rodar.sh, que o baixa da API");
  mkdirSync(SAIDA, { recursive: true });
  const cacheArq = `${SAIDA}/claude-cache-v2.json`;
  const cache = lerJson(cacheArq, {});
  const config = ConfiguracaoBacktestEsquema.parse({
    mercado: "win",
    saldoInicial: SALDO,
    execucao: "proximaAbertura",
    win: { riscoPorOperacao: RISCO },
  });
  const modelo = modeloWinDe(configuracaoWin(config));
  const { limites } = limitesDoWin(config, dec(SALDO), modelo.riscoPorOperacao);
  const agente =
    a.claude && process.env.AGENTE_URL && process.env.AGENTE_SEGREDO
      ? new AgenteHttp({
          url: process.env.AGENTE_URL,
          segredo: process.env.AGENTE_SEGREDO,
          timeoutMs: TIMEOUT_AGENTE_MS,
        })
      : null;
  const banco = abrirBancoDosComandos(process.env);
  const semVelas = { candles: async () => [] };
  // O baralho do sorteio: as velas de 5 min dos ~100 dias antes do pregão.
  let blocos = null;
  try {
    const velas5m = await candlesHistoricos(
      { banco: banco.mercado, corretora: semVelas },
      { simbolo: "WIN", intervalo: "5m", inicio: inicio - SORTEIO_DIAS * DIA_MS, fim: inicio },
      0,
    );
    blocos = sessoesParaBlocos(velas5m); // R4: sorteio por pregão inteiro
  } catch (erro) {
    console.error(`sem simulação hoje: ${erro.message}`);
  }
  const linhas = [];
  let perguntas = 0;
  let custoClaude = 0;
  try {
    for (const e of estrategias) {
      for (const intervalo of INTERVALOS) {
        let candles;
        try {
          candles = await candlesHistoricos(
            { banco: banco.mercado, corretora: semVelas },
            { simbolo: "WIN", intervalo, inicio, fim },
            HISTORICO_WIN,
          );
        } catch (erro) {
          linhas.push({ estrategia: e.nome, intervalo, erro: erro.message });
          continue;
        }
        if (!candles.some((c) => c.abertura >= inicio)) {
          linhas.push({ estrategia: e.nome, intervalo, erro: "sem velas do dia ainda" });
          continue;
        }
        const r = rodarBacktestWin({
          simbolo: "WIN",
          candles,
          estrategia: e,
          modelo,
          limites,
          saldoInicial: dec(SALDO),
          inicio,
          fim,
          execucao: "proximaAbertura",
        });
        let passado = null;
        try {
          passado = await operacoesPassadas(banco, semVelas, e, intervalo, inicio, modelo, limites);
        } catch (erro) {
          console.error(`sem histórico de ${e.nome} ${intervalo}: ${erro.message}`);
        }
        const ops = [];
        for (const o of r.operacoes) {
          const op = operacaoDoResultado(o);
          const chave = `${e.id}|${intervalo}|${o.abertaEm}`;
          if (cache[chave]) op.claude = cache[chave];
          else if (agente && perguntas < a.maxClaude) {
            const i = candleDaDecisao(candles, o.abertaEm);
            if (i >= 0) {
              perguntas++;
              try {
                const decisao = sinalNaDecisao(e, candles, i);
                const entrada = Number(o.entrada);
                const simulacao =
                  blocos && decisao.s.acao === "ABRIR"
                    ? simularResto({
                        blocos,
                        inicioMs: o.abertaEm,
                        fimMs: msBrasilia(dia, ZERAGEM),
                        entrada,
                        stop: Number(decisao.s.stop),
                        alvo: Number(decisao.s.alvo),
                        sentido: o.sentido,
                        custoPct: custoIdaEVoltaPct(modelo, entrada),
                      })
                    : null;
                const historico = passado
                  ? historicoDoSinal(
                      passado.ops,
                      { abertaEm: o.abertaEm, sentido: o.sentido },
                      passado.fonte,
                      simulacao,
                    )
                  : null;
                op.historico = historico;
                const resp = await agente.analisar(
                  pedidoAoAgente(e, intervalo, candles, i, o.sentido, modelo, decisao, historico),
                );
                custoClaude += Number(resp.custoUsd);
                op.claude = {
                  veredito: aprovou(resp.proposta, o.sentido) ? "aprovou" : "vetou",
                  acao: resp.proposta.acao,
                  confianca: resp.proposta.confianca,
                  valorEsperado: resp.proposta.avaliacao?.valorEsperado,
                  explicacao: String(
                    resp.proposta.avaliacao?.motivo ?? resp.proposta.justificativa ?? "",
                  ).slice(0, 400),
                };
                cache[chave] = op.claude;
                writeFileSync(cacheArq, JSON.stringify(cache, null, 1));
              } catch (erro) {
                op.claude = { veredito: "erro", explicacao: String(erro.message).slice(0, 300) };
              }
            }
          }
          ops.push(op);
        }
        linhas.push({
          estrategia: e.nome,
          intervalo,
          semClaude: resumo(ops),
          comClaude: resumo(ops.filter((o) => o.claude?.veredito === "aprovou")),
          semResposta: ops.filter((o) => !o.claude || o.claude.veredito === "erro").length,
          operacoes: ops,
        });
      }
    }
  } finally {
    await banco.fechar();
  }
  const resultado = {
    dia,
    geradoEm: new Date().toISOString(),
    saldo: SALDO,
    risco: RISCO,
    custoClaudeUsd: custoClaude,
    linhas,
  };
  writeFileSync(`${SAIDA}/${dia}.json`, JSON.stringify(resultado, null, 1));
  writeFileSync(`${SAIDA}/${dia}.md`, relatorio(resultado));
  process.stdout.write(
    `ok ${dia}: ${linhas.length} combinações, ${perguntas} perguntas ao Claude (US$ ${custoClaude.toFixed(2)})\n`,
  );
}

const reais = (v) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);

function relatorio(r) {
  const t = [
    `# Pregão de papel do WIN — ${r.dia}`,
    "",
    `Gerado em ${r.geradoEm}. Capital R$ ${r.saldo} por robô, risco R$ ${r.risco} por operação, execução na abertura da vela seguinte, custos da B3 + deslizamento. Dinheiro de mentira; resultado de teste, não recomendação.`,
    "",
    "| Estratégia | Vela | Versão | Operações | Certas | Erradas | Acerto | Bruto | Custos | Líquido |",
    "|---|---|---|--:|--:|--:|--:|--:|--:|--:|",
  ];
  for (const l of r.linhas) {
    if (l.erro) {
      t.push(`| ${l.estrategia} | ${l.intervalo} | — | ${l.erro} | | | | | | |`);
      continue;
    }
    for (const [nome, s] of [
      ["sem Claude", l.semClaude],
      ["com Claude", l.comClaude],
    ])
      t.push(
        `| ${l.estrategia} | ${l.intervalo} | ${nome} | ${s.operacoes} | ${s.certas} | ${s.erradas} | ${pct(s.acerto)} | ${reais(s.bruto)} | ${reais(s.custos)} | ${reais(s.liquido)} |`,
      );
  }
  t.push("", `Custo do Claude no dia: US$ ${r.custoClaudeUsd.toFixed(2)}.`);
  return `${t.join("\n")}\n`;
}

try {
  await principal();
} catch (erro) {
  console.error(`o pregão de papel não rodou: ${erro.message}`);
  process.exitCode = 1;
}

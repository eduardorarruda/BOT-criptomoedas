import {
  limitesDominio,
  type AjusteDePosicao,
  type DadosSituacaoConta,
  type DivergenciaGravada,
  type RetratoConta,
  type RoboDoRetrato,
  type UsoOrcamentoIa,
} from "@zentrade/banco";
import type {
  LimitesContaDTO,
  OrcamentoIa,
  PausaConta,
  SituacaoConta,
  SituacaoRede,
} from "@zentrade/contratos";
import {
  barreirasDaConta,
  dec,
  fimDaSequencia,
  formatarDolar,
  formatarNumero,
  paraTexto,
  perdaDoDiaConta,
  quedaDoPico,
  type EstadoConta,
  type LimitesConta,
  type Valor,
} from "@zentrade/dominio";

const DIA_MS = 86_400_000;
/** A compra "vazia": as barreiras da conta que não dependem do tamanho da ordem. */
const SEM_COMPRA = { quantidade: dec(0), precoReferencia: dec(0) };

const proximoDiaUtc = (agora: number): number => agora - (agora % DIA_MS) + DIA_MS;
const proximoMesUtc = (agora: number): number => {
  const d = new Date(agora);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

function estadoDoRetrato(
  r: RetratoConta,
  l: LimitesConta,
  liberadaEm: number | null,
  agora: number,
  roboId: string | null,
): EstadoConta {
  return {
    limites: l,
    agora,
    realizadoDoDia: r.realizadoDoDia,
    naoRealizado: r.naoRealizado,
    exposicao: r.exposicao,
    posicoesAbertas: r.posicoesAbertas,
    roboTemPosicao: false,
    resultados: r.resultados,
    saidasComPerdaConta: r.saidasComPerda.map((s) => s.em),
    saidasComPerdaRobo: r.saidasComPerda.filter((s) => s.roboId === roboId).map((s) => s.em),
    liberadaEm,
    divergencias: [],
  };
}

const inicioDaJanela = (agora: number, janelaMs: number, liberadaEm: number | null) =>
  Math.max(agora - janelaMs, liberadaEm ?? -Infinity);

function quedaDaRede(r: RetratoConta, l: LimitesConta, liberadaEm: number | null, agora: number) {
  const inicio = inicioDaJanela(agora, l.quedaJanelaMs, liberadaEm);
  const q = quedaDoPico(r.resultados, inicio, l.incluirNaoRealizado ? r.naoRealizado : dec(0));
  const primeiro = r.resultados.filter((x) => x.em >= inicio).reduce((m, x) => Math.min(m, x.em), agora);
  return { ...q, libera: (q.picoEm ?? primeiro) + l.quedaJanelaMs };
}

/** As pausas de compra em vigor numa rede, com o motivo (a mensagem da barreira) e quando acabam. */
function pausasDaRede(
  r: RetratoConta,
  l: LimitesConta,
  liberadaEm: number | null,
  agora: number,
): PausaConta[] {
  const conta = estadoDoRetrato(r, l, liberadaEm, agora, null);
  const pausas: PausaConta[] = [];
  const base = { rede: r.rede, roboId: null };
  for (const b of barreirasDaConta(SEM_COMPRA, conta)) {
    if (b.codigo === "conta_perda_diaria")
      pausas.push({
        ...base,
        codigo: b.codigo,
        motivo: b.mensagem,
        ate: proximoDiaUtc(agora),
        liberavel: false,
      });
    if (b.codigo === "conta_queda")
      pausas.push({
        ...base,
        codigo: b.codigo,
        motivo: b.mensagem,
        ate: quedaDaRede(r, l, liberadaEm, agora).libera,
        liberavel: true,
      });
    if (b.codigo === "sequencia_stops" && l.sequenciaStopsMax !== null)
      pausas.push({
        ...base,
        codigo: b.codigo,
        motivo: b.mensagem,
        ate: fimDaSequencia(
          conta.saidasComPerdaConta,
          l.sequenciaStopsMax,
          l.sequenciaStopsJanelaMs,
          agora,
          liberadaEm,
        ),
        liberavel: true,
      });
  }
  if (l.sequenciaStopsEscopo === "conta" || l.sequenciaStopsMax === null) return pausas;
  for (const robo of r.robos) {
    const doRobo = estadoDoRetrato(r, l, liberadaEm, agora, robo.id);
    const barreira = barreirasDaConta(SEM_COMPRA, doRobo).find((b) => b.codigo === "sequencia_stops_robo");
    if (barreira)
      pausas.push({
        codigo: "sequencia_stops_robo",
        rede: r.rede,
        roboId: robo.id,
        motivo: `${robo.nome}: ${barreira.mensagem}`,
        ate: fimDaSequencia(
          doRobo.saidasComPerdaRobo,
          l.sequenciaStopsMax,
          l.sequenciaStopsJanelaMs,
          agora,
          liberadaEm,
        ),
        liberavel: true,
      });
  }
  return pausas;
}

function situacaoDaRede(
  r: RetratoConta,
  l: LimitesConta,
  liberadaEm: number | null,
  agora: number,
): SituacaoRede {
  const q = quedaDaRede(r, l, liberadaEm, agora);
  const conta = estadoDoRetrato(r, l, liberadaEm, agora, null);
  const inicioStops = inicioDaJanela(agora, l.sequenciaStopsJanelaMs, liberadaEm);
  return {
    rede: r.rede,
    robos: r.robos.length,
    realizadoDoDia: paraTexto(r.realizadoDoDia),
    naoRealizado: paraTexto(r.naoRealizado),
    perdaDoDia: paraTexto(perdaDoDiaConta(conta)),
    exposicao: paraTexto(r.exposicao),
    posicoesAbertas: r.posicoesAbertas,
    queda: paraTexto(q.queda),
    pico: paraTexto(q.pico),
    saidasComPerda: r.saidasComPerda.filter((s) => s.em > inicioStops).length,
  };
}

const uso = (gasto: Valor, limite: Valor | null): number | null =>
  limite ? gasto.div(limite).toNumber() : null;

export function orcamentoIaDTO(u: UsoOrcamentoIa): OrcamentoIa {
  const usos = [uso(u.gastoMes, u.limiteMensal), uso(u.gastoDia, u.limiteDiario)].filter(
    (x): x is number => x !== null,
  );
  const maior = usos.length > 0 ? Math.max(...usos) : null;
  return {
    gastoMes: paraTexto(u.gastoMes),
    gastoDia: paraTexto(u.gastoDia),
    limiteMensal: u.limiteMensal ? paraTexto(u.limiteMensal) : null,
    limiteDiario: u.limiteDiario ? paraTexto(u.limiteDiario) : null,
    uso: maior,
    esgotado: maior !== null && maior >= 1,
  };
}

function pausaDoOrcamento(u: UsoOrcamentoIa, agora: number): PausaConta | null {
  const doMes = u.limiteMensal && u.gastoMes.gte(u.limiteMensal);
  const doDia = u.limiteDiario && u.gastoDia.gte(u.limiteDiario);
  if (!doMes && !doDia) return null;
  const [gasto, limite] = doMes ? [u.gastoMes, u.limiteMensal] : [u.gastoDia, u.limiteDiario];
  return {
    codigo: "orcamento_ia",
    rede: null,
    roboId: null,
    motivo: `Orçamento de IA ${doMes ? "do mês" : "do dia"} atingido (${formatarDolar(gasto)} de ${formatarDolar(limite ?? dec(0))}): as análises voltam como "aguardar" e o assistente para. Com o agente obrigatório, os robôs não compram; stops seguem.`,
    ate: doMes ? proximoMesUtc(agora) : proximoDiaUtc(agora),
    liberavel: false,
  };
}

function pausaDaDivergencia(d: DivergenciaGravada): PausaConta {
  return {
    codigo: "divergencia_saldo",
    rede: d.rede,
    roboId: null,
    motivo: `O saldo de ${d.ativo} na Binance (${formatarNumero(dec(d.naCorretora))}) está ${formatarNumero(dec(d.falta))} abaixo do que os robôs registram. Compras com ${d.ativo} ficam paradas até a divergência ser resolvida.`,
    ate: null,
    liberavel: false,
  };
}

/** `GET /risco/conta`: aplica as regras do domínio sobre a fotografia do banco. */
export function situacaoDaConta(
  dados: DadosSituacaoConta,
  divergencias: readonly DivergenciaGravada[],
  agora: number,
): SituacaoConta {
  const l = limitesDominio(dados.limites);
  const orcamento = pausaDoOrcamento(dados.orcamento, agora);
  return {
    limites: dados.limites,
    liberadaEm: dados.liberadaEm,
    redes: dados.retratos.map((r) => situacaoDaRede(r, l, dados.liberadaEm, agora)),
    pausas: [
      ...dados.retratos.flatMap((r) => pausasDaRede(r, l, dados.liberadaEm, agora)),
      ...divergencias.filter((d) => d.estado === "aberta").map(pausaDaDivergencia),
      ...(orcamento ? [orcamento] : []),
    ],
    orcamentoIa: orcamentoIaDTO(dados.orcamento),
    em: agora,
  };
}

const MAIS_SEGURO_SE_MENOR = [
  "perdaDiariaMaxima",
  "exposicaoMaxima",
  "posicoesAbertasMax",
  "quedaMaxima",
  "sequenciaStopsMax",
  "orcamentoIaMensalUsd",
  "orcamentoIaDiarioUsd",
] as const;

const numero = (v: string | number): Valor => dec(v);

/**
 * A mudança afrouxa alguma proteção? Tirar um limite, subir um teto, encurtar uma
 * janela, deixar de somar o não realizado ou estreitar o escopo da sequência de stops.
 * Apertar não tem atrito; afrouxar pede reautenticação (como desligar a parada total).
 */
export function afrouxa(atual: LimitesContaDTO, novo: LimitesContaDTO): boolean {
  for (const campo of MAIS_SEGURO_SE_MENOR) {
    const antes = atual[campo];
    const depois = novo[campo];
    if (antes === null) continue;
    if (depois === null || numero(depois).gt(numero(antes))) return true;
  }
  if (atual.incluirNaoRealizado && !novo.incluirNaoRealizado) return true;
  if (novo.quedaJanelaHoras < atual.quedaJanelaHoras) return true;
  if (novo.sequenciaStopsJanelaHoras < atual.sequenciaStopsJanelaHoras) return true;
  return atual.sequenciaStopsEscopo === "ambos" && novo.sequenciaStopsEscopo !== "ambos";
}

/**
 * Ao aceitar o saldo da corretora, a falta é baixada das posições dos robôs que têm o
 * ativo, da maior para a menor, ao preço médio de cada uma (sem ganho nem perda).
 */
export function ajustesDaFalta(falta: Valor, robos: readonly RoboDoRetrato[]): AjusteDePosicao[] {
  let resta = falta;
  const ajustes: AjusteDePosicao[] = [];
  for (const r of [...robos]
    .filter((x) => x.quantidade.gt(0))
    .sort((a, b) => b.quantidade.comparedTo(a.quantidade))) {
    if (resta.lte(0)) break;
    const quantidade = r.quantidade.lt(resta) ? r.quantidade : resta;
    ajustes.push({ roboId: r.id, simbolo: r.simbolo, quantidade, preco: r.precoMedio });
    resta = resta.minus(quantidade);
  }
  return ajustes;
}

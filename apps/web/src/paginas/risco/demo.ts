import type {
  AvisoDTO,
  DivergenciaDTO,
  LimitesContaDTO,
  PausaConta,
  ResultadoReconciliacao,
  SituacaoConta,
  SituacaoRede,
} from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";

/**
 * A conta de demonstração: dois robôs na testnet (BTC e SOL) e dois em papel. O SOL
 * tomou três stops seguidos (pausa da sequência) e o saldo de SOL na corretora está
 * abaixo do que o robô registra (divergência aberta). O orçamento de IA passou de 80%.
 * Mudar os limites, liberar as pausas ou aceitar a divergência muda o que a tela mostra.
 */
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

const LIMITES_INICIAIS: LimitesContaDTO = {
  perdaDiariaMaxima: "150",
  incluirNaoRealizado: true,
  exposicaoMaxima: "2000",
  posicoesAbertasMax: 3,
  quedaMaxima: "300",
  quedaJanelaHoras: 72,
  sequenciaStopsMax: 3,
  sequenciaStopsJanelaHoras: 24,
  sequenciaStopsEscopo: "ambos",
  orcamentoIaMensalUsd: "25",
  orcamentoIaDiarioUsd: "2",
};

const TESTNET: SituacaoRede = {
  rede: "testnet",
  robos: 2,
  realizadoDoDia: "-42.1",
  naoRealizado: "-8.4",
  perdaDoDia: "-50.5",
  exposicao: "1180.35",
  posicoesAbertas: 2,
  queda: "96.3",
  pico: "140.2",
  saidasComPerda: 3,
};

const PAPEL: SituacaoRede = {
  rede: "papel",
  robos: 2,
  realizadoDoDia: "12.5",
  naoRealizado: "3.1",
  perdaDoDia: "15.6",
  exposicao: "410",
  posicoesAbertas: 1,
  queda: "18",
  pico: "61.4",
  saidasComPerda: 1,
};

const GASTO_MES = "20.4";
const GASTO_DIA = "0.62";

function divergenciasIniciais(agora: number): DivergenciaDTO[] {
  return [
    {
      id: "div-sol",
      rede: "testnet",
      ativo: "SOL",
      esperado: "2.5",
      naCorretora: "2.1",
      falta: "0.4",
      estado: "aberta",
      detectadaEm: agora - 38 * MIN,
      atualizadaEm: agora - 8 * MIN,
      resolvidaEm: null,
      resolvidaPor: null,
      robos: [{ id: "r-sol", nome: "SOL rompimento" }],
    },
    {
      id: "div-btc",
      rede: "testnet",
      ativo: "BTC",
      esperado: "0.012",
      naCorretora: "0.0102",
      falta: "0.0018",
      estado: "resolvida",
      detectadaEm: agora - 2 * DIA,
      atualizadaEm: agora - 2 * DIA + 20 * MIN,
      resolvidaEm: agora - 2 * DIA + 20 * MIN,
      resolvidaPor: "conferencia",
      robos: [{ id: "r-btc", nome: "BTC paciente" }],
    },
  ];
}

function avisosIniciais(agora: number): AvisoDTO[] {
  const aviso = (
    id: string,
    a: Pick<AvisoDTO, "tipo" | "gravidade" | "titulo" | "mensagem"> & { roboId?: string },
    haMs: number,
    lido = false,
  ): AvisoDTO => ({
    id,
    roboId: a.roboId ?? null,
    tipo: a.tipo,
    gravidade: a.gravidade,
    titulo: a.titulo,
    mensagem: a.mensagem,
    criadoEm: agora - haMs,
    lidoEm: lido ? agora - haMs + MIN : null,
    enviado: true,
  });
  return [
    aviso(
      "a1",
      {
        tipo: "divergencia_saldo",
        gravidade: "critico",
        titulo: "Saldo de SOL não bate com a corretora",
        mensagem:
          "Os robôs registram 2,5 SOL na testnet, mas a Binance tem 2,1 (livre + bloqueado). Faltam 0,4. Compras com SOL ficam paradas; nada foi vendido nem comprado para corrigir.",
      },
      38 * MIN,
    ),
    aviso(
      "a2",
      {
        tipo: "pausa_sequencia_stops",
        gravidade: "atencao",
        titulo: "Compras pausadas: sequência de stops em SOL rompimento",
        mensagem:
          "3 saídas com perda nas últimas 24 h (neste robô). Compras pausadas por 3 h 40 min ou até você liberar na tela de Risco.",
        roboId: "r-sol",
      },
      52 * MIN,
    ),
    aviso(
      "a3",
      {
        tipo: "stop_atingido",
        gravidade: "atencao",
        titulo: "Stop atingido: SOL rompimento",
        mensagem: "SOL rompimento (SOLUSDT) vendeu a posição no stop, perto de 143,20.",
        roboId: "r-sol",
      },
      53 * MIN,
    ),
    aviso(
      "a4",
      {
        tipo: "orcamento_ia_80",
        gravidade: "atencao",
        titulo: "Orçamento de IA do mês: 80%",
        mensagem: "O gasto com IA do mês já é US$ 20,04, 80% do limite de US$ 25,00.",
      },
      5 * HORA,
      true,
    ),
    aviso(
      "a5",
      {
        tipo: "websocket_fora",
        gravidade: "critico",
        titulo: "Sem preço ao vivo: BTCUSDT",
        mensagem:
          "A conexão de candles do robô BTCUSDT (testnet) ficou fora por 6 min. O motor reconectou sozinho e completou os candles perdidos.",
        roboId: "r-btc",
      },
      26 * HORA,
      true,
    ),
  ];
}

const proximoDiaUtc = (agora: number): number => agora - (agora % DIA) + DIA;
const proximoMesUtc = (agora: number): number => {
  const d = new Date(agora);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

const atingido = (valor: string, limite: string | null): boolean => limite !== null && dec(valor).gte(limite);

export function demoRisco(inicio: number) {
  let limites = LIMITES_INICIAIS;
  let liberadaEm: number | null = null;
  let divergencias = divergenciasIniciais(inicio);
  let avisos = avisosIniciais(inicio);
  const fimSequenciaSol = inicio + 3 * HORA + 40 * MIN;

  function orcamento() {
    const usoMes = limites.orcamentoIaMensalUsd ? dec(GASTO_MES).div(limites.orcamentoIaMensalUsd) : null;
    const usoDia = limites.orcamentoIaDiarioUsd ? dec(GASTO_DIA).div(limites.orcamentoIaDiarioUsd) : null;
    const usos = [usoMes, usoDia].filter((u) => u !== null).map((u) => u.toNumber());
    const uso = usos.length > 0 ? Math.max(...usos) : null;
    return {
      gastoMes: GASTO_MES,
      gastoDia: GASTO_DIA,
      limiteMensal: limites.orcamentoIaMensalUsd,
      limiteDiario: limites.orcamentoIaDiarioUsd,
      uso,
      esgotado: uso !== null && uso >= 1,
    };
  }

  function pausas(agora: number): PausaConta[] {
    const lista: PausaConta[] = [];
    const perda = dec(TESTNET.perdaDoDia).neg().toFixed();
    if (atingido(perda, limites.perdaDiariaMaxima))
      lista.push({
        codigo: "conta_perda_diaria",
        rede: "testnet",
        roboId: null,
        motivo: `A perda do dia na conta (US$ 50,50, somando os robôs) chegou ao limite. Compras voltam às 00:00 UTC (21h de Brasília).`,
        ate: proximoDiaUtc(agora),
        liberavel: false,
      });
    if (liberadaEm === null && atingido(TESTNET.queda, limites.quedaMaxima))
      lista.push({
        codigo: "conta_queda",
        rede: "testnet",
        roboId: null,
        motivo:
          "A conta caiu US$ 96,30 desde o pico das últimas horas; compras pausadas até o pico sair da janela.",
        ate: agora + 30 * HORA,
        liberavel: true,
      });
    const max = limites.sequenciaStopsMax;
    // Os 3 stops do SOL também contam na conta (a testnet soma 3 saídas com perda).
    if (liberadaEm === null && max !== null && max <= 3 && limites.sequenciaStopsEscopo !== "robo")
      lista.push({
        codigo: "sequencia_stops",
        rede: "testnet",
        roboId: null,
        motivo: `3 saídas com perda nas últimas ${limites.sequenciaStopsJanelaHoras} h (somando os robôs da conta). Compras pausadas ou até você liberar.`,
        ate: fimSequenciaSol,
        liberavel: true,
      });
    if (liberadaEm === null && max !== null && max <= 3 && limites.sequenciaStopsEscopo !== "conta")
      lista.push({
        codigo: "sequencia_stops_robo",
        rede: "testnet",
        roboId: "r-sol",
        motivo: `SOL rompimento: 3 saídas com perda nas últimas ${limites.sequenciaStopsJanelaHoras} h (neste robô). Compras pausadas ou até você liberar.`,
        ate: fimSequenciaSol,
        liberavel: true,
      });
    for (const d of divergencias.filter((x) => x.estado === "aberta"))
      lista.push({
        codigo: "divergencia_saldo",
        rede: d.rede,
        roboId: null,
        motivo: `O saldo de ${d.ativo} na Binance (2,1) está 0,4 abaixo do que os robôs registram. Compras com ${d.ativo} ficam paradas até a divergência ser resolvida.`,
        ate: null,
        liberavel: false,
      });
    if (orcamento().esgotado)
      lista.push({
        codigo: "orcamento_ia",
        rede: null,
        roboId: null,
        motivo: 'Orçamento de IA atingido: as análises voltam como "aguardar" e o assistente para.',
        ate: proximoMesUtc(agora),
        liberavel: false,
      });
    return lista;
  }

  return {
    situacao(agora: number): SituacaoConta {
      return {
        limites,
        liberadaEm,
        redes: [TESTNET, PAPEL],
        pausas: pausas(agora),
        orcamentoIa: orcamento(),
        em: agora,
      };
    },
    salvarLimites(l: LimitesContaDTO): LimitesContaDTO {
      limites = l;
      return limites;
    },
    liberar(agora: number): LimitesContaDTO {
      liberadaEm = agora;
      return limites;
    },
    divergencias: (): DivergenciaDTO[] => divergencias,
    reconciliar(agora: number): ResultadoReconciliacao {
      const abertas = divergencias.filter((d) => d.estado === "aberta").length;
      return {
        em: agora,
        conferidas: [{ rede: "testnet", ok: true, erro: null, ativos: 2, divergentes: abertas }],
      };
    },
    aceitar(id: string, agora: number): DivergenciaDTO {
      divergencias = divergencias.map((d) =>
        d.id === id
          ? { ...d, estado: "aceita", resolvidaEm: agora, resolvidaPor: "voce@demo", atualizadaEm: agora }
          : d,
      );
      const aceita = divergencias.find((d) => d.id === id);
      if (!aceita) throw new Error("divergência não encontrada");
      return aceita;
    },
    avisos: (): AvisoDTO[] => avisos,
    marcarLidos(agora: number): number {
      const naoLidos = avisos.filter((a) => a.lidoEm === null).length;
      avisos = avisos.map((a) => (a.lidoEm === null ? { ...a, lidoEm: agora } : a));
      return naoLidos;
    },
  };
}

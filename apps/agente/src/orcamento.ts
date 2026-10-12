import type { AlertaEmitido, PedidoAnalise, RespostaAnalise } from "@zentrade/contratos";
import { dec, formatarDolar, type Valor } from "@zentrade/dominio";
import { aguardar, type OpcoesAnalise } from "./analista.js";

/**
 * Orçamento de IA por pessoa: teto mensal (e, se quiser, diário) em US$ para o que o
 * agente gasta com o modelo — análises e assistente. Conferido ANTES de chamar o
 * modelo; o gasto é gravado depois de cada chamada (tabela gastos_ia). Mês e dia em UTC.
 */
export const MOTIVO_ORCAMENTO_MES = "orçamento de IA do mês atingido";
export const MOTIVO_ORCAMENTO_DIA = "orçamento de IA do dia atingido";

/** Gasto e tetos de agora (o packages/banco devolve isto). Teto `null` = sem limite. */
export interface UsoOrcamento {
  readonly gastoMes: Valor;
  readonly gastoDia: Valor;
  readonly limiteMensal: Valor | null;
  readonly limiteDiario: Valor | null;
}

export type OrigemGasto = "analise" | "assistente";

export interface FonteOrcamento {
  uso(usuarioId: string, agora: number): Promise<UsoOrcamento>;
  registrar(usuarioId: string, origem: OrigemGasto, custo: Valor, em: number): Promise<void>;
}

export interface LogOrcamento {
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export type Liberacao = { readonly liberado: true } | { readonly liberado: false; readonly motivo: string };

/** Esgotado se o gasto do mês (ou do dia) chegou ao teto. */
export function conferirUso(u: UsoOrcamento): Liberacao {
  if (u.limiteMensal && u.gastoMes.gte(u.limiteMensal))
    return {
      liberado: false,
      motivo: `${MOTIVO_ORCAMENTO_MES} (${formatarDolar(u.gastoMes)} de ${formatarDolar(u.limiteMensal)})`,
    };
  if (u.limiteDiario && u.gastoDia.gte(u.limiteDiario))
    return {
      liberado: false,
      motivo: `${MOTIVO_ORCAMENTO_DIA} (${formatarDolar(u.gastoDia)} de ${formatarDolar(u.limiteDiario)})`,
    };
  return { liberado: true };
}

const MARCOS = [
  { fracao: dec("0.8"), tipo: "orcamento_ia_80", gravidade: "atencao", rotulo: "80%" },
  { fracao: dec(1), tipo: "orcamento_ia_100", gravidade: "critico", rotulo: "100%" },
] as const;

const mesUtc = (agora: number): string => new Date(agora).toISOString().slice(0, 7);
const diaUtc = (agora: number): string => new Date(agora).toISOString().slice(0, 10);

/**
 * Alertas dos marcos (80% e 100%) que este gasto atravessou, no mês e no dia. A chave
 * leva o mês (ou o dia): cada marco avisa uma vez por período.
 */
export function marcosAtravessados(
  usuarioId: string,
  u: UsoOrcamento,
  custo: Valor,
  agora: number,
): AlertaEmitido[] {
  const periodos = [
    { nome: "do mês", gasto: u.gastoMes, limite: u.limiteMensal, sufixo: mesUtc(agora) },
    { nome: "do dia", gasto: u.gastoDia, limite: u.limiteDiario, sufixo: diaUtc(agora) },
  ];
  return periodos.flatMap((p) => {
    const limite = p.limite;
    if (!limite) return [];
    const antes = p.gasto.minus(custo).div(limite);
    const depois = p.gasto.div(limite);
    return MARCOS.filter((m) => antes.lt(m.fracao) && depois.gte(m.fracao)).map((m) => ({
      tipo: m.tipo,
      gravidade: m.gravidade,
      titulo: `Orçamento de IA ${p.nome}: ${m.rotulo}`,
      mensagem:
        m.tipo === "orcamento_ia_100"
          ? `O gasto com IA ${p.nome} chegou a ${formatarDolar(p.gasto)} (limite ${formatarDolar(limite)}). Análises voltam como "aguardar" e o assistente para até o período virar (UTC) ou você subir o limite em Risco. Com o agente obrigatório, os robôs não compram; stops seguem.`
          : `O gasto com IA ${p.nome} já é ${formatarDolar(p.gasto)}, ${m.rotulo} do limite de ${formatarDolar(limite)}.`,
      chave: `${m.tipo}:${usuarioId}:${p.sufixo}`,
      usuarioId,
      em: agora,
    }));
  });
}

/**
 * A porta do orçamento: confere antes e grava depois. Se não der para ler o orçamento,
 * não libera (na dúvida, não gasta nem opera). Falha ao gravar só vai para o log.
 */
export class PortaoOrcamento {
  constructor(
    private readonly o: {
      readonly fonte: FonteOrcamento;
      readonly log: LogOrcamento;
      readonly alertar?: (a: AlertaEmitido) => Promise<void>;
      readonly agora?: () => number;
    },
  ) {}

  private agora(): number {
    return (this.o.agora ?? Date.now)();
  }

  async conferir(usuarioId: string): Promise<Liberacao> {
    try {
      return conferirUso(await this.o.fonte.uso(usuarioId, this.agora()));
    } catch (erro) {
      this.o.log.error({ err: erro, usuarioId }, "não deu para ler o orçamento de IA");
      return {
        liberado: false,
        motivo: "não deu para conferir o orçamento de IA agora (banco indisponível); sem conferir, não gasta",
      };
    }
  }

  async registrar(usuarioId: string, origem: OrigemGasto, custo: Valor): Promise<void> {
    if (custo.lte(0)) return;
    const agora = this.agora();
    try {
      await this.o.fonte.registrar(usuarioId, origem, custo, agora);
      const uso = await this.o.fonte.uso(usuarioId, agora);
      for (const alerta of marcosAtravessados(usuarioId, uso, custo, agora)) await this.o.alertar?.(alerta);
    } catch (erro) {
      this.o.log.error({ err: erro, usuarioId, origem }, "não deu para gravar o gasto de IA");
    }
  }
}

export interface AnalistaServicoOrcado {
  analisar(pedido: PedidoAnalise, opcoes: OpcoesAnalise): Promise<RespostaAnalise>;
}

/**
 * O analista atrás do orçamento: vale para os dois provedores (API e Claude Code),
 * porque embrulha quem escolhe o provedor. Sem orçamento, devolve "aguardar" com o
 * motivo e `semOrcamento` — o modelo nem é chamado.
 */
export class AnalistaComOrcamento implements AnalistaServicoOrcado {
  constructor(
    private readonly analista: AnalistaServicoOrcado,
    private readonly portao: PortaoOrcamento,
  ) {}

  async analisar(pedido: PedidoAnalise, opcoes: OpcoesAnalise): Promise<RespostaAnalise> {
    const liberacao = await this.portao.conferir(opcoes.usuarioId);
    if (!liberacao.liberado)
      return {
        proposta: aguardar(
          `${liberacao.motivo}. Sem análise, a proposta é aguardar até o período virar (UTC) ou o limite subir em Risco.`,
        ),
        custoUsd: dec(0),
        semOrcamento: true,
      };
    const resposta = await this.analista.analisar(pedido, opcoes);
    await this.portao.registrar(opcoes.usuarioId, "analise", resposta.custoUsd);
    return resposta;
  }
}

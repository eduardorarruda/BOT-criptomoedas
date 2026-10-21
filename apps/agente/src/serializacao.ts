import {
  Id,
  Instante,
  Intervalo,
  OperacaoPedidoEsquema,
  TextoDecimal,
  VelasPedidoEsquema,
  type PedidoAnalise,
} from "@zentrade/contratos";
import { dec, paraTexto, type Posicao, type Sinal, type Valor } from "@zentrade/dominio";
import { z } from "zod";

/**
 * Formato do PedidoAnalise no fio (motor → agente): decimais em texto, como em todo o
 * contrato. `usuarioId` e `orcamento` são extensões opcionais deste serviço — o
 * PedidoAnalise de @zentrade/contratos ainda não os tem (ver "mudanças de contrato").
 */
const SinalJson = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("COMPRAR"),
    stop: TextoDecimal,
    alvo: TextoDecimal,
    explicacao: z.string().max(2000),
  }),
  z.object({
    acao: z.literal("VENDER"),
    motivo: z.enum(["stop", "alvo", "regra de saída", "tempo"]),
    explicacao: z.string().max(2000),
  }),
  z.object({ acao: z.literal("AGUARDAR"), explicacao: z.string().max(2000) }),
]);

const PosicaoJson = z.object({
  quantidade: TextoDecimal,
  precoMedio: TextoDecimal,
  resultadoRealizado: TextoDecimal,
  taxasPagas: TextoDecimal,
});

export const PedidoAnaliseJson = z.object({
  robo: z.object({ id: Id, simbolo: z.string().regex(/^[A-Z0-9]{5,20}$/), intervalo: Intervalo }),
  sinal: SinalJson,
  preco: TextoDecimal,
  fechamentos: z.array(z.number().finite()).max(2000),
  posicao: PosicaoJson,
  /** Liga os eventos "analise" (passo a passo ao vivo) à decisão que o motor está tomando. */
  analiseId: Id.optional(),
  /** Como a operação sai e quanto custa (motor novo); números puros. */
  operacao: OperacaoPedidoEsquema.optional(),
  /** Máximas, mínimas, volumes e instantes alinhados com os fechamentos. */
  velas: VelasPedidoEsquema.optional(),
  /** Replay histórico: o "agora" da análise (ms UTC); desliga as ferramentas que leem o banco ao vivo. */
  ate: Instante.optional(),
});
export type PedidoAnaliseJson = z.infer<typeof PedidoAnaliseJson>;

const OrcamentoJson = z.object({
  riscoPorOperacao: TextoDecimal,
  exposicaoMaxima: TextoDecimal,
  perdaDiariaMaxima: TextoDecimal,
  exposicaoAtual: TextoDecimal.optional(),
  resultadoDoDia: TextoDecimal.optional(),
});

const CorpoAnalise = PedidoAnaliseJson.extend({
  usuarioId: z.uuid().optional(),
  orcamento: OrcamentoJson.optional(),
}).refine((c) => !c.velas || c.velas.instantes.length === c.fechamentos.length, {
  message: "as velas precisam ter o mesmo tamanho dos fechamentos",
  path: ["velas"],
});

/** Orçamento de risco do robô, em decimal exato (moeda de cotação). */
export interface OrcamentoRisco {
  readonly riscoPorOperacao: Valor;
  readonly exposicaoMaxima: Valor;
  readonly perdaDiariaMaxima: Valor;
  readonly exposicaoAtual?: Valor;
  readonly resultadoDoDia?: Valor;
}

export interface CorpoAnaliseLido {
  readonly pedido: PedidoAnalise;
  readonly usuarioId?: string;
  readonly orcamento?: OrcamentoRisco;
}

export type Leitura<T> =
  { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly erro: string };

const mensagem = (e: z.ZodError): string =>
  e.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; ");

function sinalParaJson(s: Sinal): z.infer<typeof SinalJson> {
  if (s.acao === "COMPRAR") return { ...s, stop: paraTexto(s.stop), alvo: paraTexto(s.alvo) };
  return { ...s };
}

function sinalDeJson(s: z.infer<typeof SinalJson>): Sinal {
  return s.acao === "COMPRAR" ? { ...s, stop: dec(s.stop), alvo: dec(s.alvo) } : s;
}

const posicaoDeJson = (p: z.infer<typeof PosicaoJson>): Posicao => ({
  quantidade: dec(p.quantidade),
  precoMedio: dec(p.precoMedio),
  resultadoRealizado: dec(p.resultadoRealizado),
  taxasPagas: dec(p.taxasPagas),
});

export function pedidoParaJson(p: PedidoAnalise): PedidoAnaliseJson {
  return {
    robo: { ...p.robo },
    sinal: sinalParaJson(p.sinal),
    preco: paraTexto(p.preco),
    fechamentos: [...p.fechamentos],
    posicao: {
      quantidade: paraTexto(p.posicao.quantidade),
      precoMedio: paraTexto(p.posicao.precoMedio),
      resultadoRealizado: paraTexto(p.posicao.resultadoRealizado),
      taxasPagas: paraTexto(p.posicao.taxasPagas),
    },
    ...(p.analiseId ? { analiseId: p.analiseId } : {}),
    ...(p.operacao ? { operacao: p.operacao } : {}),
    ...(p.velas ? { velas: p.velas } : {}),
    ...(p.ate !== undefined ? { ate: p.ate } : {}),
  };
}

export function pedidoDeJson(j: PedidoAnaliseJson): PedidoAnalise {
  return {
    robo: j.robo,
    sinal: sinalDeJson(j.sinal),
    preco: dec(j.preco),
    fechamentos: j.fechamentos,
    posicao: posicaoDeJson(j.posicao),
    ...(j.analiseId ? { analiseId: j.analiseId } : {}),
    ...(j.operacao ? { operacao: j.operacao } : {}),
    ...(j.velas ? { velas: j.velas } : {}),
    ...(j.ate !== undefined ? { ate: j.ate } : {}),
  };
}

function orcamentoDeJson(o: z.infer<typeof OrcamentoJson>): OrcamentoRisco {
  return {
    riscoPorOperacao: dec(o.riscoPorOperacao),
    exposicaoMaxima: dec(o.exposicaoMaxima),
    perdaDiariaMaxima: dec(o.perdaDiariaMaxima),
    ...(o.exposicaoAtual !== undefined ? { exposicaoAtual: dec(o.exposicaoAtual) } : {}),
    ...(o.resultadoDoDia !== undefined ? { resultadoDoDia: dec(o.resultadoDoDia) } : {}),
  };
}

/** Validação na borda do POST /analisar. */
export function lerCorpoAnalise(corpo: unknown): Leitura<CorpoAnaliseLido> {
  const lido = CorpoAnalise.safeParse(corpo);
  if (!lido.success) return { ok: false, erro: mensagem(lido.error) };
  const { usuarioId, orcamento, ...pedido } = lido.data;
  return {
    ok: true,
    valor: {
      pedido: pedidoDeJson(pedido),
      ...(usuarioId ? { usuarioId } : {}),
      ...(orcamento ? { orcamento: orcamentoDeJson(orcamento) } : {}),
    },
  };
}

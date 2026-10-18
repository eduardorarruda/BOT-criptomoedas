import {
  PropostaGeradaEsquema,
  type PedidoAnalise,
  type PropostaGerada,
  type RespostaAnalise,
} from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { z } from "zod";
import {
  aguardar,
  correcaoDoFormato,
  finalizarProposta,
  motivoFormatoInvalido,
  type OpcoesAnalise,
} from "../analista.js";
import { ferramentasDaAnalise, RegistroFontes, type DependenciasFerramentas } from "../ferramentas/index.js";
import { buscarContextoPrevio } from "../pedido/previo.js";
import { mensagemDoPedido, SYSTEM_PROMPT } from "../prompt.js";
import type { ExecucaoCli, ExecutorClaude } from "./executor.js";
import { lerJson, type ResultadoCli } from "./resultado.js";

/** O esquema que vai em `--json-schema`: a mesma proposta (com cenários) que o provedor "api" usa. */
const { $schema: _versao, ...ESQUEMA_PROPOSTA } = z.toJSONSchema(PropostaGeradaEsquema) as Record<
  string,
  unknown
>;
export { ESQUEMA_PROPOSTA };

/** Falha do processo do CLI (não instalado, sem login, limite do plano, prazo): o motor não opera. */
export class ErroClaudeCli extends Error {
  override name = "ErroClaudeCli";
  constructor(
    readonly codigo: string,
    mensagem: string,
    /** Detalhe técnico (fim do stderr), só para o log. */
    readonly detalhe?: string,
  ) {
    super(mensagem);
  }
}

const PARADAS: Readonly<Record<string, string>> = {
  error_max_turns:
    "A análise pelo Claude Code passou do limite de voltas com as ferramentas. Sem conclusão, aguardar.",
  error_max_budget_usd:
    "A análise pelo Claude Code bateu no teto de custo configurado. Sem conclusão, aguardar.",
  error_max_structured_output_retries:
    "O Claude Code não conseguiu devolver a proposta no formato pedido. Sem proposta válida, aguardar.",
};

export type LeituraCli =
  | { readonly ok: true; readonly proposta: PropostaGerada }
  /** `erroDeFormato`: o modelo respondeu, mas fora do esquema — vale uma nova tentativa. */
  | { readonly ok: false; readonly motivo: string; readonly erroDeFormato?: string };

/**
 * Do "result" do CLI para a proposta gerada: qualquer coisa fora do esquema (Zod, com a
 * soma das probabilidades e os três cenários) é recusada com o motivo — o pior caso é
 * não operar, nunca operar com proposta torta.
 */
export function lerPropostaCli(r: ResultadoCli | null): LeituraCli {
  if (!r)
    return { ok: false, motivo: "O Claude Code não devolveu um resultado legível. Sem proposta, aguardar." };
  const parada = PARADAS[r.subtype];
  if (parada) return { ok: false, motivo: parada };
  if (r.is_error || r.subtype !== "success") {
    return { ok: false, motivo: `O Claude Code parou com erro (${r.subtype}). Por segurança, aguardar.` };
  }
  const lida = PropostaGeradaEsquema.safeParse(r.structured_output ?? lerJson(r.result ?? ""));
  if (lida.success) return { ok: true, proposta: lida.data };
  const problemas = lida.error.issues
    .map((i) => `${i.path.join(".") || "proposta"}: ${i.message}`)
    .join("; ")
    .slice(0, 1500);
  return {
    ok: false,
    motivo: `A proposta do Claude Code veio fora do esquema (${problemas}). Sem proposta válida, aguardar.`,
    erroDeFormato: problemas,
  };
}

/** A segunda entrada: o pedido de novo, a resposta recusada e o erro da validação. */
function entradaDeCorrecao(entrada: string, r: ResultadoCli | null, erro: string): string {
  const anterior = JSON.stringify(r?.structured_output ?? r?.result ?? "").slice(0, 4000);
  return `${entrada}\n\n## Correção\nSua resposta anterior: ${anterior}\n${correcaoDoFormato(erro)}`;
}

/** Menos que isto de prazo sobrando: nem tenta de novo (o motor espera a resposta). */
const TEMPO_MINIMO_NOVA_TENTATIVA_MS = 5_000;

const FALHAS_DO_PROCESSO = new Set(["autenticacao", "limite", "nao_encontrado", "tempo"]);

/**
 * O analista pelo Claude Code do plano da pessoa (`claude -p`): mesmo prompt, mesmas
 * ferramentas de leitura (pela ponte MCP), saída validada contra a PropostaAgente. Só
 * propõe — nenhuma ferramenta envia ordem e as nativas do CLI ficam desligadas.
 */
export class AnalistaCli {
  readonly #executor: ExecutorClaude;
  readonly #deps: DependenciasFerramentas;
  readonly #tempoMs: number;
  readonly #agora: () => Date;
  readonly #limiar: number | undefined;
  readonly #fuso: string | undefined;

  constructor(o: {
    readonly executor: ExecutorClaude;
    readonly dependencias: DependenciasFerramentas;
    readonly tempoMs: number;
    readonly agora?: () => Date;
    /** Probabilidade mínima do cenário favorável (AGENTE_CENARIO_LIMIAR). */
    readonly limiarCenarios?: number;
    /** Fuso da hora no pedido (ZENTRADE_FUSO). */
    readonly fuso?: string;
  }) {
    this.#executor = o.executor;
    this.#deps = o.dependencias;
    this.#tempoMs = o.tempoMs;
    this.#agora = o.agora ?? (() => new Date());
    this.#limiar = o.limiarCenarios;
    this.#fuso = o.fuso;
  }

  async analisar(pedido: PedidoAnalise, opcoes: OpcoesAnalise): Promise<RespostaAnalise> {
    const inicio = Date.now();
    const registro = new RegistroFontes();
    const agora = this.#agora();
    const previo = await buscarContextoPrevio(pedido, opcoes.usuarioId, this.#deps, agora);
    const entrada = mensagemDoPedido(pedido, agora, { previo, fuso: this.#fuso ?? this.#deps.fuso });
    const primeira = await this.#executar(pedido, opcoes, registro, entrada);
    const lida = lerPropostaCli(primeira.resultado);
    if (lida.ok) return this.#resposta(lida.proposta, pedido, registro, primeira);
    if (lida.erroDeFormato === undefined)
      return { proposta: aguardar(lida.motivo), custoUsd: custoDe(primeira) };

    // Uma nova tentativa, com o erro da validação, no tempo que sobrou; se falhar de novo, aguardar.
    const resta = this.#tempoMs - (Date.now() - inicio);
    if (resta < TEMPO_MINIMO_NOVA_TENTATIVA_MS)
      return {
        proposta: aguardar(`${lida.motivo} Sem tempo para nova tentativa.`),
        custoUsd: custoDe(primeira),
      };
    const segunda = await this.#executar(
      pedido,
      opcoes,
      registro,
      entradaDeCorrecao(entrada, primeira.resultado, lida.erroDeFormato),
      resta,
    );
    const custo = custoDe(primeira).plus(custoDe(segunda));
    const lida2 = lerPropostaCli(segunda.resultado);
    if (lida2.ok) return { ...this.#resposta(lida2.proposta, pedido, registro, segunda), custoUsd: custo };
    const motivo =
      lida2.erroDeFormato !== undefined ? motivoFormatoInvalido(lida2.erroDeFormato) : lida2.motivo;
    return { proposta: aguardar(motivo), custoUsd: custo };
  }

  #resposta(
    gerada: PropostaGerada,
    pedido: PedidoAnalise,
    registro: RegistroFontes,
    exec: ExecucaoCli,
  ): RespostaAnalise {
    return { proposta: finalizarProposta(gerada, pedido, registro, this.#limiar), custoUsd: custoDe(exec) };
  }

  /** Uma execução do `claude -p`. Falha do processo (login, limite, prazo) sobe como erro. */
  async #executar(
    pedido: PedidoAnalise,
    opcoes: OpcoesAnalise,
    registro: RegistroFontes,
    entrada: string,
    tempoMs: number = this.#tempoMs,
  ): Promise<ExecucaoCli> {
    const contexto = {
      pedido,
      usuarioId: opcoes.usuarioId,
      registro,
      ...(opcoes.orcamento ? { orcamento: opcoes.orcamento } : {}),
    };
    const exec = await this.#executor.executar({
      usuarioId: opcoes.usuarioId,
      ferramentas: ferramentasDaAnalise(contexto, this.#deps, opcoes.aoUsarFerramenta),
      instrucoes: SYSTEM_PROMPT,
      entrada,
      modelo: opcoes.modelo ?? null,
      contaId: opcoes.contaCli ?? null,
      tempoMs,
      modo: { tipo: "analise", esquema: ESQUEMA_PROPOSTA },
      ...(opcoes.signal ? { sinal: opcoes.signal } : {}),
    });
    if (exec.falha && (FALHAS_DO_PROCESSO.has(exec.falha.codigo) || !exec.resultado)) {
      throw new ErroClaudeCli(exec.falha.codigo, exec.falha.mensagem, exec.falha.detalhe);
    }
    return exec;
  }
}

const custoDe = (exec: ExecucaoCli) => dec(String(exec.resultado?.total_cost_usd ?? 0));

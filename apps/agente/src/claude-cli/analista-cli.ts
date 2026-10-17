import {
  PropostaAgenteEsquema,
  type PedidoAnalise,
  type PropostaAgente,
  type RespostaAnalise,
} from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { z } from "zod";
import { aguardar, semFontesInventadas, type OpcoesAnalise } from "../analista.js";
import { ferramentasDaAnalise, RegistroFontes, type DependenciasFerramentas } from "../ferramentas/index.js";
import { mensagemDoPedido, SYSTEM_PROMPT } from "../prompt.js";
import type { ExecutorClaude } from "./executor.js";
import { lerJson, type ResultadoCli } from "./resultado.js";

/** O esquema que vai em `--json-schema`: a mesma PropostaAgente que o provedor "api" usa. */
const { $schema: _versao, ...ESQUEMA_PROPOSTA } = z.toJSONSchema(PropostaAgenteEsquema) as Record<
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

/**
 * Do "result" do CLI para a proposta: qualquer coisa fora do esquema (Zod) vira "aguardar"
 * com o motivo — o pior caso é não operar, nunca operar com proposta torta.
 */
export function propostaDoResultado(r: ResultadoCli | null, registro: RegistroFontes): PropostaAgente {
  if (!r) return aguardar("O Claude Code não devolveu um resultado legível. Sem proposta, aguardar.");
  const parada = PARADAS[r.subtype];
  if (parada) return aguardar(parada);
  if (r.is_error || r.subtype !== "success") {
    return aguardar(`O Claude Code parou com erro (${r.subtype}). Por segurança, aguardar.`);
  }
  const lida = PropostaAgenteEsquema.safeParse(r.structured_output ?? lerJson(r.result ?? ""));
  if (!lida.success) {
    const problemas = lida.error.issues
      .map((i) => `${i.path.join(".") || "proposta"}: ${i.message}`)
      .join("; ");
    return aguardar(
      `A proposta do Claude Code veio fora do esquema (${problemas}). Sem proposta válida, aguardar.`,
    );
  }
  return semFontesInventadas(lida.data, registro);
}

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

  constructor(o: {
    readonly executor: ExecutorClaude;
    readonly dependencias: DependenciasFerramentas;
    readonly tempoMs: number;
    readonly agora?: () => Date;
  }) {
    this.#executor = o.executor;
    this.#deps = o.dependencias;
    this.#tempoMs = o.tempoMs;
    this.#agora = o.agora ?? (() => new Date());
  }

  async analisar(pedido: PedidoAnalise, opcoes: OpcoesAnalise): Promise<RespostaAnalise> {
    const registro = new RegistroFontes();
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
      entrada: mensagemDoPedido(pedido, this.#agora()),
      modelo: opcoes.modelo ?? null,
      contaId: opcoes.contaCli ?? null,
      tempoMs: this.#tempoMs,
      modo: { tipo: "analise", esquema: ESQUEMA_PROPOSTA },
      ...(opcoes.signal ? { sinal: opcoes.signal } : {}),
    });
    if (exec.falha && (FALHAS_DO_PROCESSO.has(exec.falha.codigo) || !exec.resultado)) {
      throw new ErroClaudeCli(exec.falha.codigo, exec.falha.mensagem, exec.falha.detalhe);
    }
    const custo = exec.resultado?.total_cost_usd ?? 0;
    return { proposta: propostaDoResultado(exec.resultado, registro), custoUsd: dec(String(custo)) };
  }
}

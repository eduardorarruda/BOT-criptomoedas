import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";

/**
 * Uma ferramenta SÓ DE LEITURA, independente de quem a chama: o Tool Runner do SDK da
 * Anthropic (provedor "api") ou o Claude Code pela ponte MCP (provedor "cli"). A mesma
 * definição, a mesma validação (Zod) e o mesmo código rodam nos dois caminhos.
 */
export interface FerramentaLeitura {
  readonly nome: string;
  readonly descricao: string;
  readonly entrada: z.ZodObject;
  /** Recebe a entrada já validada pelo esquema; devolve texto (JSON) para o modelo. */
  rodar(entrada: Record<string, unknown>): Promise<string> | string;
}

/** Avisado a cada ferramenta chamada, antes de rodar (passo a passo ao vivo). */
export type AoUsarFerramenta = (nome: string, entrada: Record<string, unknown>) => void;

export function definirFerramenta<E extends z.ZodObject>(f: {
  readonly nome: string;
  readonly descricao: string;
  readonly entrada: E;
  rodar(entrada: z.output<E>): Promise<string> | string;
}): FerramentaLeitura {
  return f as unknown as FerramentaLeitura;
}

/** As mesmas ferramentas, avisando `aoUsar` antes de cada chamada. */
export function observar(
  lista: readonly FerramentaLeitura[],
  aoUsar?: AoUsarFerramenta,
): FerramentaLeitura[] {
  if (!aoUsar) return [...lista];
  return lista.map((f) => ({
    ...f,
    rodar: (entrada) => {
      aoUsar(f.nome, entrada);
      return f.rodar(entrada);
    },
  }));
}

/** Para o Tool Runner do SDK da Anthropic (que valida a entrada com o mesmo Zod). */
export function paraAnthropic(f: FerramentaLeitura): BetaRunnableTool {
  return betaZodTool({
    name: f.nome,
    description: f.descricao,
    inputSchema: f.entrada,
    run: async (e) => f.rodar(e as Record<string, unknown>),
  }) as BetaRunnableTool;
}

/** Esquema JSON da entrada (o que a ponte MCP anuncia ao Claude Code). */
export function esquemaJson(f: FerramentaLeitura): { type: "object"; [chave: string]: unknown } {
  const { $schema: _s, ...esquema } = z.toJSONSchema(f.entrada, { io: "input" }) as Record<string, unknown>;
  return { ...esquema, type: "object" };
}

export interface ResultadoFerramenta {
  readonly ok: boolean;
  readonly texto: string;
}

/**
 * Roda pela ponte MCP: valida a entrada que veio de fora e nunca deixa uma exceção
 * vazar detalhe interno — o modelo recebe uma frase curta e a resposta segue.
 */
export async function executarFerramenta(
  f: FerramentaLeitura,
  bruta: unknown,
  aoFalhar: (erro: unknown, nome: string) => void = () => undefined,
): Promise<ResultadoFerramenta> {
  const lida = f.entrada.safeParse(bruta ?? {});
  if (!lida.success) {
    const problemas = lida.error.issues.map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`);
    return { ok: false, texto: `Entrada inválida para ${f.nome}: ${problemas.join("; ")}` };
  }
  try {
    return { ok: true, texto: await f.rodar(lida.data as Record<string, unknown>) };
  } catch (erro) {
    aoFalhar(erro, f.nome);
    return {
      ok: false,
      texto: `A ferramenta ${f.nome} falhou agora. Siga sem esses dados e diga isso na resposta.`,
    };
  }
}

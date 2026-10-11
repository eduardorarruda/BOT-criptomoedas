import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Formato de exportação do n8n, só com o que os testes conferem. */
export interface NoN8n {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly typeVersion: number;
  readonly position: readonly [number, number];
  readonly parameters: Record<string, unknown>;
  readonly credentials?: Record<string, { readonly id: string; readonly name: string }>;
  readonly webhookId?: string;
  readonly onError?: string;
  readonly alwaysOutputData?: boolean;
}

export interface Ligacao {
  readonly node: string;
  readonly type: string;
  readonly index: number;
}

export interface FluxoN8n {
  readonly name: string;
  readonly nodes: readonly NoN8n[];
  readonly connections: Record<string, { readonly main: readonly (readonly Ligacao[])[] }>;
  readonly settings: Record<string, unknown>;
  readonly active: boolean;
}

export interface ArquivoFluxo {
  readonly arquivo: string;
  readonly texto: string;
  readonly fluxo: FluxoN8n;
}

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const PASTA_FLUXOS = join(RAIZ, "infra/n8n/fluxos");

export function carregarFluxos(): ArquivoFluxo[] {
  return readdirSync(PASTA_FLUXOS)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((arquivo) => {
      const texto = readFileSync(join(PASTA_FLUXOS, arquivo), "utf8");
      return { arquivo, texto, fluxo: JSON.parse(texto) as FluxoN8n };
    });
}

export function carregarFluxo(nome: string): FluxoN8n {
  const achado = carregarFluxos().find((a) => a.fluxo.name === nome);
  if (!achado) throw new Error(`fluxo ${nome} não encontrado em ${PASTA_FLUXOS}`);
  return achado.fluxo;
}

export function no(fluxo: FluxoN8n, nome: string): NoN8n {
  const achado = fluxo.nodes.find((n) => n.name === nome);
  if (!achado) throw new Error(`nó "${nome}" não existe no fluxo ${fluxo.name}`);
  return achado;
}

export function codigoDo(fluxo: FluxoN8n, nome: string): string {
  const codigo = no(fluxo, nome).parameters.jsCode;
  if (typeof codigo !== "string") throw new Error(`nó "${nome}" não é um nó Code com jsCode`);
  return codigo;
}

/** Nós ligados à saída `saida` de `origem`. */
export function seguintes(fluxo: FluxoN8n, origem: string, saida = 0): string[] {
  return (fluxo.connections[origem]?.main[saida] ?? []).map((l) => l.node);
}

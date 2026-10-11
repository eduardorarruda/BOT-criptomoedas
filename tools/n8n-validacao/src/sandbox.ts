import { createHmac } from "node:crypto";
import { runInNewContext } from "node:vm";

/**
 * Executa o JavaScript de um nó Code do n8n (modo "uma vez para todos os itens")
 * fora do n8n, com o mínimo do ambiente que os fluxos do ZenTrade usam:
 * `$input`, `$('Nó')`, `$getWorkflowStaticData` e um relógio fixo.
 */
export interface Item {
  readonly json: Record<string, unknown>;
}

export interface AmbienteCodigo {
  readonly entrada?: readonly Item[];
  /** Saída de outros nós, para `$('Nome do nó')`. */
  readonly nos?: Record<string, readonly Item[]>;
  readonly agoraMs: number;
  readonly estado?: Record<string, unknown>;
}

const itens = (lista: readonly Item[]) => ({
  first: () => lista[0],
  last: () => lista[lista.length - 1],
  all: () => [...lista],
});

function relogioFixo(agoraMs: number): DateConstructor {
  const Original = Date;
  class DataFixa extends Original {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(agoraMs);
      else super(...(args as [string | number]));
    }
    static override now(): number {
      return agoraMs;
    }
  }
  return DataFixa as unknown as DateConstructor;
}

export async function executarCodigo(codigo: string, amb: AmbienteCodigo): Promise<Item[]> {
  const estado = amb.estado ?? {};
  const contexto = {
    $input: itens(amb.entrada ?? []),
    $: (nome: string) => {
      const saida = amb.nos?.[nome];
      if (!saida) throw new Error(`o código pediu a saída do nó "${nome}", que o teste não forneceu`);
      return itens(saida);
    },
    $getWorkflowStaticData: (tipo: string) => {
      if (tipo !== "global") throw new Error("os fluxos só usam dados estáticos globais");
      return estado;
    },
    Date: relogioFixo(amb.agoraMs),
    Intl,
  };
  const resultado: unknown = await runInNewContext(`(async () => {\n${codigo}\n})()`, contexto, {
    timeout: 2000,
  });
  // Atravessa a fronteira do contexto isolado: objetos voltam com protótipos locais.
  return JSON.parse(JSON.stringify(resultado ?? [])) as Item[];
}

/** O que o nó Crypto (ação hmac, SHA256, hex) faz com o item: grava o HMAC num campo. */
export function noCryptoHmac(item: Item, campoValor: string, campoDestino: string, segredo: string): Item {
  const valor = item.json[campoValor];
  const texto = typeof valor === "string" ? valor : "";
  const hmac = createHmac("SHA256", segredo).update(texto).digest("hex");
  return { json: { ...item.json, [campoDestino]: hmac } };
}

import { z } from "zod";
import { REPLAY_P1 } from "./p1.js";

const DIA_MS = 86_400_000;
/** O modelo não pode "lembrar" o que aconteceu: a janela começa depois do corte de conhecimento. */
export const CORTE_CONHECIMENTO_PADRAO = "2026-07-01";

const Data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD")
  .refine((t) => !Number.isNaN(Date.parse(`${t}T00:00:00Z`)), "data que não existe");

const Esquema = z.object({
  execucao: z.string().min(1).max(80).default(REPLAY_P1.nome),
  inicio: Data.default(REPLAY_P1.inicio),
  fim: Data.default(REPLAY_P1.fim),
  corte: Data.default(CORTE_CONHECIMENTO_PADRAO),
  maximo: z.coerce.number().int().min(1).max(1000).default(REPLAY_P1.maximo),
  custoMaximoUsd: z.coerce.number().positive().max(1000).default(REPLAY_P1.custoMaximoUsd),
  paralelo: z.coerce.number().int().min(1).max(4).default(2),
  cache: z.string().min(1).default("replay-cache"),
  saida: z.string().min(1).optional(),
  dadosAte: z.iso.datetime().optional(),
  confirmar: z.boolean(),
  soRelatorio: z.boolean(),
});

export type ArgumentosReplay = z.infer<typeof Esquema> & {
  /** Início da janela em ms UTC (00:00). */
  readonly inicioMs: number;
  /** Fim da janela em ms UTC, exclusivo: o dia `fim` inteiro entra. */
  readonly fimMs: number;
};

const FLAGS = new Set(["confirmar", "so-relatorio"]);
const paraCamelCase = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** `--chave valor` e as chaves sozinhas (`--confirmar`, `--so-relatorio`). */
export function lerArgumentosReplay(argv: readonly string[]): ArgumentosReplay {
  const bruto: Record<string, string | boolean> = { confirmar: false, soRelatorio: false };
  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i];
    if (!atual?.startsWith("--")) continue;
    const nome = atual.slice(2);
    if (FLAGS.has(nome)) {
      bruto[paraCamelCase(nome)] = true;
      continue;
    }
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith("--")) throw new Error(`--${nome} precisa de um valor`);
    bruto[paraCamelCase(nome)] = valor;
    i++;
  }
  const lido = Esquema.safeParse(bruto);
  if (!lido.success)
    throw new Error(lido.error.issues.map((i) => `--${i.path.join(".")}: ${i.message}`).join("; "));
  const a = lido.data;
  const inicioMs = Date.parse(`${a.inicio}T00:00:00Z`);
  const fimMs = Date.parse(`${a.fim}T00:00:00Z`) + DIA_MS;
  if (inicioMs < Date.parse(`${a.corte}T00:00:00Z`))
    throw new Error(
      `a janela começa em ${a.inicio}, antes do corte de conhecimento do modelo (${a.corte}): ele poderia lembrar o que aconteceu. Comece em ${a.corte} ou depois.`,
    );
  if (fimMs <= inicioMs) throw new Error("--fim precisa ser depois de --inicio");
  return { ...a, inicioMs, fimMs };
}

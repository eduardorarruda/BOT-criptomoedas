import { dec, type Valor } from "@zentrade/dominio";
import { basename } from "node:path";
import { z } from "zod";
import { expandirCaminhos } from "./arquivo-negocios.js";
import { avisarRetencao, escreverIgnoradas, meiaNoiteB3, quando } from "./comandos.js";
import { substituirCandlesB3, type CandlesSubstituiveis } from "./importar.js";
import { lerArquivoNegocios, type DiaDeNegocios, type LeituraCompleta } from "./negocios-dia.js";
import type { IntervaloB3 } from "./pregao.js";
import { AJUSTES_ROLAGEM, montarSerie, type DiaMontado, type Rolagem } from "./rolagem.js";

/**
 * `importar-negocios-b3 --arquivos <caminhos ou padrão...> [--simbolo WIN] [--ajuste nenhum|diferenca]`:
 * lê os arquivos "Negócio a negócio" de derivativos da B3 (baixados à mão no BDI), monta
 * as velas de 5m do contrato cheio de cada dia e grava como `WIN` (mais 15m e 1h),
 * trocando o que já havia em cada pregão importado.
 */
export interface DependenciasImportacaoNegocios {
  readonly banco: CandlesSubstituiveis;
  readonly agora: () => number;
  readonly escrever: (linha: string) => void;
  /** De onde vale um caminho relativo (o comando usa INIT_CWD, a pasta em que o pnpm foi chamado). */
  readonly base: string;
  /** As linhas de um arquivo, do começo, em blocos (o comando usa `blocosDoArquivo`). */
  readonly blocos: (caminho: string) => AsyncIterable<readonly string[]>;
  /** Confere que o caminho é um arquivo aceito (o comando usa `conferirArquivoNegocios`). */
  readonly conferir: (caminho: string) => Promise<void>;
}

export interface ResumoDiaNegocios {
  readonly data: string;
  readonly contrato: string;
  /** Do contrato escolhido, na sessão regular do dia inteiro. */
  readonly quantidade: number;
  readonly negocios: number;
  /** Negócios que entraram nas velas (só os do pregão regular). */
  readonly negociosUsados: number;
  readonly foraDoPregao: number;
  readonly gravados: Partial<Record<IntervaloB3, number>>;
  readonly primeiro?: number;
  readonly ultimo?: number;
  readonly minima: string;
  readonly maxima: string;
  /** Fechamento da última vela de 5m. */
  readonly fecha: string;
  /** Último negócio do dia, com o leilão de fechamento (sem ajuste de rolagem). */
  readonly ultimoDoDia: string;
  readonly deslocamentoMil: number;
}

export interface ResumoImportacaoNegocios {
  readonly dias: readonly ResumoDiaNegocios[];
  readonly rolagens: readonly Rolagem[];
}

const DIA = 86_400_000;

/** `--chave v1 v2 …`: cada chave com a lista dos valores até a próxima; `--` sozinho é ignorado. */
export function lerArgumentosComLista(argv: readonly string[]): Record<string, string[]> {
  const args: Record<string, string[]> = {};
  let chave: string | undefined;
  for (const t of argv) {
    if (t === "--") continue;
    if (t.startsWith("--")) {
      chave = t.slice(2);
      args[chave] = args[chave] ?? [];
    } else if (chave !== undefined) args[chave] = [...(args[chave] ?? []), t];
  }
  return args;
}

const Args = z.object({
  arquivos: z
    .array(z.string().min(1), { error: "informe os arquivos em --arquivos" })
    .min(1, "informe os arquivos em --arquivos"),
  simbolo: z
    .enum(["WIN"], { error: "--simbolo aceita WIN (o arquivo de negócios é do contrato)" })
    .default("WIN"),
  ajuste: z
    .enum(AJUSTES_ROLAGEM, { error: `--ajuste aceita ${AJUSTES_ROLAGEM.join(", ")}` })
    .default("nenhum"),
});

function argumentos(argv: readonly string[]): z.infer<typeof Args> {
  const lista = lerArgumentosComLista(argv);
  const um = (nome: string) => {
    const v = lista[nome];
    if (v !== undefined && v.length !== 1) throw new RangeError(`--${nome} aceita um valor só`);
    return v?.[0];
  };
  const lido = Args.safeParse({ arquivos: lista["arquivos"], simbolo: um("simbolo"), ajuste: um("ajuste") });
  if (!lido.success) throw new RangeError(lido.error.issues[0]?.message ?? "argumentos inválidos");
  return lido.data;
}

const numero = (n: number) => n.toLocaleString("pt-BR");
const contar = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
const pontos = (v: Valor | number) =>
  Number(v.toString()).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const comSinal = (mil: number) => `${mil > 0 ? "+" : ""}${pontos(mil / 1000)}`;

function resumoArquivo(nome: string, l: LeituraCompleta): string {
  const partes = [
    `${nome}: ${contar(l.linhas, "linha", "linhas")}`,
    `pregão ${l.dias.map((d) => d.data).join(", ") || "nenhum com WIN"}`,
    `${contar(l.cancelados, "negócio cancelado", "negócios cancelados")} (lido ${l.passadas === 2 ? "2 vezes" : "1 vez"})`,
    `${contar(l.outraSessao, "negócio do after hours ignorado", "negócios do after hours ignorados")}`,
    contar(l.totalIgnoradas, "linha ignorada", "linhas ignoradas"),
  ];
  return partes.join(", ");
}

/** Lê os arquivos (um de cada vez, em stream) e junta os pregões; o mesmo dia duas vezes é engano. */
async function lerTodos(
  caminhos: readonly string[],
  d: DependenciasImportacaoNegocios,
): Promise<DiaDeNegocios[]> {
  const origem = new Map<string, string>();
  const dias: DiaDeNegocios[] = [];
  for (const caminho of caminhos) {
    const nome = basename(caminho);
    d.escrever(`lendo ${nome}…`);
    const leitura = await lerArquivoNegocios(() => d.blocos(caminho));
    d.escrever(resumoArquivo(nome, leitura));
    escreverIgnoradas(leitura.ignoradas, d.escrever);
    for (const dia of leitura.dias) {
      const antes = origem.get(dia.data);
      if (antes)
        throw new RangeError(
          `o pregão de ${dia.data} aparece em dois arquivos (${antes} e ${nome}); passe um só`,
        );
      origem.set(dia.data, nome);
      dias.push(dia);
    }
  }
  return dias;
}

function linhaRolagem(r: Rolagem): string {
  const medida =
    r.diferencaMil === null
      ? "diferença desconhecida (os dois contratos não fecharam um mesmo pregão destes arquivos; o ajuste ignora esta rolagem)"
      : `diferença de ${comSinal(r.diferencaMil)} pontos (fechamentos de ${r.referencia})`;
  return `rolagem em ${r.data}: ${r.de} → ${r.para}, ${medida}`;
}

function extremos(dia: DiaMontado) {
  const lista = dia.candles;
  const primeiro = lista[0];
  return {
    minima: lista.reduce((m, k) => (k.minima.lt(m) ? k.minima : m), primeiro?.minima ?? dec(0)).toString(),
    maxima: lista.reduce((m, k) => (k.maxima.gt(m) ? k.maxima : m), primeiro?.maxima ?? dec(0)).toString(),
    fecha: (lista.at(-1)?.fecha ?? dec(0)).toString(),
  };
}

async function gravarDia(
  dia: DiaMontado,
  d: DependenciasImportacaoNegocios,
  simbolo: "WIN",
): Promise<ResumoDiaNegocios> {
  const inicio = meiaNoiteB3(dia.data);
  const r = await substituirCandlesB3(d.banco, simbolo, "5m", { inicio, fim: inicio + DIA }, dia.candles, {
    agora: d.agora(),
  });
  const c = dia.contrato;
  return {
    data: dia.data,
    contrato: c.instrumento,
    quantidade: c.quantidade,
    negocios: c.negocios,
    negociosUsados: c.negociosNoPregao,
    foraDoPregao: c.negociosForaDoPregao,
    gravados: r.gravados,
    ...(r.primeiro === undefined ? {} : { primeiro: r.primeiro }),
    ...(r.ultimo === undefined ? {} : { ultimo: r.ultimo }),
    ...extremos(dia),
    ultimoDoDia: dec(c.ultimoMil).div(1000).toString(),
    deslocamentoMil: dia.deslocamentoMil,
  };
}

function escreverDia(r: ResumoDiaNegocios, outros: string, escrever: (l: string) => void): void {
  escrever(
    `${r.data}: ${r.contrato} (${numero(r.quantidade)} contratos em ${contar(r.negocios, "negócio", "negócios")}${outros})`,
  );
  escrever(
    `  velas: 5m ${r.gravados["5m"] ?? 0} · 15m ${r.gravados["15m"] ?? 0} · 1h ${r.gravados["1h"] ?? 0}; ${contar(r.negociosUsados, "negócio usado", "negócios usados")} do pregão, ${numero(r.foraDoPregao)} fora dele (leilão de fechamento e depois das 18:25)`,
  );
  if (r.primeiro !== undefined && r.ultimo !== undefined)
    escrever(
      `  de ${quando(r.primeiro).slice(11)} a ${quando(r.ultimo).slice(11)} (Brasília) · mínima ${pontos(dec(r.minima))} · máxima ${pontos(dec(r.maxima))} · fecha ${pontos(dec(r.fecha))} · último negócio do dia, com o leilão: ${pontos(dec(r.ultimoDoDia))}`,
    );
  if (r.deslocamentoMil !== 0)
    escrever(`  preços do dia deslocados em ${comSinal(r.deslocamentoMil)} pontos (ajuste de rolagem)`);
}

const outrosContratos = (dia: DiaDeNegocios | undefined, escolhido: string) => {
  const outros = (dia?.contratos ?? []).filter((c) => c.instrumento !== escolhido);
  return outros.length === 0
    ? ""
    : `; também ${outros.map((c) => `${c.instrumento}: ${numero(c.quantidade)}`).join(", ")}`;
};

export async function executarImportacaoNegocios(
  argv: readonly string[],
  d: DependenciasImportacaoNegocios,
): Promise<ResumoImportacaoNegocios> {
  const a = argumentos(argv);
  const caminhos = await expandirCaminhos(a.arquivos, d.base);
  for (const c of caminhos) await d.conferir(c);
  const lidos = await lerTodos(caminhos, d);
  const serie = montarSerie(lidos, a.ajuste);
  const primeiro = serie.dias[0];
  if (!primeiro)
    throw new RangeError(
      "nenhum negócio de contrato futuro do WIN nos arquivos: confira se são os de derivativos (_DRV)",
    );
  avisarRetencao(meiaNoiteB3(primeiro.data), d.agora(), d.escrever);
  serie.rolagens.forEach((r) => d.escrever(linhaRolagem(r)));
  const dias: ResumoDiaNegocios[] = [];
  for (const dia of serie.dias) {
    const r = await gravarDia(dia, d, a.simbolo);
    escreverDia(
      r,
      outrosContratos(
        lidos.find((x) => x.data === dia.data),
        r.contrato,
      ),
      d.escrever,
    );
    dias.push(r);
  }
  d.escrever(
    a.ajuste === "nenhum"
      ? "ajuste de rolagem: nenhum (cada dia com os preços do próprio contrato; veja docs/dados-b3.md)"
      : "ajuste de rolagem: diferenca (dias antes de cada rolagem deslocados; o último contrato fica com os preços de verdade)",
  );
  return { dias, rolagens: serie.rolagens };
}

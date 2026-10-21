import {
  EstrategiaEsquema,
  estrategiaDoDTO,
  Id,
  Intervalo,
  LimitesRiscoEsquema,
  ModoRobo,
  Rede,
  type RoboConfig,
} from "@zentrade/contratos";
import { dec, validarEstrategia, type Estrategia } from "@zentrade/dominio";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { USUARIO_LOCAL } from "./usuario-local.js";

const RoboArquivo = z.object({
  id: Id,
  /** Opcional: a dona no banco, se o robô do arquivo espelhar um robô de verdade. */
  usuarioId: z.uuid().default(USUARIO_LOCAL),
  nome: z.string().min(1).max(80),
  simbolo: z.string().regex(/^[A-Z0-9]{5,20}$/, "use o par em maiúsculas, ex.: BTCUSDT"),
  intervalo: Intervalo,
  modo: ModoRobo,
  rede: Rede,
  estrategia: EstrategiaEsquema.omit({ id: true, nome: true, versao: true }),
  limites: LimitesRiscoEsquema,
  pausado: z.boolean().default(false),
});
type RoboArquivo = z.infer<typeof RoboArquivo>;

export interface RobosCarregados {
  readonly robos: RoboConfig[];
  readonly pausados: string[];
}

function paraConfig(r: RoboArquivo): RoboConfig {
  const estrategia: Estrategia = estrategiaDoDTO(r.estrategia);
  const problemas = validarEstrategia(estrategia);
  if (problemas.length > 0)
    throw new Error(`O robô ${r.id} tem estratégia inválida: ${problemas.join("; ")}.`);
  const l = r.limites;
  return {
    id: r.id,
    usuarioId: r.usuarioId,
    simbolo: r.simbolo,
    intervalo: r.intervalo,
    modo: r.modo,
    rede: r.rede,
    estrategia,
    limites: {
      perdaDiariaMaxima: dec(l.perdaDiariaMaxima),
      exposicaoMaxima: dec(l.exposicaoMaxima),
      ordensPorHoraMax: l.ordensPorHoraMax,
      pausaAposPerdaMs: l.pausaAposPerdaMin * 60_000,
      confiancaMinima: l.confiancaMinima,
      diasDeEvento: l.diasDeEvento,
    },
    riscoPorOperacao: dec(l.riscoPorOperacao),
  };
}

function validarConjunto(robos: readonly RoboArquivo[], rede: "papel" | "testnet"): void {
  const ids = robos.map((r) => r.id);
  const repetido = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repetido)
    throw new Error(`O id de robô "${repetido}" está repetido no arquivo; cada robô precisa de um id único.`);
  const real = robos.find((r) => r.rede === "real");
  if (real)
    throw new Error(
      `O robô ${real.id} está na rede real; dinheiro real não liga por arquivo de desenvolvimento.`,
    );
  const outra = robos.find((r) => r.rede !== rede);
  if (outra)
    throw new Error(
      `O robô ${outra.id} é da rede "${outra.rede}", mas o motor está em ${rede} (uma fonte só de preço). Ajuste MOTOR_REDE ou o robô.`,
    );
}

/** Lista de robôs em JSON (formato próximo do RoboDTO, com estratégia embutida), validada com Zod. */
export function robosDoJson(texto: string, rede: "papel" | "testnet"): RobosCarregados {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (erro) {
    throw new Error(`O arquivo de robôs não é JSON válido (${(erro as Error).message}).`, { cause: erro });
  }
  const r = z.array(RoboArquivo).safeParse(bruto);
  if (!r.success) {
    const linhas = r.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`O arquivo de robôs tem campos inválidos:\n${linhas.join("\n")}`);
  }
  validarConjunto(r.data, rede);
  return { robos: r.data.map(paraConfig), pausados: r.data.filter((x) => x.pausado).map((x) => x.id) };
}

export async function carregarRobos(caminho: string, rede: "papel" | "testnet"): Promise<RobosCarregados> {
  let texto: string;
  try {
    texto = await readFile(caminho, "utf8");
  } catch (erro) {
    throw new Error(`Não deu para ler o arquivo de robôs em ${caminho}: confira MOTOR_ROBOS_ARQUIVO.`, {
      cause: erro,
    });
  }
  return robosDoJson(texto, rede);
}

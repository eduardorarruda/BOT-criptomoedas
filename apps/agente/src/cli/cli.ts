import { parseArgs } from "node:util";
import { ClienteApi, configDaApi, ErroApi, NovoBacktestEsquema } from "../api/cliente-api.js";
import {
  explicarDecisao,
  formatarBacktest,
  formatarDecisoes,
  formatarResumo,
} from "../apresentacao/formatar.js";

export interface AmbienteCli {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly saida: { write(texto: string): unknown };
  readonly erro: { write(texto: string): unknown };
  readonly perguntar: (pergunta: string) => Promise<string>;
}

const OK = 0;
const FALHA = 1;
const USO = 2;

export const AJUDA = `Uso: zentrade <comando> [opções]

  zentrade status                      resumo do dia e estado da parada total
  zentrade decisoes [--robo ID] [--limite N]
                                       últimas decisões (mais recentes primeiro)
  zentrade explicar <decisaoId>        por que o robô decidiu o que decidiu
  zentrade pausar-tudo                 liga a parada total (nenhuma entrada nova)
  zentrade retomar-tudo                desliga a parada total (pede confirmação)
  zentrade backtest --estrategia ID --versao N --simbolo BTCUSDT --intervalo 1h
                    --inicio AAAA-MM-DD --fim AAAA-MM-DD
                                       agenda um backtest
  zentrade backtest <id>               mostra o resultado de um backtest

Variáveis: ZENTRADE_API_URL (padrão http://localhost:8080) e ZENTRADE_TOKEN.
`;

class ErroUso extends Error {}

const OPCOES = {
  robo: { type: "string" },
  limite: { type: "string" },
  estrategia: { type: "string" },
  versao: { type: "string" },
  simbolo: { type: "string" },
  intervalo: { type: "string" },
  inicio: { type: "string" },
  fim: { type: "string" },
  ajuda: { type: "boolean", short: "h" },
} as const;

type Valores = ReturnType<typeof parseArgs<{ options: typeof OPCOES; allowPositionals: true }>>["values"];

function inteiro(nome: string, valor: string | undefined): number | undefined {
  if (valor === undefined) return undefined;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1)
    throw new ErroUso(`--${nome} precisa ser um inteiro positivo (veio "${valor}").`);
  return n;
}

function data(nome: string, valor: string | undefined): number {
  const ms = valor === undefined ? Number.NaN : Date.parse(valor);
  if (Number.isNaN(ms))
    throw new ErroUso(`--${nome} precisa ser uma data AAAA-MM-DD (veio "${valor ?? ""}").`);
  return ms;
}

function exigir(nome: string, valor: string | undefined): string {
  if (!valor) throw new ErroUso(`Falta --${nome}. Veja: zentrade --ajuda`);
  return valor;
}

async function backtest(api: ClienteApi, id: string | undefined, v: Valores): Promise<string> {
  if (id) return formatarBacktest(await api.backtest(id));
  const lido = NovoBacktestEsquema.safeParse({
    estrategiaId: exigir("estrategia", v.estrategia),
    versao: inteiro("versao", exigir("versao", v.versao)),
    simbolo: exigir("simbolo", v.simbolo),
    intervalo: exigir("intervalo", v.intervalo),
    inicio: data("inicio", v.inicio),
    fim: data("fim", v.fim),
  });
  if (!lido.success) {
    const problemas = lido.error.issues.map((i) => `--${String(i.path[0])}: ${i.message}`).join("; ");
    throw new ErroUso(`Backtest inválido — ${problemas}.`);
  }
  const criado = await api.criarBacktest(lido.data);
  return `Backtest ${criado.id} agendado (${criado.estado}). Veja o resultado com: zentrade backtest ${criado.id}`;
}

async function retomar(api: ClienteApi, amb: AmbienteCli): Promise<string | null> {
  const resposta = await amb.perguntar(
    "Isto libera todos os robôs para operar. Para confirmar, digite RETOMAR: ",
  );
  if (resposta.trim() !== "RETOMAR") return null;
  await api.paradaTotal(false);
  return "Parada total desligada. Os robôs voltam a operar conforme o modo de cada um.";
}

async function comando(nome: string, args: string[], v: Valores, amb: AmbienteCli): Promise<number> {
  const api = new ClienteApi(configDaApi(amb.env));
  const escrever = (t: string) => amb.saida.write(`${t}\n`);
  switch (nome) {
    case "status":
      escrever(formatarResumo(await api.resumo()));
      return OK;
    case "decisoes": {
      const limite = inteiro("limite", v.limite);
      escrever(
        formatarDecisoes(
          await api.decisoes({ ...(v.robo ? { roboId: v.robo } : {}), ...(limite ? { limite } : {}) }),
        ),
      );
      return OK;
    }
    case "explicar":
      escrever(explicarDecisao(await api.decisao(exigir("decisaoId", args[0]))));
      return OK;
    case "pausar-tudo":
      await api.paradaTotal(true);
      escrever("Parada total LIGADA. Nenhuma entrada nova até alguém retomar; stop e alvo seguem valendo.");
      return OK;
    case "retomar-tudo": {
      const feito = await retomar(api, amb);
      escrever(feito ?? "Cancelado: a confirmação não bateu. Nada mudou.");
      return feito ? OK : FALHA;
    }
    case "backtest":
      escrever(await backtest(api, args[0], v));
      return OK;
    default:
      throw new ErroUso(`Comando desconhecido: "${nome}". Veja: zentrade --ajuda`);
  }
}

/** Ponto de entrada testável da CLI. Devolve o código de saída. */
export async function executarCli(argv: readonly string[], amb: AmbienteCli): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: OPCOES,
      allowPositionals: true,
      strict: true,
    });
    const [nome, ...resto] = positionals;
    if (values.ajuda || !nome || nome === "ajuda") {
      amb.saida.write(AJUDA);
      return OK;
    }
    return await comando(nome, resto, values, amb);
  } catch (e) {
    if (e instanceof ErroUso || (e instanceof TypeError && "code" in e)) {
      amb.erro.write(`${e.message}\n`);
      return USO;
    }
    if (e instanceof ErroApi) {
      amb.erro.write(`${e.message}\n`);
      return FALHA;
    }
    throw e;
  }
}

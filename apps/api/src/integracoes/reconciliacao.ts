import type {
  ConferenciaAtivo,
  DivergenciaGravada,
  ResultadoRegistro,
  RoboDoRetrato,
  UltimoFechamento,
} from "@zentrade/banco";
import type { PortaCredenciais, RedeConta, ResultadoReconciliacao } from "@zentrade/contratos";
import { ativosDoSimbolo, ErroLimiteRequisicoes } from "@zentrade/corretora";
import { conferirSaldo, dec, formatarNumero, type Valor } from "@zentrade/dominio";
import type { CentralAlertas } from "./alertas.js";
import { erroDaBinance, type FabricaConta } from "./binance-conta.js";
import type { Log } from "./tipos.js";

/** De quanto em quanto tempo a conferência roda sozinha (padrão: 10 min). */
export const INTERVALO_RECONCILIACAO_MS = 10 * 60_000;
/** Preço mais velho que isto não serve para medir poeira. */
const IDADE_PRECO_MS = 3_600_000;

export interface DependenciasReconciliacao {
  readonly banco: {
    readonly divergencias: {
      alvos(usuarioId?: string): Promise<{ usuarioId: string; rede: RedeConta }[]>;
      registrar(
        usuarioId: string,
        rede: RedeConta,
        conferencias: readonly ConferenciaAtivo[],
        agora: number,
      ): Promise<ResultadoRegistro>;
    };
    readonly riscoConta: {
      posicoes(usuarioId: string, rede: RedeConta, agora: number): Promise<readonly RoboDoRetrato[]>;
    };
    readonly mercado: {
      ultimosFechamentos(simbolos: readonly string[], desde: number): Promise<Map<string, UltimoFechamento>>;
    };
  };
  readonly credenciais: PortaCredenciais;
  readonly criarConta: FabricaConta;
  readonly alertas?: CentralAlertas;
  readonly agora: () => number;
  readonly log: Log;
}

export type ConferenciaConta = ResultadoReconciliacao["conferidas"][number];

export interface Reconciliador {
  /** Confere uma conta (pessoa + rede) agora: sob demanda ou pela rodada. */
  conferir(usuarioId: string, rede: RedeConta): Promise<ConferenciaConta>;
  /** Todas as contas da pessoa com robô em testnet ou real. */
  conferirPessoa(usuarioId: string): Promise<ResultadoReconciliacao>;
  /** Uma rodada por todas as contas; para no primeiro sinal de limite da Binance. */
  rodada(): Promise<void>;
  agendar(intervaloMs?: number): () => void;
}

/** O ativo-base do par; par com cotação desconhecida fica com o nome inteiro (não casa com nada). */
export function ativoBase(simbolo: string): string {
  try {
    return ativosDoSimbolo(simbolo).base;
  } catch {
    return simbolo;
  }
}

interface Esperado {
  readonly ativo: string;
  readonly simbolo: string;
  readonly quantidade: Valor;
}

/** Soma a posição dos robôs por ativo-base: dois robôs de BTC dividem o mesmo saldo. */
function esperadoPorAtivo(robos: readonly RoboDoRetrato[]): Esperado[] {
  const porAtivo = new Map<string, Esperado>();
  for (const r of robos.filter((x) => x.quantidade.gt(0))) {
    const ativo = ativoBase(r.simbolo);
    const atual = porAtivo.get(ativo);
    porAtivo.set(ativo, {
      ativo,
      simbolo: r.simbolo,
      quantidade: (atual?.quantidade ?? dec(0)).plus(r.quantidade),
    });
  }
  return [...porAtivo.values()];
}

function alertaDaDivergencia(usuarioId: string, d: DivergenciaGravada, agora: number) {
  return {
    tipo: "divergencia_saldo" as const,
    gravidade: "critico" as const,
    titulo: `Saldo de ${d.ativo} não bate com a corretora`,
    mensagem: `Os robôs registram ${formatarNumero(dec(d.esperado))} ${d.ativo} na ${d.rede}, mas a Binance tem ${formatarNumero(dec(d.naCorretora))} (livre + bloqueado). Faltam ${formatarNumero(dec(d.falta))}. Compras com ${d.ativo} ficam paradas; nada foi vendido nem comprado para corrigir. Veja em Risco → Divergências.`,
    chave: `divergencia_saldo:${d.id}`,
    usuarioId,
    em: agora,
  };
}

/**
 * Reconciliação com a corretora: compara a posição que os robôs derivam das execuções
 * com o saldo real (livre + bloqueado: o stop na corretora prende o ativo, mas ele
 * continua sendo da pessoa). Nunca opera para corrigir — só registra, pausa as compras
 * do ativo (barreira divergencia_saldo no motor) e avisa. Papel não tem o que conferir.
 */
export function criarReconciliador(d: DependenciasReconciliacao): Reconciliador {
  async function saldosDaCorretora(usuarioId: string, rede: RedeConta) {
    const credenciais = await d.credenciais.binance(usuarioId, rede);
    if (!credenciais) return null;
    const { saldos } = await d.criarConta(rede, credenciais).conta();
    return new Map(saldos.map((s) => [s.ativo, s]));
  }

  async function conferir(usuarioId: string, rede: RedeConta): Promise<ConferenciaConta> {
    const agora = d.agora();
    const esperados = esperadoPorAtivo(await d.banco.riscoConta.posicoes(usuarioId, rede, agora));
    if (esperados.length === 0) {
      // Sem posição não há o que faltar: fecha o que estiver aberto, sem chamar a Binance.
      await d.banco.divergencias.registrar(usuarioId, rede, [], agora);
      return { rede, ok: true, erro: null, ativos: 0, divergentes: 0 };
    }
    const saldos = await saldosDaCorretora(usuarioId, rede);
    if (!saldos)
      return {
        rede,
        ok: false,
        erro: `não há chave da Binance (${rede}) cadastrada em Contas e chaves`,
        ativos: esperados.length,
        divergentes: 0,
      };
    const precos = await d.banco.mercado.ultimosFechamentos(
      esperados.map((e) => e.simbolo),
      agora - IDADE_PRECO_MS,
    );
    const conferencias = esperados.map((e) => {
      const saldo = saldos.get(e.ativo);
      const preco = precos.get(e.simbolo)?.preco;
      return conferirSaldo({
        ativo: e.ativo,
        esperado: e.quantidade,
        livre: saldo?.livre ?? dec(0),
        bloqueado: saldo?.bloqueado ?? dec(0),
        preco: preco ? dec(preco) : null,
      });
    });
    const { novas } = await d.banco.divergencias.registrar(usuarioId, rede, conferencias, agora);
    for (const nova of novas) await d.alertas?.emitir(alertaDaDivergencia(usuarioId, nova, agora));
    return {
      rede,
      ok: true,
      erro: null,
      ativos: conferencias.length,
      divergentes: conferencias.filter((c) => c.divergente).length,
    };
  }

  async function conferirComErro(usuarioId: string, rede: RedeConta): Promise<ConferenciaConta> {
    try {
      return await conferir(usuarioId, rede);
    } catch (erro) {
      d.log.warn({ err: erro, usuarioId, rede }, "conferência com a corretora falhou");
      if (erro instanceof ErroLimiteRequisicoes) throw erro;
      return { rede, ok: false, erro: erroDaBinance(erro).message, ativos: 0, divergentes: 0 };
    }
  }

  async function rodada(): Promise<void> {
    for (const { usuarioId, rede } of await d.banco.divergencias.alvos()) {
      try {
        await conferirComErro(usuarioId, rede);
      } catch (erro) {
        d.log.warn({ err: erro }, "limite da Binance: a rodada de conferência para e volta na próxima");
        return;
      }
    }
  }

  return {
    conferir: conferirComErro,
    async conferirPessoa(usuarioId) {
      const redes = await d.banco.divergencias.alvos(usuarioId);
      const conferidas: ConferenciaConta[] = [];
      for (const { rede } of redes) {
        try {
          conferidas.push(await conferirComErro(usuarioId, rede));
        } catch (erro) {
          conferidas.push({ rede, ok: false, erro: erroDaBinance(erro).message, ativos: 0, divergentes: 0 });
        }
      }
      return { em: d.agora(), conferidas };
    },
    rodada,
    agendar(intervaloMs = INTERVALO_RECONCILIACAO_MS) {
      const relogio = setInterval(() => {
        rodada().catch((e: unknown) => d.log.warn({ err: e }, "rodada de conferência falhou"));
      }, intervaloMs);
      relogio.unref();
      return () => clearInterval(relogio);
    },
  };
}

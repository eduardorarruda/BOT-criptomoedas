import { ocultarSenhaMt5, type ResumoImportacaoB3 } from "@zentrade/contratos";
import { atualizarWinMt5, type ResumoAtualizacaoMt5 } from "./atualizar-win-mt5.js";
import type { ContaMt5, FonteBarrasMt5 } from "./fonte-mt5.js";
import { FUSO_B3, horaLocal, lerFuso } from "./fuso.js";
import type { CandlesSubstituiveis } from "./importar.js";

const DIA = 86_400_000;
const SAO_PAULO = lerFuso(FUSO_B3);
export const NOME_ATUALIZACAO_MT5 = "MetaTrader 5 (WIN)";

export interface CredenciaisParaAtualizar extends ContaMt5 {
  readonly simboloContinuo: string | null;
  readonly fusoServidor: string | null;
}

/** Só o que a atualização usa do repositório de importações (a mesma linha/fila do upload da B3). */
export interface RepositorioAtualizacaoMt5 {
  obterParaProcessar(id: string): Promise<{ usuarioId: string } | null>;
  marcarLendo(id: string): Promise<void>;
  concluir(id: string, resumo: ResumoImportacaoB3): Promise<void>;
  falhar(id: string, erro: string): Promise<void>;
}

export interface DependenciasAtualizacaoDiaria {
  readonly banco: CandlesSubstituiveis;
  readonly repositorio: RepositorioAtualizacaoMt5;
  readonly credenciais: (usuarioId: string) => Promise<CredenciaisParaAtualizar | null>;
  /** Abertura da última vela de 5m do WIN no banco (`null` = nunca importou). */
  readonly ultimaVela: () => Promise<number | null>;
  readonly criarFonte: (conta: ContaMt5) => FonteBarrasMt5;
  readonly agora: () => number;
  /** Quanto histórico pedir quando o banco ainda não tem WIN. */
  readonly historicoDias: number;
  /** Sem URL do coletor (perfil mt5 desligado), a atualização explica o que falta. */
  readonly coletorConfigurado: boolean;
}

const SEM_COLETOR =
  "o coletor do MetaTrader 5 não está ligado: suba o perfil mt5 do compose e defina COLETOR_MT5_URL (veja docs/dados-b3.md)";
const SEM_CONTA = "cadastre a conta demo do MetaTrader 5 em Contas e chaves antes de atualizar";

/**
 * Processa um pedido de "Atualizar dados do WIN" (botão ou agendamento): busca no coletor o
 * que falta desde a última vela gravada (na primeira vez, o máximo de histórico pedido),
 * grava e registra o resumo — ou o erro legível, sem a senha — na mesma linha de
 * `importacoes_b3` que o upload da B3 usa.
 */
export async function processarAtualizacaoMt5(
  d: DependenciasAtualizacaoDiaria,
  importacaoId: string,
): Promise<void> {
  const item = await d.repositorio.obterParaProcessar(importacaoId);
  if (!item) return;
  await d.repositorio.marcarLendo(importacaoId);
  let senha = "";
  try {
    if (!d.coletorConfigurado) throw new Error(SEM_COLETOR);
    const c = await d.credenciais(item.usuarioId);
    if (!c) throw new Error(SEM_CONTA);
    senha = c.senha;
    const agora = d.agora();
    const ultima = await d.ultimaVela();
    const resumo: ResumoAtualizacaoMt5 = await atualizarWinMt5(
      {
        fonte: d.criarFonte({ servidor: c.servidor, login: c.login, senha: c.senha }),
        banco: d.banco,
        agora: d.agora,
        ...(c.simboloContinuo ? { simboloConfigurado: c.simboloContinuo } : {}),
      },
      {
        desde: ultima ?? agora - d.historicoDias * DIA,
        ate: agora,
        fusoServidor: c.fusoServidor ? lerFuso(c.fusoServidor) : null,
      },
    );
    await d.repositorio.concluir(importacaoId, { dias: [...resumo.dias] });
  } catch (erro) {
    await d.repositorio.falhar(importacaoId, ocultarSenhaMt5((erro as Error).message, senha));
  }
}

export interface OpcoesAgendador {
  readonly agora: () => number;
  readonly hora: number;
  /** Faz a atualização de hoje (cria a linha, roda); erros são do chamador registrar. */
  readonly executar: () => Promise<void>;
}

/**
 * Depois do fechamento (a partir de `hora` em Brasília, de segunda a sexta), roda uma vez
 * por dia. `tick()` é chamado de minuto em minuto; reiniciar o motor no mesmo dia repete a
 * atualização, o que é inofensivo (a gravação é idempotente).
 */
export function criarAgendadorMt5(o: OpcoesAgendador) {
  let ultimoDia = "";
  return {
    async tick(): Promise<boolean> {
      const h = horaLocal(o.agora(), SAO_PAULO);
      const dia = `${h.ano}-${h.mes}-${h.dia}`;
      const util = h.diaSemana >= 1 && h.diaSemana <= 5;
      if (!util || h.hora < o.hora || dia === ultimoDia) return false;
      ultimoDia = dia;
      await o.executar();
      return true;
    },
  };
}

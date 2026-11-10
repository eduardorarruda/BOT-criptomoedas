import type { PortaRobos, RoboConfig } from "@zentrade/contratos";
import { CUSTOS_WIN_PADRAO, dec, SESSAO_B3_PADRAO } from "@zentrade/dominio";
import { readFile } from "node:fs/promises";
import type { Config } from "../config.js";
import { lerFuso } from "../dados-b3/fuso.js";
import type { OpcoesWin } from "../nucleo/tamanho-win.js";
import { CorretoraB3Papel } from "./corretora-b3-papel.js";
import { acumular, combinarFontes, fonteDeArquivosMt5, memorizar } from "./fonte.js";
import { estrategiaNoPregao, SIMBOLO_WIN_PAPEL, type SessaoPregao } from "./mercado.js";

/** Velas de 5 min guardadas na memória: ~185 pregões, folga para 1.000 candles de 1 h. */
const VELAS_GUARDADAS = 20_000;

const lista = (texto: string): string[] =>
  texto
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/** A corretora de papel da B3: export do MT5 (lido uma vez) + arquivo ao vivo do EA (a cada consulta). */
export function criarCorretoraB3(config: Config): CorretoraB3Papel {
  const fuso = lerFuso(config.MOTOR_B3_FUSO);
  const ler = (caminho: string) => readFile(caminho);
  const historico = memorizar(fonteDeArquivosMt5({ arquivos: lista(config.MOTOR_B3_HISTORICO), ler, fuso }));
  const vivo = fonteDeArquivosMt5({ arquivos: [config.MOTOR_B3_VIVO], ler, fuso });
  return new CorretoraB3Papel({
    fonte: acumular(combinarFontes(historico, vivo), VELAS_GUARDADAS),
    capital: dec(config.MOTOR_B3_SALDO),
    margemPorContrato: dec(config.MOTOR_B3_MARGEM),
    tarifaPorContrato: dec(config.MOTOR_B3_TARIFA),
    deslizamentoTicks: config.MOTOR_B3_DESLIZAMENTO_TICKS,
    contratosMaximos: config.MOTOR_B3_CONTRATOS_MAXIMOS,
    precoReferenciaPontos: config.MOTOR_B3_PRECO_REFERENCIA,
    idadeMaximaCotacaoMs: config.MOTOR_B3_IDADE_COTACAO_MIN * 60_000,
    consultaMs: config.MOTOR_B3_CONSULTA_S * 1000,
    agora: Date.now,
  });
}

/** O tamanho em contratos do núcleo, com os mesmos custos que a corretora de papel cobra. */
export function opcoesWin(config: Config): OpcoesWin {
  return {
    simbolo: SIMBOLO_WIN_PAPEL,
    margemPorContrato: dec(config.MOTOR_B3_MARGEM),
    contratosMaximos: config.MOTOR_B3_CONTRATOS_MAXIMOS,
    custos: {
      ...CUSTOS_WIN_PADRAO,
      tarifaB3: dec(config.MOTOR_B3_TARIFA),
      deslizamentoTicks: config.MOTOR_B3_DESLIZAMENTO_TICKS,
    },
  };
}

/**
 * Cada motor liga só os robôs do seu mercado. No da B3, a estratégia do robô ganha a
 * sessão do pregão (entradas, leilão e zeragem como no backtest); no do cripto, o WINBRL
 * fica de fora (não há preço dele na Binance).
 */
export class RobosDoMercado implements PortaRobos {
  constructor(
    private readonly todos: PortaRobos,
    private readonly mercado: "cripto" | "b3",
    private readonly sessao: SessaoPregao = SESSAO_B3_PADRAO,
  ) {}

  async ativos(): Promise<RoboConfig[]> {
    const robos = await this.todos.ativos();
    if (this.mercado === "cripto") return robos.filter((r) => r.simbolo !== SIMBOLO_WIN_PAPEL);
    return robos
      .filter((r) => r.simbolo === SIMBOLO_WIN_PAPEL)
      .map((r) => ({ ...r, estrategia: estrategiaNoPregao(r.estrategia, r.intervalo, this.sessao) }));
  }

  pausado(roboId: string): Promise<boolean> {
    return this.todos.pausado(roboId);
  }
}

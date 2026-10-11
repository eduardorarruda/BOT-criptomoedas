import { createHash } from "node:crypto";
import type {
  Corretora,
  CredenciaisCorretora,
  PortaCredenciais,
  RedeConta,
  RoboConfig,
} from "@zentrade/contratos";
import { ErroConfiguracao } from "@zentrade/corretora";
import { Trava } from "./trava.js";

export interface OpcoesCorretorasPorPessoa {
  /** As chaves cadastradas na tela (banco + chave mestra). Null: só o fallback. */
  readonly credenciais: PortaCredenciais | null;
  /** Só em desenvolvimento: BINANCE_API_KEY/SECRET do ambiente, para quem não cadastrou chave. */
  readonly fallback: CredenciaisCorretora | null;
  readonly criar: (rede: RedeConta, credenciais: CredenciaisCorretora) => Corretora;
}

interface EmCache {
  readonly impressao: string;
  readonly corretora: Corretora;
}

/** Impressão da chave: troca de chave vira corretora nova, sem guardar o segredo de novo. */
const impressaoDe = (c: CredenciaisCorretora): string =>
  createHash("sha256").update(`${c.apiKey}\n${c.apiSecret}`).digest("hex");

/**
 * Uma corretora Binance por pessoa e rede, com a chave que a pessoa cadastrou em
 * Contas e chaves (cifrada no banco). Robôs da mesma pessoa dividem a corretora; se a
 * chave mudar, o próximo robô a ligar recebe uma corretora nova. A chave é lida de novo
 * a cada robô que liga (raro: só na partida e na recarga de um robô alterado).
 */
export class CorretorasPorPessoa {
  private cache: ReadonlyMap<string, EmCache> = new Map();
  private readonly trava = new Trava();

  constructor(private readonly opcoes: OpcoesCorretorasPorPessoa) {}

  async para(robo: RoboConfig): Promise<Corretora> {
    const rede = robo.rede;
    if (rede === "papel")
      throw new ErroConfiguracao(`O robô ${robo.id} é de papel: papel não usa conta de corretora.`);
    // Uma por vez: dois robôs da mesma pessoa ligando juntos não criam duas corretoras.
    return this.trava.executar(() => this.obter(robo, rede));
  }

  private async obter(robo: RoboConfig, rede: RedeConta): Promise<Corretora> {
    const credenciais = await this.credenciaisDe(robo, rede);
    const chave = `${robo.usuarioId}:${rede}`;
    const impressao = impressaoDe(credenciais);
    const atual = this.cache.get(chave);
    if (atual?.impressao === impressao) return atual.corretora;
    const corretora = this.opcoes.criar(rede, credenciais);
    this.cache = new Map([...this.cache, [chave, { impressao, corretora }]]);
    return corretora;
  }

  private async credenciaisDe(robo: RoboConfig, rede: RedeConta): Promise<CredenciaisCorretora> {
    const { credenciais, fallback } = this.opcoes;
    const daPessoa = credenciais ? await credenciais.binance(robo.usuarioId, rede) : null;
    if (daPessoa) return daPessoa;
    if (fallback) return fallback;
    if (!credenciais)
      throw new ErroConfiguracao(
        `O robô ${robo.id} precisa da chave da Binance da pessoa, mas o motor está sem ZENTRADE_CHAVE_MESTRA para decifrá-la. Defina a mesma chave mestra da API.`,
      );
    throw new ErroConfiguracao(
      `A pessoa dona do robô ${robo.id} não cadastrou chave da Binance (${rede}). Cadastre em Contas e chaves; o robô liga na próxima recarga.`,
    );
  }
}

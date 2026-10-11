import { createHash, randomBytes } from "node:crypto";
import type { FerramentaLeitura } from "../ferramentas/index.js";

/**
 * Uma sessão da ponte por execução do Claude Code: um token aleatório que só abre as
 * ferramentas DAQUELA análise (ou daquela resposta do chat, da pessoa certa) e morre quando
 * a execução termina ou o prazo passa. O token não é guardado em claro, só o resumo.
 */
interface Sessao {
  readonly ferramentas: ReadonlyMap<string, FerramentaLeitura>;
  readonly expiraEm: number;
}

export interface SessaoAberta {
  /** Vai para a ponte (arquivo 0600 da pasta da execução), nunca para a linha de comando. */
  readonly acesso: string;
  fechar(): void;
}

const resumo = (acesso: string): string => createHash("sha256").update(acesso).digest("hex");

export class SessoesPonte {
  readonly #sessoes = new Map<string, Sessao>();
  readonly #agora: () => number;

  constructor(agora: () => number = Date.now) {
    this.#agora = agora;
  }

  abrir(ferramentas: readonly FerramentaLeitura[], validadeMs: number): SessaoAberta {
    this.#varrer();
    const acesso = randomBytes(32).toString("base64url");
    const chave = resumo(acesso);
    this.#sessoes.set(chave, {
      ferramentas: new Map(ferramentas.map((f) => [f.nome, f])),
      expiraEm: this.#agora() + validadeMs,
    });
    return { acesso, fechar: () => void this.#sessoes.delete(chave) };
  }

  /** As ferramentas da sessão, ou null (token errado, fechado ou vencido). */
  ferramentas(acesso: string | undefined): ReadonlyMap<string, FerramentaLeitura> | null {
    if (!acesso) return null;
    const sessao = this.#sessoes.get(resumo(acesso));
    if (!sessao || sessao.expiraEm <= this.#agora()) return null;
    return sessao.ferramentas;
  }

  get abertas(): number {
    this.#varrer();
    return this.#sessoes.size;
  }

  #varrer(): void {
    const agora = this.#agora();
    for (const [chave, s] of this.#sessoes) if (s.expiraEm <= agora) this.#sessoes.delete(chave);
  }
}

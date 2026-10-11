import type { CredenciaisCorretora, RedeConta } from "@zentrade/contratos";
import {
  ContaBinance,
  ErroCorretora,
  ErroLimiteRequisicoes,
  ErroRede,
  type FonteImportacao,
} from "@zentrade/corretora";
import { ErroApi } from "../erros.js";

/** O que a carteira usa da conta da Binance (ContaBinance cumpre; os testes trocam). */
export type ContaLeitura = FonteImportacao &
  Pick<ContaBinance, "conta" | "negociacoes" | "pares" | "tabelaPrecos" | "restricoes">;

export type FabricaConta = (rede: RedeConta, credenciais: CredenciaisCorretora) => ContaLeitura;

export interface OpcoesFabrica {
  readonly fetch?: typeof fetch;
  readonly agora?: () => number;
  readonly dormir?: (ms: number) => Promise<void>;
}

/** Uma ContaBinance nova por uso: o cache de preços históricos vive o tempo de uma sincronização. */
export const fabricaContaBinance =
  (o: OpcoesFabrica = {}): FabricaConta =>
  (rede, credenciais) =>
    new ContaBinance({ rede, ...credenciais, ...o });

const ERRO_CIFRA = "ErroCifra";

/**
 * Erro da Binance (ou da chave) para o formato da API. As mensagens da corretora já
 * dizem o que fazer; aqui só se escolhe o status e o código.
 */
export function erroDaBinance(erro: unknown): ErroApi {
  if (erro instanceof ErroApi) return erro;
  if (erro instanceof ErroLimiteRequisicoes) return new ErroApi(429, "binance_limite", erro.message);
  if (erro instanceof ErroRede) return new ErroApi(502, "binance_indisponivel", erro.message);
  if (erro instanceof ErroCorretora) return new ErroApi(502, "binance_recusou", erro.message);
  if (erro instanceof Error && erro.name === ERRO_CIFRA)
    return new ErroApi(
      409,
      "chave_ilegivel",
      "não foi possível decifrar a chave da Binance: a chave mestra (ZENTRADE_CHAVE_MESTRA) mudou desde o cadastro. Cadastre a chave de novo em Contas e chaves.",
    );
  return new ErroApi(
    502,
    "binance_indisponivel",
    "a Binance não respondeu como esperado; tente de novo em instantes",
  );
}

export const contaNaoEncontrada = (rede: RedeConta): ErroApi =>
  new ErroApi(
    404,
    "conta_nao_encontrada",
    `não há conta da Binance na rede ${rede}; cadastre uma chave em Contas e chaves (uma chave só de leitura basta para a carteira)`,
  );

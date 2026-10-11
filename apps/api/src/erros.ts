import { ErroDados, type CodigoErroDados } from "@zentrade/banco";

/** Erro com status e código do contrato: `{ "erro": { "codigo", "mensagem" } }`. */
export class ErroApi extends Error {
  override name = "ErroApi";
  constructor(
    readonly statusCode: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export const naoAutenticado = () =>
  new ErroApi(401, "nao_autenticado", "entre com e-mail e senha (ou envie um token válido) para continuar");
export const naoEncontrado = (o: string) =>
  new ErroApi(404, "nao_encontrado", `${o} não encontrado; confira o id`);
export const proibido = (codigo: string, mensagem: string) => new ErroApi(403, codigo, mensagem);
export const reautenticacaoNecessaria = () =>
  proibido(
    "reautenticacao_necessaria",
    "esta ação é crítica: confirme sua senha ou código 2FA em POST /api/v1/sessao/confirmar e tente de novo em até 5 minutos",
  );

const STATUS_DADOS: Record<CodigoErroDados, number> = {
  nao_encontrado: 404,
  conflito: 409,
  invalido: 400,
  estado_invalido: 409,
  expirada: 409,
};

export interface RespostaErro {
  readonly status: number;
  readonly corpo: { erro: { codigo: string; mensagem: string } };
}

const resposta = (status: number, codigo: string, mensagem: string): RespostaErro => ({
  status,
  corpo: { erro: { codigo, mensagem } },
});

/** Traduz qualquer erro para o formato do contrato. Detalhe interno (pilha, SQL) nunca sai. */
export function corpoDoErro(erro: unknown): RespostaErro {
  if (erro instanceof ErroApi) return resposta(erro.statusCode, erro.codigo, erro.message);
  if (erro instanceof ErroDados) return resposta(STATUS_DADOS[erro.codigo], erro.codigo, erro.message);
  const status = (erro as { statusCode?: unknown }).statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return resposta(
      status,
      "requisicao_invalida",
      "a requisição veio em formato inválido; envie JSON válido",
    );
  }
  return resposta(500, "erro_interno", "algo deu errado do nosso lado; tente de novo em instantes");
}

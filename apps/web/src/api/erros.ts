/**
 * Erro que a tela sabe mostrar: `mensagem` é uma frase para a pessoa (o que deu
 * errado e como resolver); `codigo` é para o código decidir o que fazer.
 */
export type CodigoErro =
  | "sem_conexao"
  | "resposta_invalida"
  | "nao_autenticado"
  | "reautenticacao_necessaria"
  | "codigo2fa_necessario"
  | "nao_encontrado"
  | "conflito"
  | "limite_de_pedidos"
  | "erro_servidor"
  | (string & {});

export class ErroApi extends Error {
  override name = "ErroApi";

  constructor(
    readonly codigo: CodigoErro,
    readonly mensagem: string,
    readonly status = 0,
  ) {
    super(mensagem);
  }
}

export const ehErroApi = (e: unknown): e is ErroApi => e instanceof ErroApi;

const POR_STATUS: Record<number, [CodigoErro, string]> = {
  401: ["nao_autenticado", "Sua sessão terminou. Entre de novo para continuar."],
  403: ["proibido", "Você não tem permissão para isso. Confira o escopo do seu acesso."],
  404: ["nao_encontrado", "Não encontramos isso. Pode ter sido removido; atualize a lista."],
  409: ["conflito", "Isso mudou enquanto você olhava. Atualize e tente de novo."],
  429: ["limite_de_pedidos", "Muitos pedidos em pouco tempo. Espere alguns segundos e tente de novo."],
};

/** Erro padrão quando a API não mandou `{ erro: { codigo, mensagem } }`. */
export function erroPorStatus(status: number): ErroApi {
  const conhecido = POR_STATUS[status];
  if (conhecido) return new ErroApi(conhecido[0], conhecido[1], status);
  return new ErroApi(
    "erro_servidor",
    `A API falhou ao responder (código ${status}). Tente de novo em instantes; se continuar, veja os registros da API.`,
    status,
  );
}

export const ERRO_SEM_CONEXAO = (): ErroApi =>
  new ErroApi(
    "sem_conexao",
    "Não foi possível falar com a API. Confira se ela está no ar e se sua internet está funcionando, e tente de novo.",
  );

export const ERRO_RESPOSTA_INVALIDA = (caminho: string): ErroApi =>
  new ErroApi(
    "resposta_invalida",
    `A API respondeu ${caminho} num formato que a tela não reconhece. Atualize a página; se continuar, a API e a tela estão em versões diferentes.`,
  );

/** Texto para mostrar de qualquer erro, inclusive os que não vieram da API. */
export function mensagemDe(e: unknown): string {
  if (ehErroApi(e)) return e.mensagem;
  return "Algo deu errado aqui na tela. Atualize a página e tente de novo.";
}

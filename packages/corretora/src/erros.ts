/**
 * Erros da corretora, tipados para quem chama decidir o que fazer: esperar (limite
 * de requisições), ressincronizar o relógio, desistir da ordem (saldo) ou conferir se
 * a ordem entrou (rede). Toda mensagem diz o que deu errado e como resolver.
 */
export class ErroCorretora extends Error {
  override name = "ErroCorretora";
  constructor(
    mensagem: string,
    /** Código da Binance (-2010, -1021...) quando a corretora respondeu com erro. */
    readonly codigo: number | null = null,
  ) {
    super(mensagem);
  }
}

/** -1021: o relógio local está fora da janela aceita (recvWindow). */
export class ErroTimestamp extends ErroCorretora {
  override name = "ErroTimestamp";
}

/** -2010: a ordem foi recusada, quase sempre por saldo insuficiente. */
export class ErroSaldoInsuficiente extends ErroCorretora {
  override name = "ErroSaldoInsuficiente";
}

/** HTTP 429 (limite) ou 418 (IP banido por ignorar o 429). */
export class ErroLimiteRequisicoes extends ErroCorretora {
  override name = "ErroLimiteRequisicoes";
  constructor(
    mensagem: string,
    readonly esperaMs: number,
    readonly banido: boolean,
  ) {
    super(mensagem);
  }
}

/** A requisição não teve resposta (rede caiu, tempo esgotado). Não se sabe se chegou. */
export class ErroRede extends ErroCorretora {
  override name = "ErroRede";
}

/** Falta configuração (chave da API, rede inválida) para fazer o que foi pedido. */
export class ErroConfiguracao extends ErroCorretora {
  override name = "ErroConfiguracao";
}

/**
 * A ordem pode ou não ter entrado: o envio falhou por rede e a consulta também não
 * respondeu. Quem recebe isto não pode reenviar às cegas; precisa conferir na corretora.
 */
export class ErroOrdemIncerta extends ErroCorretora {
  override name = "ErroOrdemIncerta";
  constructor(
    mensagem: string,
    readonly idCliente: string,
  ) {
    super(mensagem);
  }
}

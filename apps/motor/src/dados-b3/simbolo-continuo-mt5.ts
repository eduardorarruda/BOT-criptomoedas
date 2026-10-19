/**
 * Nas corretoras brasileiras, o contrato contínuo do mini índice costuma aparecer com
 * um destes nomes (a convenção varia por corretora e por plataforma). Em ordem de
 * preferência: `WIN$N` (o mais comum em corretoras que seguem a convenção da B3 para
 * o MetaTrader), depois `WIN$` e `WIN@`.
 */
export const CANDIDATOS_CONTINUO_WIN = ["WIN$N", "WIN$", "WIN@"] as const;

export class ErroSimboloContinuoMt5 extends Error {
  override name = "ErroSimboloContinuoMt5";
}

/**
 * Escolhe o símbolo contínuo do WIN entre os que a corretora de fato tem
 * (`symbols_get("WIN*")`, no MT5). Se a pessoa configurou um nome (`preferido`), ele
 * manda, desde que exista na lista — nome configurável por corretora, como pedido.
 * Sem configuração, tenta os candidatos conhecidos nessa ordem. Sem nenhum deles,
 * falha com os símbolos disponíveis (um vencimento específico, como `WINZ26`, pode
 * servir de contorno manual, mas rola de contrato em contrato e não é o contínuo).
 */
export function detectarSimboloContinuoWin(
  simbolosDisponiveis: readonly string[],
  preferido?: string,
): string {
  const disponiveis = new Set(simbolosDisponiveis);
  if (preferido !== undefined) {
    if (disponiveis.has(preferido)) return preferido;
    throw new ErroSimboloContinuoMt5(
      `o símbolo configurado "${preferido}" não existe nesta corretora (disponíveis: ${[...disponiveis].join(", ") || "nenhum WIN*"})`,
    );
  }
  const achado = CANDIDATOS_CONTINUO_WIN.find((c) => disponiveis.has(c));
  if (achado) return achado;
  throw new ErroSimboloContinuoMt5(
    `nenhum símbolo contínuo do WIN encontrado (tentado: ${CANDIDATOS_CONTINUO_WIN.join(", ")}); configure o nome usado por esta corretora. Símbolos WIN* disponíveis: ${[...disponiveis].join(", ") || "nenhum"}`,
  );
}

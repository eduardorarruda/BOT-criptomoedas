import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const arquivo = (caminho: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${caminho}`, import.meta.url)), "utf8");

/** O conector é só de dados: nenhuma função de ordem, posição ou negócio do MT5 pode aparecer. */
describe("coletor-mt5 só lê dados", () => {
  const codigo = arquivo("infra/coletor-mt5/coletor.py")
    .replace(/"""[\s\S]*?"""/g, "") // docstring cita order_send só para dizer que não usa
    .replace(/#.*$/gm, "");

  it("não chama nenhuma função de ordem, posição ou histórico de negócios", () => {
    expect(codigo).not.toMatch(
      /\b(order_send|order_check|order_calc|positions_get|orders_get|history_deals|history_orders)\b/,
    );
  });

  it("só usa as chamadas de leitura esperadas do MT5", () => {
    const usadas = new Set([...codigo.matchAll(/\bmt5\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]));
    expect([...usadas].sort()).toEqual(
      [
        "TIMEFRAME_M5",
        "copy_rates_range",
        "initialize",
        "last_error",
        "shutdown",
        "symbol_select",
        "symbols_get",
      ].sort(),
    );
  });

  it("não escreve o corpo do pedido (a conta) em log nem imprime nada", () => {
    expect(codigo).not.toMatch(/\bprint\(|logging|\.log\(/);
    expect(codigo).toMatch(/def log_message[\s\S]*return/);
  });
});

/**
 * Manda um alerta ou uma proposta de teste, assinados, para os webhooks do n8n.
 *
 *   N8N_URL=http://localhost:5678 N8N_WEBHOOK_SEGREDO=... \
 *     node tools/n8n-validacao/src/enviar-teste.ts alerta|proposta
 *
 * Requer `pnpm build` antes (usa assinar() de @zentrade/contratos já compilado).
 */
import { assinar, CABECALHO_ASSINATURA } from "@zentrade/contratos";

const tipo = process.argv[2];
const n8n = (process.env.N8N_URL ?? "http://localhost:5678").replace(/\/+$/, "");
const segredo = process.env.N8N_WEBHOOK_SEGREDO ?? "";

if (tipo !== "alerta" && tipo !== "proposta") {
  console.error("uso: node tools/n8n-validacao/src/enviar-teste.ts alerta|proposta");
  process.exit(2);
}
if (segredo.length < 32) {
  console.error("defina N8N_WEBHOOK_SEGREDO (o mesmo da credencial do n8n, com 32+ caracteres)");
  process.exit(2);
}

const agora = Date.now();
const corpo = JSON.stringify(
  tipo === "alerta"
    ? {
        tipo: "teste",
        titulo: "Alerta de teste",
        mensagem: "Se você está lendo isto, o fluxo funciona.",
        em: agora,
      }
    : {
        decisaoId: `teste-${agora}`,
        roboId: "robo-de-teste",
        simbolo: "BTCUSDT",
        acao: "COMPRAR",
        quantidade: "0.001",
        preco: "60000",
        resumo: "Proposta de teste: nada será executado, a decisão não existe no motor.",
        expiraEm: agora + 4 * 60_000,
      },
);

const caminho = tipo === "alerta" ? "zentrade-alerta" : "zentrade-proposta";
const resposta = await fetch(`${n8n}/webhook/${caminho}`, {
  method: "POST",
  headers: { "content-type": "application/json", [CABECALHO_ASSINATURA]: assinar(corpo, segredo, agora) },
  body: corpo,
});
process.stdout.write(`${resposta.status} ${await resposta.text()}\n`);
process.exit(resposta.status === 202 ? 0 : 1);

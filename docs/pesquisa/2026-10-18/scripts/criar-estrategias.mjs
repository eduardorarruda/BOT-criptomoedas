import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
const { MODELOS } =
  await import("/home/eduardoa/Documentos/Projetos/BOT-criptomoedas/packages/dominio/dist/index.js");
const token = readFileSync(`${homedir()}/.config/zentrade/token-operar`, "utf8").trim();
const api = "http://127.0.0.1:8095/api/v1";
const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const existentes = await (await fetch(`${api}/estrategias`, { headers: h })).json();
const criadas = [];
for (const m of MODELOS) {
  const ja = existentes.find((e) => e.nome === m.nome);
  if (ja) {
    criadas.push({ modelo: m.id, id: ja.id, versao: ja.versao, nome: ja.nome, ja: true });
    continue;
  }
  const corpo = JSON.parse(JSON.stringify({ nome: m.nome, ...m.estrategia }));
  const r = await fetch(`${api}/estrategias`, { method: "POST", headers: h, body: JSON.stringify(corpo) });
  const j = await r.json();
  if (!r.ok) {
    console.log("FALHOU", m.id, r.status, JSON.stringify(j).slice(0, 300));
    continue;
  }
  criadas.push({ modelo: m.id, id: j.id, versao: j.versao, nome: j.nome });
}
writeFileSync(new URL("./estrategias.json", import.meta.url), JSON.stringify(criadas, null, 2));
for (const c of criadas) console.log(`${c.ja ? "=" : "+"} ${c.modelo} → ${c.nome} (v${c.versao})`);

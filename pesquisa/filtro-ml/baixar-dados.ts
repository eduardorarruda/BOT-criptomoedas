/**
 * Baixa os klines mensais PÚBLICOS da Binance (data.binance.vision) para o cache local.
 * Uso: node pesquisa/filtro-ml/baixar-dados.ts <intervalo> [PAR ...]
 * Sem chave, sem conta. Pausa entre pedidos; confere o SHA-256 de cada zip; só extrai o
 * CSV (execFile com argumentos, sem shell); nada baixado é executado.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PARES, INICIO_ANO, FIM_ANO, FIM_MES } from "./config.ts";

const executar = promisify(execFile);
const BASE = "https://data.binance.vision/data/spot/monthly/klines";
const PAUSA_MS = 120;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const existe = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

async function buscar(url: string): Promise<Buffer | null> {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function baixarMes(par: string, intervalo: string, ano: number, mes: number, dir: string) {
  const nome = `${par}-${intervalo}-${ano}-${String(mes).padStart(2, "0")}`;
  const destino = join(dir, `${nome}.csv`);
  if (await existe(destino)) return "cache";
  const url = `${BASE}/${par}/${intervalo}/${nome}.zip`;
  const zip = await buscar(url);
  await dormir(PAUSA_MS);
  if (!zip) return "ausente";
  const soma = await buscar(`${url}.CHECKSUM`);
  await dormir(PAUSA_MS);
  const esperado = soma?.toString("utf8").trim().split(/\s+/)[0];
  const obtido = createHash("sha256").update(zip).digest("hex");
  if (esperado && esperado !== obtido) throw new Error(`SHA-256 diferente em ${nome}`);
  const zipPath = join(dir, `${nome}.zip`);
  await writeFile(zipPath, zip);
  const { stdout } = await executar("unzip", ["-p", zipPath], { maxBuffer: 64 * 1024 * 1024 });
  await writeFile(destino, stdout);
  await executar("rm", ["-f", zipPath]);
  return "baixado";
}

async function main() {
  const [intervalo, ...pedidos] = process.argv.slice(2);
  if (!intervalo) throw new Error("informe o intervalo (4h ou 1h)");
  const pares = pedidos.length > 0 ? pedidos : PARES;
  for (const par of pares) {
    const dir = join(import.meta.dirname, "dados", intervalo, par);
    await mkdir(dir, { recursive: true });
    const cont: Record<string, number> = {};
    for (let ano = INICIO_ANO; ano <= FIM_ANO; ano++) {
      for (let mes = 1; mes <= 12; mes++) {
        if (ano === FIM_ANO && mes > FIM_MES) break;
        const r = await baixarMes(par, intervalo, ano, mes, dir);
        cont[r] = (cont[r] ?? 0) + 1;
      }
    }
    console.warn(par, intervalo, JSON.stringify(cont));
  }
}

await main();

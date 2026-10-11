import { criarBanco, criarBancoDoMotor, type Banco, type BancoDoMotor } from "@zentrade/banco";
import { criarBancoDescartavel, type BancoDescartavel } from "@zentrade/banco/teste";
import type { RoboDTO } from "@zentrade/contratos";
import { PapelCorretora } from "@zentrade/corretora";
import { dec } from "@zentrade/dominio";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { CorretoraPapelAoVivo } from "../papel-ao-vivo.js";
import { registroDeTeste } from "../teste/cenario.js";
import { candle } from "../teste/candles.js";

export const QUINZE = 15 * 60_000;
export const MIN = 60_000;

/** Banco migrado do zero, Redis de teste, uma pessoa com uma estratégia "compra abaixo de 95" e um robô em papel. */
export interface AmbienteIntegracao {
  readonly banco: Banco;
  readonly motorBanco: BancoDoMotor;
  readonly redis: Redis;
  readonly url: string;
  readonly redisUrl: string;
  readonly usuarioId: string;
  readonly estrategiaId: string;
  readonly robo: RoboDTO;
  encerrar(): Promise<void>;
}

export async function montarAmbiente(): Promise<AmbienteIntegracao> {
  const descartavel: BancoDescartavel = await criarBancoDescartavel();
  const banco = criarBanco({ url: descartavel.url, chaveMestra: randomBytes(32), maximoConexoes: 4 });
  const motorBanco = criarBancoDoMotor({ url: descartavel.url, maximoConexoes: 4 });
  const redisUrl = process.env.ZT_TESTE_REDIS_URL ?? "redis://127.0.0.1:56390";
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const usuario = await banco.usuarios.criar({
    email: `ana-${randomBytes(3).toString("hex")}@exemplo.com`,
    nome: "Ana",
    senhaHash: "x",
  });
  const estrategia = await banco.estrategias.criar(usuario.id, {
    nome: "Compra abaixo de 95",
    entrada: {
      tipo: "comparar",
      esquerda: { tipo: "preco" },
      comparador: "<",
      direita: { tipo: "numero", valor: 95 },
    },
    stop: 0.02,
    alvoLiquido: 0.01,
    taxa: 0.001,
  });
  const criado = await banco.robos.criar(usuario.id, {
    nome: "BTC papel",
    simbolo: "BTCUSDT",
    intervalo: "15m",
    modo: "auto",
    rede: "papel",
    estrategiaId: estrategia.id,
    estrategiaVersao: 1,
    limites: {
      perdaDiariaMaxima: "50",
      exposicaoMaxima: "1000",
      riscoPorOperacao: "10",
      ordensPorHoraMax: 10,
      pausaAposPerdaMin: 0,
      confiancaMinima: 0.5,
    },
  });
  const robo = (await banco.robos.atualizar(usuario.id, criado.id, { modo: "auto" })) ?? criado;
  return {
    banco,
    motorBanco,
    redis,
    url: descartavel.url,
    redisUrl,
    usuarioId: usuario.id,
    estrategiaId: estrategia.id,
    robo,
    encerrar: async () => {
      await redis.quit();
      await motorBanco.fechar();
      await banco.fechar();
      await descartavel.descartar();
    },
  };
}

/**
 * Corretora "ao vivo" sem rede: candles de uma PapelCorretora alimentada pelo teste e
 * ordens noutra (o "papel" do motor). Nada vai à Binance.
 */
export function corretoraDeTeste(inicio: number, historico = 30) {
  const dados = new PapelCorretora({ saldos: {}, taxa: 0, deslizamentoBps: 0 });
  for (let i = historico; i > 0; i--)
    dados.alimentar("BTCUSDT", "15m", candle(inicio - i * QUINZE, 100, QUINZE));
  const novaOrdens = () =>
    new PapelCorretora({ saldos: { USDT: dec(1000) }, taxa: 0.001, deslizamentoBps: 0 });
  let ordens = novaOrdens();
  let corretora = new CorretoraPapelAoVivo(dados, ordens);
  let proximo15 = inicio;
  let proximo1 = inicio;
  return {
    get corretora() {
      return corretora;
    },
    get ordens() {
      return ordens;
    },
    /** A corretora de papel "reinicia" junto com o processo: saldos e ordens simulados somem. */
    reiniciarPapel() {
      ordens = novaOrdens();
      corretora = new CorretoraPapelAoVivo(dados, ordens);
    },
    fecharIntervalo(preco: number | string) {
      const c = candle(proximo15, preco, QUINZE);
      proximo15 += QUINZE;
      dados.alimentar("BTCUSDT", "15m", c);
      return c;
    },
    fecharMinuto(preco: number | string) {
      const c = candle(proximo1, preco, MIN);
      proximo1 += MIN;
      dados.alimentar("BTCUSDT", "1m", c);
      return c;
    },
  };
}

export const registro = () => registroDeTeste();

/** Espera a condição (consulta ao banco, por exemplo) virar verdade. */
export async function ate<T>(ler: () => Promise<T>, ok: (v: T) => boolean, tentativas = 200): Promise<T> {
  for (let i = 0; ; i++) {
    const v = await ler();
    if (ok(v) || i >= tentativas) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
}

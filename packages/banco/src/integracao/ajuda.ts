import { randomBytes } from "node:crypto";
import type { EstrategiaDTO, RoboDTO } from "@zentrade/contratos";
import { criarBanco, type Banco } from "../banco.js";
import { criarBancoDescartavel, type BancoDescartavel } from "../teste/index.js";

/** Banco migrado do zero + duas pessoas com uma estratégia e um robô cada. */
export interface Cenario {
  readonly banco: Banco;
  readonly url: string;
  readonly ana: { id: string; estrategia: EstrategiaDTO; robo: RoboDTO };
  readonly beto: { id: string; estrategia: EstrategiaDTO; robo: RoboDTO };
  encerrar(): Promise<void>;
}

export const ESTRATEGIA: Omit<EstrategiaDTO, "id" | "versao"> = {
  nome: "Cruzamento de médias",
  entrada: {
    tipo: "comparar",
    esquerda: { tipo: "indicador", nome: "sma", periodo: 9 },
    comparador: "cruzouAcima",
    direita: { tipo: "indicador", nome: "sma", periodo: 21 },
  },
  stop: 0.02,
  alvoLiquido: 0.01,
  taxa: 0.001,
};

export const LIMITES: RoboDTO["limites"] = {
  perdaDiariaMaxima: "50",
  exposicaoMaxima: "1000",
  riscoPorOperacao: "10",
  ordensPorHoraMax: 6,
  pausaAposPerdaMin: 30,
  confiancaMinima: 0.6,
};

async function pessoa(banco: Banco, email: string) {
  const usuario = await banco.usuarios.criar({ email, nome: email.split("@")[0] ?? email, senhaHash: "x" });
  const estrategia = await banco.estrategias.criar(usuario.id, ESTRATEGIA);
  const robo = await banco.robos.criar(usuario.id, {
    nome: "BTC devagar",
    simbolo: "BTCUSDT",
    intervalo: "1h",
    modo: "auto",
    rede: "testnet",
    estrategiaId: estrategia.id,
    estrategiaVersao: 1,
    limites: LIMITES,
  });
  return { id: usuario.id, estrategia, robo };
}

export async function montarCenario(): Promise<Cenario> {
  const descartavel: BancoDescartavel = await criarBancoDescartavel();
  const banco = criarBanco({ url: descartavel.url, chaveMestra: randomBytes(32), maximoConexoes: 4 });
  const ana = await pessoa(banco, "ana@exemplo.com");
  const beto = await pessoa(banco, "beto@exemplo.com");
  return {
    banco,
    url: descartavel.url,
    ana,
    beto,
    encerrar: async () => {
      await banco.fechar();
      await descartavel.descartar();
    },
  };
}

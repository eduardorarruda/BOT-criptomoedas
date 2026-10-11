import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { migrar } from "../migrar.js";

/**
 * Banco novo, migrado do zero, para um teste de integração. Recebe a URL de
 * administração (ZT_TESTE_BANCO_URL) e cria um banco com nome aleatório no mesmo
 * servidor; `descartar` o apaga.
 */
export interface BancoDescartavel {
  readonly url: string;
  descartar(): Promise<void>;
}

/** Chave do advisory lock que serializa as migrações dos bancos descartáveis. */
const TRAVA_MIGRACOES_DE_TESTE = 7_412_903;

export function urlDeTeste(): string {
  const url = process.env.ZT_TESTE_BANCO_URL;
  if (!url) {
    throw new Error(
      "defina ZT_TESTE_BANCO_URL (ex.: postgres://postgres:teste-local@127.0.0.1:55440/postgres); suba o banco com infra/teste/subir.sh",
    );
  }
  return url;
}

async function esperarServidor(admin: postgres.Sql): Promise<void> {
  // A imagem timescaledb-ha reinicia o servidor depois do initdb: tenta por até 60 s.
  for (let tentativa = 0; ; tentativa++) {
    try {
      await admin`select 1`;
      return;
    } catch (erro) {
      if (tentativa >= 60) throw erro;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function criarBancoDescartavel(urlAdmin = urlDeTeste()): Promise<BancoDescartavel> {
  const nome = `zt_${randomBytes(6).toString("hex")}`;
  const admin = postgres(urlAdmin, { max: 1, onnotice: () => undefined });
  const url = new URL(urlAdmin);
  url.pathname = `/${nome}`;
  try {
    await esperarServidor(admin);
    await admin.unsafe(`create database ${nome}`);
    // Uma migração por vez no servidor: o papel zentrade_app vale para o servidor
    // inteiro, e duas migrações paralelas num servidor novo brigavam para criá-lo
    // ("pg_authid_rolname_index"). Em produção só um migrador roda.
    await admin`select pg_advisory_lock(${TRAVA_MIGRACOES_DE_TESTE})`;
    try {
      await migrar(url.toString());
    } finally {
      await admin`select pg_advisory_unlock(${TRAVA_MIGRACOES_DE_TESTE})`;
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
  return {
    url: url.toString(),
    descartar: async () => {
      const a = postgres(urlAdmin, { max: 1, onnotice: () => undefined });
      try {
        await a.unsafe(`drop database if exists ${nome} with (force)`);
      } finally {
        await a.end({ timeout: 5 });
      }
    },
  };
}

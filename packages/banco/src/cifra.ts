import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra em envelope: cada dado ganha uma chave própria (DEK) e só a DEK é cifrada
 * com a chave mestra, que fica fora do banco (ZENTRADE_CHAVE_MESTRA). Quem levar
 * só o banco não decifra nada. O `contexto` (tabela, pessoa e campo) entra como
 * dado autenticado: um envelope copiado para outra linha ou outro campo não abre.
 *
 * Formato: v1.<iv da DEK>.<tag da DEK>.<DEK cifrada>.<iv>.<tag>.<dado cifrado>, em base64url.
 */
const VERSAO = "v1";
const ALGORITMO = "aes-256-gcm";
const TAMANHO_CHAVE = 32;
const TAMANHO_IV = 12;

export class ErroCifra extends Error {
  override name = "ErroCifra";
}

export function lerChaveMestra(base64: string): Buffer {
  const chave = Buffer.from(base64, "base64");
  exigirChave(chave);
  return chave;
}

function exigirChave(chave: Buffer): void {
  if (chave.length !== TAMANHO_CHAVE) {
    throw new ErroCifra(
      `a chave mestra precisa ter 32 bytes em base64 (tem ${chave.length}); gere uma com: openssl rand -base64 32`,
    );
  }
}

interface Pedaco {
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly dado: Buffer;
}

function selar(dado: Buffer, chave: Buffer, contexto: string): Pedaco {
  const iv = randomBytes(TAMANHO_IV);
  const cifra = createCipheriv(ALGORITMO, chave, iv);
  cifra.setAAD(Buffer.from(contexto, "utf8"));
  const cifrado = Buffer.concat([cifra.update(dado), cifra.final()]);
  return { iv, tag: cifra.getAuthTag(), dado: cifrado };
}

function abrir(p: Pedaco, chave: Buffer, contexto: string): Buffer {
  try {
    const decifra = createDecipheriv(ALGORITMO, chave, p.iv);
    decifra.setAAD(Buffer.from(contexto, "utf8"));
    decifra.setAuthTag(p.tag);
    return Buffer.concat([decifra.update(p.dado), decifra.final()]);
  } catch {
    throw new ErroCifra(
      "não foi possível decifrar: a chave mestra mudou ou o dado foi adulterado. Confira ZENTRADE_CHAVE_MESTRA.",
    );
  }
}

export function cifrar(texto: string, chaveMestra: Buffer, contexto: string): string {
  exigirChave(chaveMestra);
  const dek = randomBytes(TAMANHO_CHAVE);
  const envelopeDek = selar(dek, chaveMestra, `dek:${contexto}`);
  const conteudo = selar(Buffer.from(texto, "utf8"), dek, contexto);
  dek.fill(0);
  return [VERSAO, envelopeDek.iv, envelopeDek.tag, envelopeDek.dado, conteudo.iv, conteudo.tag, conteudo.dado]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decifrar(envelope: string, chaveMestra: Buffer, contexto: string): string {
  exigirChave(chaveMestra);
  const partes = envelope.split(".");
  if (partes.length !== 7 || partes[0] !== VERSAO) {
    throw new ErroCifra(
      "envelope em formato desconhecido: o dado não foi cifrado por esta versão do ZenTrade",
    );
  }
  const [ivDek, tagDek, dekCifrada, iv, tag, dado] = partes
    .slice(1)
    .map((p) => Buffer.from(p, "base64url")) as [Buffer, Buffer, Buffer, Buffer, Buffer, Buffer];
  const dek = abrir({ iv: ivDek, tag: tagDek, dado: dekCifrada }, chaveMestra, `dek:${contexto}`);
  try {
    return abrir({ iv, tag, dado }, dek, contexto).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

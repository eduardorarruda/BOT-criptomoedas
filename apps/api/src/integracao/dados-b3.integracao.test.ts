import { LIMITE_ZIP_B3_BYTES } from "@zentrade/contratos";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FilaImportacoesB3 } from "../dependencias.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";

/** Um .zip mínimo, só com a assinatura: o fim do zip (vazio) não importa aqui, só o começo. */
const ASSINATURA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

describe("upload dos .zip da B3 (a API só grava e enfileira; quem processa é o motor)", () => {
  let api: Api;
  let ana: Pessoa;
  let beto: Pessoa;
  let diretorio = "";
  const enfileirados: string[] = [];
  const filaDeTeste: FilaImportacoesB3 = {
    adicionar: async (id) => void enfileirados.push(id),
  };

  beforeAll(async () => {
    diretorio = await mkdtemp(join(tmpdir(), "zt-teste-upload-b3-"));
    api = await montarApi({ filaImportacoesB3: filaDeTeste, diretorioImportacoesB3: diretorio });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => api.encerrar());

  const enviar = (p: Pessoa, nome: string, conteudo: Buffer) =>
    api.app.inject({
      method: "POST",
      url: `/api/v1/dados-b3/importacoes?nome=${encodeURIComponent(nome)}`,
      headers: { ...comSessao(p), "content-type": "application/octet-stream" },
      payload: conteudo,
    });
  const pedir = (p: Pessoa, url: string) =>
    api.app.inject({ method: "GET", url: `/api/v1${url}`, headers: comSessao(p) });

  it("grava o .zip na pasta compartilhada, cria a linha na_fila e enfileira o id", async () => {
    const r = await enviar(ana, "WIN_NEGOCIOSAVISTA_DRV.zip", ASSINATURA_ZIP);
    expect(r.statusCode).toBe(202);
    const corpo = r.json();
    expect(corpo).toMatchObject({
      nomeArquivo: "WIN_NEGOCIOSAVISTA_DRV.zip",
      estado: "na_fila",
      resumo: null,
      erro: null,
    });
    expect(enfileirados).toContain(corpo.id);
    const arquivos = await readdir(diretorio);
    expect(arquivos.some((a) => a.endsWith(".zip"))).toBe(true);
  });

  it("lista e obtém só as importações da própria pessoa (RLS)", async () => {
    const r = await enviar(ana, "outro-dia.zip", ASSINATURA_ZIP);
    const { id } = r.json();
    const lista = (await pedir(ana, "/dados-b3/importacoes")).json();
    expect(lista.map((i: { id: string }) => i.id)).toContain(id);
    expect((await pedir(beto, "/dados-b3/importacoes")).json()).toEqual([]);
    expect((await pedir(ana, `/dados-b3/importacoes/${id}`)).statusCode).toBe(200);
    expect((await pedir(beto, `/dados-b3/importacoes/${id}`)).statusCode).toBe(404);
  });

  it("recusa extensão errada, conteúdo que não é zip, corpo em JSON e arquivo grande demais", async () => {
    expect((await enviar(ana, "negocios.txt", ASSINATURA_ZIP)).json().erro.codigo).toBe("tipo_invalido");
    const falsoZip = await enviar(ana, "negocios.zip", Buffer.from("não sou um zip"));
    expect(falsoZip.statusCode).toBe(422);
    expect(falsoZip.json().erro.codigo).toBe("arquivo_invalido");
    const json = await api.app.inject({
      method: "POST",
      url: "/api/v1/dados-b3/importacoes?nome=a.zip",
      headers: comSessao(ana),
      payload: { nome: "x" },
    });
    expect(json.statusCode).toBe(415);
    const grande = await enviar(ana, "a.zip", Buffer.concat([ASSINATURA_ZIP, Buffer.alloc(LIMITE_ZIP_B3_BYTES, 1)]));
    expect(grande.statusCode).toBe(413);
  });

  it("fila indisponível: marca falhou, apaga o arquivo temporário e responde 503", async () => {
    const semFila = await montarApi({
      filaImportacoesB3: {
        adicionar: async () => {
          throw new Error("redis fora do ar");
        },
      },
    });
    try {
      const pessoa = await semFila.pessoa("carla@exemplo.com");
      const r = await semFila.app.inject({
        method: "POST",
        url: "/api/v1/dados-b3/importacoes?nome=dia.zip",
        headers: { ...comSessao(pessoa), "content-type": "application/octet-stream" },
        payload: ASSINATURA_ZIP,
      });
      expect(r.statusCode).toBe(503);
      expect(r.json().erro.codigo).toBe("fila_indisponivel");
    } finally {
      await semFila.encerrar();
    }
  });
});

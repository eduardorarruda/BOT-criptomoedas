import { ImportacaoB3Esquema, LIMITE_ZIP_B3_BYTES } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi } from "../erros.js";
import { nomeSeguro } from "../integracoes/conhecimento-arquivos.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

const ConsultaImportacao = z.object({ nome: z.string().min(1).max(255) });
const Lista = z.object({ limite: z.coerce.number().int().min(1).max(50).optional() });

/** O processamento custa CPU e memória no motor (até 560 MB descompactados): teto baixo. */
const LIMITE_UPLOAD = { max: 10, timeWindow: "1 minute" } as const;

/** Assinatura de um .zip (PK\x03\x04 ou vazio PK\x05\x06); outra coisa não é um .zip. */
const ASSINATURA_ZIP = [0x50, 0x4b, 0x03, 0x04];
function pareceZip(bytes: Buffer): boolean {
  return bytes.length >= 4 && ASSINATURA_ZIP.every((b, i) => bytes[i] === b);
}

function bytesDoCorpo(corpo: unknown): Buffer {
  if (Buffer.isBuffer(corpo)) return corpo;
  throw new ErroApi(415, "tipo_de_corpo", "envie o .zip cru, com Content-Type: application/octet-stream");
}

type App = Parameters<FastifyPluginAsyncZod<{ deps: Dependencias }>>[0];

/**
 * Upload dos .zip "Negócio a negócio" baixados à mão no BDI da B3: o sistema nunca
 * baixa nada de lá (a B3 proíbe coleta automatizada das páginas do BDI). A API só
 * grava o arquivo numa pasta compartilhada com o motor e enfileira; quem lê e
 * descompacta (até 560 MB por dia) é o motor (processo motor-backtests), como os
 * backtests. Ver apps/motor/src/dados-b3 (reusado, não duplicado) e docs/dados-b3.md.
 */
async function registrarUpload(app: App, deps: Dependencias): Promise<void> {
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: LIMITE_ZIP_B3_BYTES },
    (_req, corpo, feito) => feito(null, corpo),
  );

  app.post(
    "/dados-b3/importacoes",
    {
      bodyLimit: LIMITE_ZIP_B3_BYTES,
      config: { acesso: "operar", rateLimit: LIMITE_UPLOAD },
      schema: { querystring: ConsultaImportacao, response: { 202: ImportacaoB3Esquema } },
    },
    async (req, reply) => {
      const nome = nomeSeguro(req.query.nome);
      if (!nome.toLowerCase().endsWith(".zip"))
        throw new ErroApi(422, "tipo_invalido", "envie um .zip: o baixado no BDI da B3 (não descompacte)");
      const bytes = bytesDoCorpo(req.body);
      if (!pareceZip(bytes))
        throw new ErroApi(422, "arquivo_invalido", "o conteúdo não parece um .zip (confira o download)");

      const usuarioId = usuarioIdDe(req);
      await mkdir(deps.diretorioImportacoesB3, { recursive: true });
      // Nome gerado no disco (nunca o enviado): zero chance de path traversal.
      const caminho = join(deps.diretorioImportacoesB3, `${randomUUID()}.zip`);
      await writeFile(caminho, bytes);

      const criada = await deps.banco.importacoesB3.criar(usuarioId, nome, caminho);
      try {
        await deps.filaImportacoesB3.adicionar(criada.id);
      } catch (erro) {
        req.log.error({ err: erro, importacaoId: criada.id }, "não foi possível enfileirar a importação B3");
        await deps.banco.importacoesB3.falhar(criada.id, "a fila de importações estava indisponível");
        await unlink(caminho).catch(() => undefined);
        throw new ErroApi(
          503,
          "fila_indisponivel",
          "a fila de importações está fora do ar; tente de novo em instantes",
        );
      }
      return reply.code(202).send({ ...criada, estado: "na_fila" });
    },
  );
}

function registrarConsultas(app: App, deps: Dependencias): void {
  app.get(
    "/dados-b3/importacoes",
    {
      config: { acesso: "leitura" },
      schema: { querystring: Lista, response: { 200: z.array(ImportacaoB3Esquema) } },
    },
    async (req) => deps.banco.importacoesB3.listar(usuarioIdDe(req), req.query.limite),
  );

  app.get(
    "/dados-b3/importacoes/:id",
    { config: { acesso: "leitura" }, schema: { params: ParamId, response: { 200: ImportacaoB3Esquema } } },
    async (req) =>
      ouNaoEncontrado(
        await deps.banco.importacoesB3.obter(usuarioIdDe(req), exigirUuid(req.params.id, "importação")),
        "importação",
      ),
  );
}

export const rotasDadosB3: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  await registrarUpload(app, deps);
  registrarConsultas(app, deps);
};

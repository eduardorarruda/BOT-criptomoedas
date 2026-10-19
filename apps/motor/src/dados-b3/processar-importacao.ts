import type { ResumoImportacaoB3 } from "@zentrade/contratos";
import { unlink } from "node:fs/promises";
import { blocosDoArquivo, conferirArquivoNegocios } from "./arquivo-negocios.js";
import { executarImportacaoNegocios, type ResumoImportacaoNegocios } from "./comando-negocios.js";
import type { CandlesSubstituiveis } from "./importar.js";

/** Só o que o processamento usa do repositório (apps/api/src/integracao não importa o motor, e vice-versa). */
export interface RepositorioImportacoesB3ParaMotor {
  obterParaProcessar(id: string): Promise<{ caminho: string } | null>;
  marcarLendo(id: string): Promise<void>;
  concluir(id: string, resumo: ResumoImportacaoB3): Promise<void>;
  falhar(id: string, erro: string): Promise<void>;
}

export interface DependenciasProcessamentoB3 {
  readonly banco: CandlesSubstituiveis;
  readonly repositorio: RepositorioImportacoesB3ParaMotor;
  readonly agora: () => number;
  /** Apaga o arquivo temporário; padrão: `unlink` (os testes trocam). */
  readonly apagar?: (caminho: string) => Promise<void>;
  /** As linhas do arquivo, em blocos; padrão: `blocosDoArquivo` (os testes trocam). */
  readonly blocos?: (caminho: string) => AsyncIterable<readonly string[]>;
  /** Confere que o caminho é um arquivo aceito; padrão: `conferirArquivoNegocios`. */
  readonly conferir?: (caminho: string) => Promise<void>;
}

function resumoParaGravar(r: ResumoImportacaoNegocios): ResumoImportacaoB3 {
  return {
    dias: r.dias.map((d) => ({
      data: d.data,
      contrato: d.contrato,
      negocios: d.negocios,
      negociosUsados: d.negociosUsados,
      gravados: d.gravados,
    })),
  };
}

const apagarPadrao = (caminho: string): Promise<void> =>
  unlink(caminho).then(
    () => undefined,
    () => undefined, // já apagado ou nunca existiu: não é um erro do processamento
  );

/**
 * Processa um job da fila `importacoes-b3`: lê o .zip enviado pela tela com o mesmo
 * caminho do comando `importar-negocios-b3` (reusa `executarImportacaoNegocios`, sem
 * duplicar a leitura nem a gravação), grava o resumo (ou o erro, legível) e sempre
 * apaga o arquivo temporário ao terminar — com sucesso ou não. Se a linha já não
 * existir (apagada ou nunca existiu), não há o que processar.
 */
export async function processarImportacaoB3(
  d: DependenciasProcessamentoB3,
  importacaoId: string,
): Promise<void> {
  const item = await d.repositorio.obterParaProcessar(importacaoId);
  if (!item) return;
  await d.repositorio.marcarLendo(importacaoId);
  const conferir = d.conferir ?? conferirArquivoNegocios;
  try {
    const resumo = await executarImportacaoNegocios(["--arquivos", item.caminho], {
      banco: d.banco,
      agora: d.agora,
      escrever: () => undefined,
      base: process.cwd(),
      blocos: d.blocos ?? blocosDoArquivo,
      conferir,
    });
    await d.repositorio.concluir(importacaoId, resumoParaGravar(resumo));
  } catch (erro) {
    await d.repositorio.falhar(importacaoId, (erro as Error).message);
  } finally {
    await (d.apagar ?? apagarPadrao)(item.caminho);
  }
}

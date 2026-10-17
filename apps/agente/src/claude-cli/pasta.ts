import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Pasta só desta execução (0700): é onde ficam a configuração do MCP (com o token da
 * ponte) e de onde o CLI roda. Como as ferramentas nativas ficam desligadas, o modelo não
 * lê nada dela. Apagada quando a execução termina.
 */
export interface PastaExecucao {
  readonly caminho: string;
  gravar(nome: string, conteudo: string): Promise<string>;
  /** Uma pasta vazia (0700) dentro desta, ex.: o CLAUDE_CONFIG_DIR novo de cada execução. */
  criarSubpasta(nome: string): Promise<string>;
  apagar(): Promise<void>;
}

export async function criarPastaExecucao(base = tmpdir()): Promise<PastaExecucao> {
  const caminho = await mkdtemp(join(base, "zentrade-claude-"));
  await chmod(caminho, 0o700);
  return {
    caminho,
    async gravar(nome, conteudo) {
      const arquivo = join(caminho, nome);
      await writeFile(arquivo, conteudo, { mode: 0o600 });
      return arquivo;
    },
    async criarSubpasta(nome) {
      const pasta = join(caminho, nome);
      await mkdir(pasta, { mode: 0o700 });
      return pasta;
    },
    apagar: () => rm(caminho, { recursive: true, force: true }),
  };
}

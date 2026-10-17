import { accessSync, constants, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";

const executavel = (caminho: string): boolean => {
  try {
    accessSync(caminho, constants.X_OK);
    return statSync(caminho).isFile();
  } catch {
    return false;
  }
};

/**
 * Acha o executável do Claude Code: caminho absoluto (que precisa terminar em "claude")
 * ou nome procurado no PATH. `null` = não instalado: o provedor "cli" fica indisponível.
 */
export function resolverClaude(configurado: string, path: string | undefined): string | null {
  if (isAbsolute(configurado)) {
    return basename(configurado) === "claude" && executavel(configurado) ? configurado : null;
  }
  return resolverNoPath(configurado, path);
}

/** Um executável pelo nome, só nas pastas absolutas do PATH (ex.: o `script` do util-linux). */
export function resolverNoPath(nome: string, path: string | undefined): string | null {
  if (nome.includes("/")) return null;
  for (const pasta of (path ?? "").split(":")) {
    if (pasta === "" || !isAbsolute(pasta)) continue;
    const candidato = join(pasta, nome);
    if (executavel(candidato)) return candidato;
  }
  return null;
}

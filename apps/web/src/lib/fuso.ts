import { exigirFuso, FUSO_PADRAO, fusoValido, nomeDoFuso } from "@zentrade/dominio";

/**
 * O fuso da instância (ZENTRADE_FUSO), que a API informa em `GET /publico/config`: o
 * "hoje" da tela (perda do dia, conversas de hoje, filtros por data, horários) é o mesmo
 * do motor e da API, não o do navegador nem o UTC. Lido uma vez na partida (main.tsx),
 * antes de desenhar a tela; até lá, e se a API não responder, vale o horário de Brasília.
 */
let atual: string = FUSO_PADRAO;

export const fusoDaInstancia = (): string => atual;

/** "horário de Brasília", para os textos da tela. */
export const nomeDoFusoDaInstancia = (): string => nomeDoFuso(atual);

/** Troca o fuso da tela; um nome inválido é ignorado (fica o anterior). */
export function definirFusoDaInstancia(fuso: string): void {
  if (fusoValido(fuso)) atual = exigirFuso(fuso);
}

/**
 * Lê o fuso da config pública. Sem a API (fora do ar, demo), fica o padrão: a tela abre
 * mesmo assim, e o motor e a API continuam valendo pelo fuso deles.
 */
export async function carregarFusoDaInstancia(ler: () => Promise<{ readonly fuso?: string }>): Promise<void> {
  try {
    const { fuso } = await ler();
    if (fuso) definirFusoDaInstancia(fuso);
  } catch {
    // Intencional: o fuso é só para mostrar; sem ele a tela usa o horário de Brasília.
  }
}

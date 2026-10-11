import { useEffect, useState } from "react";

/**
 * O gráfico desenha em canvas e não lê CSS: as cores vêm das variáveis do tema e
 * são relidas quando o tema muda (atributo data-tema ou preferência do sistema).
 */
export interface CoresGrafico {
  readonly texto: string;
  readonly apagado: string;
  readonly linha: string;
  readonly marca: string;
  readonly ganho: string;
  readonly perda: string;
  readonly atencao: string;
  readonly superficie: string;
}

const VARIAVEIS: Record<keyof CoresGrafico, string> = {
  texto: "--texto",
  apagado: "--apagado",
  linha: "--linha",
  marca: "--marca",
  ganho: "--ganho",
  perda: "--perda",
  atencao: "--atencao",
  superficie: "--superficie",
};

export function lerCores(): CoresGrafico {
  const estilo = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(VARIAVEIS).map(([chave, variavel]) => [
      chave,
      estilo.getPropertyValue(variavel).trim() || "#888",
    ]),
  ) as unknown as CoresGrafico;
}

export function useCoresGrafico(): CoresGrafico {
  const [cores, setCores] = useState(lerCores);
  useEffect(() => {
    const atualizar = (): void => setCores(lerCores());
    const observador = new MutationObserver(atualizar);
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    mql.addEventListener("change", atualizar);
    return () => {
      observador.disconnect();
      mql.removeEventListener("change", atualizar);
    };
  }, []);
  return cores;
}

/** "#3ddc8e" + 0,2 → "rgba(61, 220, 142, 0.2)". O canvas do gráfico não entende color-mix. */
export function comAlfa(hex: string, alfa: number): string {
  const h = hex.replace("#", "");
  const cheio = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  const n = Number.parseInt(cheio, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

import { NAVEGACAO, type RotaApp } from "./navegacao";

import type { Comando } from "./comandosBusca";

/** Os comandos de navegação e os atalhos "g + letra" (a busca está em comandosBusca). */
/** "g" e depois a letra. Uma letra por tela; a ajuda de atalhos ("?") mostra a lista. */
export const ATALHOS_IR: Readonly<Record<string, RotaApp>> = {
  v: "/",
  a: "/aovivo",
  m: "/mercado",
  d: "/decisoes",
  o: "/ordens",
  r: "/robos",
  e: "/estrategias",
  b: "/backtests",
  c: "/conhecimento",
  p: "/risco",
  k: "/contas",
};

const SINONIMOS: Partial<Record<RotaApp, string>> = {
  "/": "inicio painel dashboard resumo comece primeiros passos",
  "/risco": "parar tudo parada total limites pausas proteger",
  "/contas": "chaves binance api 2fa autenticador seguranca",
  "/decisoes": "aprovar sugestoes diario",
  "/ordens": "posicoes execucoes taxas",
  "/backtests": "teste passado veredito simulacao",
  "/estrategias": "regras modelos construtor",
  "/assistente": "chat ia perguntar",
};

export function comandosDeNavegacao(navegar: (para: RotaApp) => void): Comando[] {
  const letraDe = new Map(Object.entries(ATALHOS_IR).map(([letra, para]) => [para, letra]));
  return NAVEGACAO.flatMap((g) =>
    g.itens.map((item) => {
      const letra = letraDe.get(item.para);
      const palavras = [g.titulo, SINONIMOS[item.para]].filter(Boolean).join(" ");
      return {
        id: `ir:${item.para}`,
        titulo: item.rotulo,
        grupo: "Ir para" as const,
        palavras,
        ...(letra ? { atalho: `g ${letra}` } : {}),
        executar: () => navegar(item.para),
      };
    }),
  );
}

export { filtrarComandos, type Comando, type GrupoComando } from "./comandosBusca";

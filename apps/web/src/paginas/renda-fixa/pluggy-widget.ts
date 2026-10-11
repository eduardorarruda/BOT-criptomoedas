/**
 * Widget Pluggy Connect, carregado do CDN oficial só quando a pessoa clica em
 * "Conectar banco" (o script tem ~900 KB). O navegador recebe apenas o connect
 * token de 30 minutos; o client secret nunca sai da API.
 */
export const SCRIPT_PLUGGY = "https://cdn.pluggy.ai/pluggy-connect/v2.11.0/pluggy-connect.js";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OpcoesWidget {
  connectToken: string;
  includeSandbox?: boolean;
  updateItem?: string;
  language?: string;
  theme?: "dark" | "light";
  countries?: string[];
  onSuccess?: (dados: { item: { id: string } }) => void;
  onError?: (erro: { message?: string; data?: unknown }) => void;
  onClose?: () => void;
}

interface PluggyConnectGlobal {
  new (opcoes: OpcoesWidget): { init(): Promise<void> };
}

declare global {
  interface Window {
    PluggyConnect?: PluggyConnectGlobal;
  }
}

let carregando: Promise<PluggyConnectGlobal> | null = null;

export function carregarWidget(documento: Document = document): Promise<PluggyConnectGlobal> {
  if (window.PluggyConnect) return Promise.resolve(window.PluggyConnect);
  carregando ??= new Promise((resolver, rejeitar) => {
    const s = documento.createElement("script");
    s.src = SCRIPT_PLUGGY;
    s.async = true;
    s.onload = () =>
      window.PluggyConnect
        ? resolver(window.PluggyConnect)
        : rejeitar(new Error("o widget da Pluggy não carregou"));
    s.onerror = () => {
      carregando = null;
      rejeitar(
        new Error(
          "não deu para carregar o widget da Pluggy; confira a internet e se algum bloqueador barrou cdn.pluggy.ai",
        ),
      );
    };
    documento.head.appendChild(s);
  });
  return carregando;
}

/** No ITEM_USER_ALREADY_EXISTS a Pluggy às vezes manda o item que já existe: é ele que queremos. */
export function idExistente(dados: unknown): string | null {
  const d = (dados ?? {}) as { item?: { id?: unknown }; items?: unknown[] };
  const candidatos = [
    d.item?.id,
    ...(Array.isArray(d.items) ? d.items : []).map((x) =>
      typeof x === "string" ? x : (x as { id?: unknown })?.id,
    ),
  ];
  return candidatos.find((c): c is string => typeof c === "string" && UUID.test(c)) ?? null;
}

const tema = (): "dark" | "light" => {
  const escolhido = document.documentElement.dataset.tema;
  if (escolhido === "claro") return "light";
  if (escolhido === "escuro") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

/** Abre o widget e devolve o id do item conectado, ou null se a pessoa fechou sem conectar. */
export async function abrirWidget(connectToken: string, itemId?: string): Promise<string | null> {
  const PluggyConnect = await carregarWidget();
  return new Promise((resolver, rejeitar) => {
    let concluido = false;
    const widget = new PluggyConnect({
      connectToken,
      language: "pt",
      theme: tema(),
      countries: ["BR"],
      ...(itemId ? { updateItem: itemId } : {}),
      onSuccess: ({ item }) => {
        concluido = true;
        resolver(item.id);
      },
      onError: (erro) => {
        concluido = true;
        const existente = idExistente(erro.data);
        if (existente) resolver(existente);
        else
          rejeitar(
            new Error(erro.message ? `a Pluggy recusou: ${erro.message}` : "a conexão pela Pluggy falhou"),
          );
      },
      onClose: () => {
        if (!concluido) resolver(null);
      },
    });
    widget.init().catch(rejeitar);
  });
}

export const ehUuid = (t: string): boolean => UUID.test(t.trim());

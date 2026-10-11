import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { Fonte } from "./api/fonte";
import { chaves } from "./ganchos/chaves";
import { Casca } from "./layout/Casca";
import { NaoEncontrada } from "./paginas/NaoEncontrada";

/**
 * Rotas (código, sem gerador). Tudo depois de /entrar exige sessão; as telas com
 * gráfico carregam sob demanda para a primeira tela abrir rápido.
 */
export interface ContextoRotas {
  readonly queryClient: QueryClient;
  readonly fonte: Fonte;
}

const raiz = createRootRouteWithContext<ContextoRotas>()({
  component: Outlet,
  notFoundComponent: NaoEncontrada,
});

async function sessaoAtual(ctx: ContextoRotas) {
  return ctx.queryClient.ensureQueryData({ queryKey: chaves.sessao, queryFn: () => ctx.fonte.obterSessao() });
}

/** Só aceita voltar para um caminho interno ("/x"), nunca para outro site. */
export function destinoSeguro(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.startsWith("/") && !valor.startsWith("//") ? valor : undefined;
}

const entrar = createRoute({
  getParentRoute: () => raiz,
  path: "/entrar",
  validateSearch: (s: Record<string, unknown>): { voltar?: string } => {
    const voltar = destinoSeguro(s.voltar);
    return voltar ? { voltar } : {};
  },
  beforeLoad: async ({ context }) => {
    if (await sessaoAtual(context)) throw redirect({ to: "/" });
  },
  component: lazyRouteComponent(() => import("./paginas/Entrar"), "Entrar"),
});

const app = createRoute({
  getParentRoute: () => raiz,
  id: "app",
  beforeLoad: async ({ context, location }) => {
    if (!(await sessaoAtual(context))) throw redirect({ to: "/entrar", search: { voltar: location.href } });
  },
  component: Casca,
});

const pagina = <P extends string, M extends Record<string, ComponentType>>(
  path: P,
  carregar: () => Promise<M>,
  nome: keyof M & string,
) => createRoute({ getParentRoute: () => app, path, component: lazyRouteComponent(carregar, nome) });

/** Ao vivo: `?robo=<id>` abre direto num robô (sem ele, todos). */
const aoVivo = createRoute({
  getParentRoute: () => app,
  path: "/aovivo",
  validateSearch: (s: Record<string, unknown>): { robo?: string } =>
    typeof s.robo === "string" && s.robo.length > 0 && s.robo.length <= 64 ? { robo: s.robo } : {},
  component: lazyRouteComponent(() => import("./paginas/aovivo/AoVivo"), "AoVivo"),
});

const arvore = raiz.addChildren([
  entrar,
  app.addChildren([
    pagina("/", () => import("./paginas/VisaoGeral"), "VisaoGeral"),
    aoVivo,
    pagina("/assistente", () => import("./paginas/assistente/Assistente"), "Assistente"),
    pagina("/assistente/configuracoes", () => import("./paginas/assistente/Configuracoes"), "Configuracoes"),
    pagina("/mercado", () => import("./paginas/Mercado"), "Mercado"),
    pagina("/decisoes", () => import("./paginas/Decisoes"), "Decisoes"),
    pagina("/ordens", () => import("./paginas/Ordens"), "Ordens"),
    pagina("/carteira", () => import("./paginas/carteira/Carteira"), "Carteira"),
    pagina("/renda-fixa", () => import("./paginas/renda-fixa/RendaFixa"), "RendaFixa"),
    pagina("/robos", () => import("./paginas/Robos"), "Robos"),
    pagina("/estrategias", () => import("./paginas/Estrategias"), "Estrategias"),
    pagina("/backtests", () => import("./paginas/Backtests"), "Backtests"),
    pagina("/conhecimento", () => import("./paginas/Conhecimento"), "Conhecimento"),
    pagina("/risco", () => import("./paginas/Risco"), "Risco"),
    pagina("/automacoes", () => import("./paginas/Automacoes"), "Automacoes"),
    pagina("/contas", () => import("./paginas/Contas"), "Contas"),
    pagina("/tokens", () => import("./paginas/Tokens"), "Tokens"),
  ]),
]);

export function criarRoteador(contexto: ContextoRotas) {
  return createRouter({
    routeTree: arvore,
    context: contexto,
    defaultPreload: "intent",
    defaultPendingMs: 150,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof criarRoteador>;
  }
}

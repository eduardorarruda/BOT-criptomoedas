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
import { validarBusca } from "./componentes/filtros/esquemas";
import { chaves } from "./ganchos/chaves";
import { Casca } from "./layout/Casca";
import { buscaCarteira } from "./paginas/carteira/filtros";
import { buscaDecisoes } from "./paginas/decisoes/filtros";
import { buscaImobiliario } from "./paginas/imobiliario/filtros";
import { NaoEncontrada } from "./paginas/NaoEncontrada";
import { buscaOrdens } from "./paginas/ordens/filtros";
import { buscaRendaFixa } from "./paginas/renda-fixa/filtros";

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

/** Assistente: `?conversa=<id>` abre direto numa conversa (sem ele, uma conversa nova). */
const assistente = createRoute({
  getParentRoute: () => app,
  path: "/assistente",
  validateSearch: (s: Record<string, unknown>): { conversa?: string } =>
    typeof s.conversa === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s.conversa)
      ? { conversa: s.conversa }
      : {},
  component: lazyRouteComponent(() => import("./paginas/assistente/RotaAssistente"), "RotaAssistente"),
});

/**
 * Telas de dados com filtros na URL (`?robo=r-sol&periodo=30d&visao=tabela`): o link
 * abre igual, recarregar mantém e voltar desfaz. Parâmetro inválido é descartado.
 */
const decisoes = createRoute({
  getParentRoute: () => app,
  path: "/decisoes",
  validateSearch: validarBusca(buscaDecisoes),
  component: lazyRouteComponent(() => import("./paginas/Decisoes"), "Decisoes"),
});

const ordens = createRoute({
  getParentRoute: () => app,
  path: "/ordens",
  validateSearch: validarBusca(buscaOrdens),
  component: lazyRouteComponent(() => import("./paginas/Ordens"), "Ordens"),
});

const rendaFixa = createRoute({
  getParentRoute: () => app,
  path: "/renda-fixa",
  validateSearch: validarBusca(buscaRendaFixa),
  component: lazyRouteComponent(() => import("./paginas/renda-fixa/RendaFixa"), "RendaFixa"),
});

const carteira = createRoute({
  getParentRoute: () => app,
  path: "/carteira",
  validateSearch: validarBusca(buscaCarteira),
  component: lazyRouteComponent(() => import("./paginas/carteira/Carteira"), "Carteira"),
});

const imobiliario = createRoute({
  getParentRoute: () => app,
  path: "/imobiliario",
  validateSearch: validarBusca(buscaImobiliario),
  component: lazyRouteComponent(() => import("./paginas/imobiliario/VisaoImobiliario"), "VisaoImobiliario"),
});

const arvore = raiz.addChildren([
  entrar,
  app.addChildren([
    pagina("/", () => import("./paginas/VisaoGeral"), "VisaoGeral"),
    aoVivo,
    assistente,
    pagina("/assistente/configuracoes", () => import("./paginas/assistente/Configuracoes"), "Configuracoes"),
    pagina("/mercado", () => import("./paginas/Mercado"), "Mercado"),
    decisoes,
    ordens,
    pagina("/patrimonio", () => import("./paginas/patrimonio/Patrimonio"), "Patrimonio"),
    carteira,
    rendaFixa,
    pagina("/robos", () => import("./paginas/Robos"), "Robos"),
    pagina("/estrategias", () => import("./paginas/Estrategias"), "Estrategias"),
    pagina("/backtests", () => import("./paginas/Backtests"), "Backtests"),
    pagina("/conhecimento", () => import("./paginas/Conhecimento"), "Conhecimento"),
    pagina("/risco", () => import("./paginas/Risco"), "Risco"),
    pagina("/automacoes", () => import("./paginas/Automacoes"), "Automacoes"),
    pagina("/contas", () => import("./paginas/Contas"), "Contas"),
    pagina("/tokens", () => import("./paginas/Tokens"), "Tokens"),
    imobiliario,
    pagina("/imobiliario/novo", () => import("./paginas/imobiliario/NovoInvestimento"), "NovoInvestimento"),
    pagina("/imobiliario/simuladores", () => import("./paginas/imobiliario/Simuladores"), "Simuladores"),
    pagina(
      "/imobiliario/$id",
      () => import("./paginas/imobiliario/DetalheInvestimento"),
      "DetalheInvestimento",
    ),
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

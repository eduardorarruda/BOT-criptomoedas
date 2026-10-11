import {
  NovoInvestimentoImobiliarioEsquema,
  NovoLancamentoImobiliarioEsquema,
  type DetalheImobiliario,
  type InvestimentoImobiliario,
  type LancamentoImobiliario,
  type MudancaInvestimentoImobiliario,
  type NovoInvestimentoImobiliario,
  type NovoLancamentoImobiliario,
} from "@zentrade/contratos/esquemas";
import { ErroParametroFinanceiro, metricasEmTexto, tabelaEmTexto, visaoEmTexto } from "@zentrade/financas";
import { ErroApi } from "../../api/erros";
import { exemplosDemo } from "./demo-exemplos";
import type { ConsultaImobiliario, FonteImobiliario } from "./fonte";

/**
 * O imobiliário no modo de demonstração: carteira de exemplo em memória, com as
 * mesmas contas da API (@zentrade/financas) e as mesmas recusas. Nada sai do navegador.
 */
interface Registro {
  investimento: InvestimentoImobiliario;
  lancamentos: LancamentoImobiliario[];
}

const CAMPOS_VAZIOS = {
  ticker: null,
  observacoes: null,
  valorAtual: null,
  valorAtualEm: null,
  cambioAtual: null,
  valorizacaoAnual: null,
  aluguelPrevisto: null,
  taxaAdministracao: null,
  diaria: null,
  ocupacao: null,
  taxaPlataforma: null,
  precoVendaAlvo: null,
  prazoMeses: null,
  dataEntrega: null,
  valorCarta: null,
  fundoReserva: null,
  contempladoEm: null,
  financiamento: null,
} as const;

const invalido = (mensagem: string) => new ErroApi("dados_invalidos", mensagem, 400);
const naoEncontrado = () => new ErroApi("nao_encontrado", "Investimento não encontrado.", 404);

function lancamento(investimentoId: string, l: NovoLancamentoImobiliario): LancamentoImobiliario {
  return {
    id: crypto.randomUUID(),
    investimentoId,
    data: l.data,
    tipo: l.tipo,
    categoria: l.categoria,
    valor: l.valor,
    quantidade: l.quantidade ?? null,
    cambio: l.cambio ?? null,
    descricao: l.descricao ?? null,
    criadoEm: Date.now(),
  };
}

function montar(novo: NovoInvestimentoImobiliario): Registro {
  const { lancamentosIniciais, tipo, moeda, ...campos } = novo;
  const id = crypto.randomUUID();
  const agora = Date.now();
  const definidos = Object.fromEntries(
    Object.entries(campos).filter(([, v]) => v !== undefined),
  ) as Partial<InvestimentoImobiliario>;
  const investimento: InvestimentoImobiliario = {
    ...CAMPOS_VAZIOS,
    ...definidos,
    nome: campos.nome,
    id,
    tipo,
    moeda: moeda ?? "BRL",
    criadoEm: agora,
    atualizadoEm: agora,
  };
  const lancamentos = (lancamentosIniciais ?? []).map((l) => lancamento(id, l));
  return { investimento, lancamentos: lancamentos.sort((a, b) => a.data.localeCompare(b.data)) };
}

const lerOuRecusar = <T>(
  r: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } },
): T => {
  if (!r.success) throw invalido(r.error.issues.map((i) => i.message).join("; "));
  return r.data;
};

/** A carteira em memória e as contas sobre ela (as mesmas da API). */
function carteira(hoje: string) {
  const registros = new Map<string, Registro>(
    exemplosDemo(hoje).map((n) => {
      const r = montar(n);
      return [r.investimento.id, r];
    }),
  );
  const opcoes = (c: ConsultaImobiliario) => ({ dataBase: c.dataBase ?? hoje, cdiAnual: c.cdiAnual ?? null });
  const metricas = (r: Registro, c: ConsultaImobiliario) =>
    metricasEmTexto(r.investimento, r.lancamentos, opcoes(c));
  return {
    registros,
    opcoes,
    metricas,
    obter(id: string): Registro {
      const r = registros.get(id);
      if (!r) throw naoEncontrado();
      return r;
    },
    detalhe: (r: Registro, c: ConsultaImobiliario): DetalheImobiliario => ({
      investimento: r.investimento,
      metricas: metricas(r, c),
      erroMetricas: null,
      lancamentos: r.lancamentos,
      tabela: r.investimento.financiamento ? tabelaEmTexto(r.investimento.financiamento) : null,
      cotacao: null,
    }),
    /** A mesma conferência da API: se a conta não fecha, nada muda. */
    gravar(r: Registro): Registro {
      try {
        metricas(r, { dataBase: r.lancamentos.reduce((m, l) => (l.data > m ? l.data : m), hoje) });
      } catch (e) {
        if (e instanceof ErroParametroFinanceiro) throw invalido(e.message);
        throw e;
      }
      registros.set(r.investimento.id, r);
      return r;
    },
  };
}

export function criarFonteImobiliarioDemo(hoje: string): FonteImobiliario {
  const c = carteira(hoje);
  return {
    async visao(consulta) {
      const itens = [...c.registros.values()].map((r) => ({
        investimento: r.investimento,
        metricas: c.metricas(r, consulta),
        erroMetricas: null,
      }));
      const base = itens.map((i) => ({ tipo: i.investimento.tipo, metricas: i.metricas }));
      return { ...visaoEmTexto(base, c.opcoes(consulta)), itens };
    },
    detalhe: async (id, consulta) => c.detalhe(c.obter(id), consulta),
    async criar(novo) {
      const lido = lerOuRecusar(NovoInvestimentoImobiliarioEsquema.safeParse(novo));
      return c.detalhe(c.gravar(montar(lido)), {});
    },
    async atualizar(id, m: MudancaInvestimentoImobiliario) {
      const atual = c.obter(id);
      const definidos = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined));
      const investimento = { ...atual.investimento, ...definidos, atualizadoEm: Date.now() };
      return c.detalhe(c.gravar({ ...atual, investimento }), {});
    },
    async remover(id) {
      c.obter(id);
      c.registros.delete(id);
    },
    async adicionarLancamento(id, l) {
      const novo = lancamento(id, lerOuRecusar(NovoLancamentoImobiliarioEsquema.safeParse(l)));
      const atual = c.obter(id);
      const lancamentos = [...atual.lancamentos, novo].sort((a, b) => a.data.localeCompare(b.data));
      c.gravar({ ...atual, lancamentos });
      return novo;
    },
    async removerLancamento(id, lancamentoId) {
      const atual = c.obter(id);
      if (!atual.lancamentos.some((l) => l.id === lancamentoId)) throw naoEncontrado();
      c.gravar({ ...atual, lancamentos: atual.lancamentos.filter((l) => l.id !== lancamentoId) });
    },
  };
}

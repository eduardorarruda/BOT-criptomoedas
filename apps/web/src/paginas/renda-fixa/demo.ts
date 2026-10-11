import type { NovoTitulo, ResumoRendaFixa, TituloRendaFixa } from "@zentrade/contratos/esquemas";
import { dec, paraTexto, type Valor } from "@zentrade/dominio";
import {
  compararSelicCdbPoupanca,
  comPremissasInformadas,
  consolidar,
  equivalenciaIsento,
  posicaoDoTitulo,
  premissasDosIndices,
  preVersusIpca,
  projetar,
  rendimentoNoPeriodo,
  vencimentos,
  type Titulo,
} from "@zentrade/financas";
import { ErroApi } from "../../api/erros";
import { carteiraDemo, indicesDemo } from "./demo-dados";
import {
  dinheiro,
  indicadoresDto,
  isentoDto,
  percentual,
  posicaoDto,
  preIpcaDto,
  projecaoDto,
  regrasDto,
  selicDto,
} from "./demo-conversao";
import type { FonteRendaFixa } from "./fonte";

type Gravado = NovoTitulo & {
  readonly id: string;
  readonly origem?: "manual" | "pluggy";
  readonly grupo: string | null;
  readonly atualizadoEm: number;
};

const diaLocal = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function paraTitulo(g: Gravado): Titulo {
  const opc = (v: string | null | undefined) => (v === null || v === undefined ? null : dec(v));
  return {
    id: g.id,
    tipo: g.tipo,
    nome: g.nome,
    emissor: g.emissor ?? null,
    indexador: g.indexador,
    percentualIndexador: opc(g.percentualIndexador),
    taxaAnual: opc(g.taxaAnual),
    dataAplicacao: g.dataAplicacao,
    vencimento: g.vencimento ?? null,
    valorAplicado: dec(g.valorAplicado),
    liquidez: g.liquidez,
    carenciaAte: g.carenciaAte ?? null,
    informado: null,
    grupo: g.grupo,
  };
}

/** Elemento que tem de existir (índice já conferido); se não existir, é erro de programação. */
function existe<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("título da demonstração fora da lista");
  return v;
}

const PLUGGY_DEMO =
  "Na demonstração não há conexão com bancos. Rode a API com PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET para conectar sua conta pela Pluggy.";

/** Renda fixa inteira no navegador, com índices e carteira de mentira, pelas mesmas contas da API. */
export function criarFonteRendaFixaDemo(agora: () => number = Date.now): FonteRendaFixa {
  const hoje = () => diaLocal(agora());
  let proximo = 0;
  const novoId = () => `00000000-0000-4000-8000-${String(++proximo).padStart(12, "0")}`;
  let gravados: Gravado[] = carteiraDemo(hoje()).map((t) => ({
    ...t,
    id: novoId(),
    grupo: t.grupo ?? null,
    atualizadoEm: agora(),
  }));

  function calcular() {
    const h = hoje();
    const indices = indicesDemo(h);
    const ipca = premissasDosIndices(indices, h).ipcaAnual?.valor;
    const titulos = gravados.map(paraTitulo);
    const posicoes = titulos.map((t) =>
      posicaoDoTitulo(t, indices, { hoje: h, ...(ipca ? { ipcaProjetadoAnual: ipca } : {}) }),
    );
    return { h, indices, ipca, titulos, posicoes };
  }

  const dto = (
    g: Gravado,
    i: number,
    posicoes: ReturnType<typeof calcular>["posicoes"],
  ): TituloRendaFixa => ({
    id: g.id,
    origem: g.origem ?? "manual",
    itemId: g.origem === "pluggy" ? "demo-item-pluggy" : null,
    grupo: g.grupo,
    tipo: g.tipo,
    nome: g.nome,
    emissor: g.emissor ?? null,
    indexador: g.indexador,
    percentualIndexador: g.percentualIndexador ?? null,
    taxaAnual: g.taxaAnual ?? null,
    dataAplicacao: g.dataAplicacao,
    vencimento: g.vencimento ?? null,
    valorAplicado: paraTexto(dec(g.valorAplicado)),
    liquidez: g.liquidez,
    carenciaAte: g.carenciaAte ?? null,
    informado: null,
    atualizadoEm: g.atualizadoEm,
    posicao: posicaoDto(existe(posicoes[i])),
  });

  const achar = (id: string): number => {
    const i = gravados.findIndex((g) => g.id === id);
    if (i < 0) throw new ErroApi("nao_encontrado", "Título não encontrado na demonstração.", 404);
    return i;
  };

  async function resumo(): Promise<ResumoRendaFixa> {
    const c = calcular();
    const s = consolidar(c.titulos, c.posicoes, c.h);
    const mes = c.titulos.map((t) => rendimentoNoPeriodo(t, c.indices, `${c.h.slice(0, 7)}-01`, c.h, c.ipca));
    const aloc = (a: (typeof s.porTipo)[number] | (typeof s.porIndexador)[number]) => ({
      chave: a.chave,
      bruto: dinheiro(a.bruto),
      fracao: percentual(a.fracao),
    });
    return {
      hoje: c.h,
      quantidade: s.quantidade,
      indisponiveis: [...s.indisponiveis],
      aplicado: dinheiro(s.aplicado),
      bruto: dinheiro(s.bruto),
      iof: dinheiro(s.iof),
      ir: dinheiro(s.ir),
      liquido: dinheiro(s.liquido),
      rendimentoBruto: dinheiro(s.rendimentoBruto),
      rendimentoLiquido: dinheiro(s.rendimentoLiquido),
      rentabilidadeBrutaPct: percentual(s.rentabilidadeBrutaPct),
      rentabilidadeLiquidaPct: percentual(s.rentabilidadeLiquidaPct),
      rendimentoMes: mes.some((r) => r === null)
        ? null
        : dinheiro(mes.reduce((a: Valor, r) => a.plus(r ?? 0), dec(0))),
      porTipo: s.porTipo.map(aloc),
      porIndexador: s.porIndexador.map(aloc),
      proximoVencimento: s.proximoVencimento,
      vencimentos: vencimentos(c.titulos, c.h),
      indicadores: indicadoresDto(c.indices, agora()),
    };
  }

  return {
    demo: true,
    resumo,
    titulos: async () => {
      const c = calcular();
      return gravados.map((g, i) => dto(g, i, c.posicoes));
    },
    async titulo(id, p = {}) {
      const i = achar(id);
      const c = calcular();
      const posicao = existe(c.posicoes[i]);
      const premissas = comPremissasInformadas(premissasDosIndices(c.indices, c.h), {
        ...(p.cdi ? { cdiAnual: dec(p.cdi) } : {}),
        ...(p.selic ? { selicAnual: dec(p.selic) } : {}),
        ...(p.ipca ? { ipcaAnual: dec(p.ipca) } : {}),
      });
      const projecao = posicao.disponivel
        ? projecaoDto(projetar(existe(c.titulos[i]), posicao, premissas))
        : { disponivel: false as const, motivo: posicao.motivo };
      return { ...dto(existe(gravados[i]), i, c.posicoes), projecao };
    },
    async criarTitulo(t) {
      gravados = [...gravados, { ...t, id: novoId(), grupo: null, atualizadoEm: agora() }];
      const c = calcular();
      return dto(existe(gravados.at(-1)), gravados.length - 1, c.posicoes);
    },
    async alterarTitulo(id, m) {
      const i = achar(id);
      const definidos = Object.fromEntries(
        Object.entries(m).filter(([, v]) => v !== undefined),
      ) as Partial<NovoTitulo>;
      gravados = gravados.map((g, j) => (j === i ? { ...g, ...definidos, atualizadoEm: agora() } : g));
      return dto(existe(gravados[i]), i, calcular().posicoes);
    },
    async removerTitulo(id) {
      const i = achar(id);
      gravados = gravados.filter((_, j) => j !== i);
    },
    indicadores: async () => indicadoresDto(indicesDemo(hoje()), agora()),
    atualizarIndicadores: async () => indicadoresDto(indicesDemo(hoje()), agora()),
    regras: async () => regrasDto(),
    simularIsento: async (e) =>
      isentoDto(
        equivalenciaIsento({
          ...e,
          percentualCdi: dec(e.percentualCdi),
          cdiAnual: dec(e.cdiAnual),
          inicio: hoje(),
        }),
      ),
    simularSelicCdbPoupanca: async (e) =>
      selicDto(
        compararSelicCdbPoupanca({
          valor: dec(e.valor),
          inicio: hoje(),
          prazoDias: e.prazoDias,
          selicAnual: dec(e.selicAnual),
          cdiAnual: dec(e.cdiAnual),
          percentualCdb: dec(e.percentualCdb),
          metaSelicAnual: dec(e.metaSelicAnual),
          trMensal: dec(e.trMensal),
        }),
      ),
    simularPreIpca: async (e) =>
      preIpcaDto(
        preVersusIpca({
          valor: dec(e.valor),
          inicio: hoje(),
          prazoDias: e.prazoDias,
          taxaPre: dec(e.taxaPre),
          taxaReal: dec(e.taxaReal),
          ipcaEsperado: dec(e.ipcaEsperado),
        }),
      ),
    pluggy: async () => ({ configurada: false, itens: [] }),
    connectToken: async () => Promise.reject(new ErroApi("pluggy_nao_configurada", PLUGGY_DEMO, 503)),
    conectarItem: async () => Promise.reject(new ErroApi("pluggy_nao_configurada", PLUGGY_DEMO, 503)),
    sincronizarItem: async () => Promise.reject(new ErroApi("pluggy_nao_configurada", PLUGGY_DEMO, 503)),
    removerItem: async () => undefined,
  };
}

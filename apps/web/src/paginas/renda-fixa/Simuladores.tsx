import type { ResultadoIsento, ResultadoPreIpca } from "@zentrade/contratos/esquemas";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Painel } from "../../componentes/Cabecalho";
import { CampoSelecao } from "../../componentes/Campo";
import { Segmentado } from "../../componentes/Segmentado";
import { numeroDigitado } from "./Cadastro";
import { useFonteRendaFixa, useResumoRF } from "./consultas";
import { data, pct, reais } from "./formato";
import { Legenda, Linhas } from "./Graficos";
import {
  Campo,
  exigirNumeros,
  Formulario,
  Premissas,
  reaisCurto,
  TabelaAlternativas,
  taxasIniciais,
} from "./simulador-comum";

type Qual = "isento" | "selic" | "pre";

function VistaIsento({
  r,
  isentoParaTributado,
}: {
  readonly r: ResultadoIsento;
  readonly isentoParaTributado: boolean;
}) {
  return (
    <div className="rf-resultado" aria-live="polite">
      <p className="rf-resultado__destaque">
        {isentoParaTributado ? "Um CDB precisa render" : "Uma LCI/LCA isenta equivale a"}{" "}
        <strong className="num">{pct(r.equivalente)} do CDI</strong> para empatar no líquido (IR de{" "}
        {pct(r.aliquotaIrPct, { casas: 1 })}). Conta de bolso: {pct(r.regraDeBolso)}.
      </p>
      <Linhas
        rotulo="Percentual do CDI equivalente por prazo"
        rotulosX={r.curva.map((c) => `${c.prazoDias}d`)}
        series={[
          { nome: "Equivalente", valores: r.curva.map((c) => Number(c.equivalente)), cor: "var(--rf-1)" },
        ]}
        formatarY={(n) => `${n.toFixed(0)}%`}
      />
      <Premissas itens={r.premissas} />
    </div>
  );
}

function Isento({ cdi }: { readonly cdi: string }) {
  const f = useFonteRendaFixa();
  const [v, setV] = useState({
    direcao: "isento_para_tributado" as "isento_para_tributado" | "tributado_para_isento",
    percentual: "90",
    prazo: "365",
    cdi,
  });
  const sim = useMutation({
    mutationFn: () => (
      exigirNumeros({ a: v.percentual, b: v.prazo, c: v.cdi }),
      f.simularIsento({
        direcao: v.direcao,
        percentualCdi: numeroDigitado(v.percentual),
        prazoDias: Number(v.prazo),
        cdiAnual: numeroDigitado(v.cdi),
      })
    ),
  });
  const r = sim.data;
  const isentoParaTributado = v.direcao === "isento_para_tributado";
  return (
    <div className="pilha">
      <Formulario aoEnviar={() => sim.mutate()} carregando={sim.isPending} erro={sim.error}>
        <CampoSelecao
          rotulo="Comparar"
          value={v.direcao}
          onChange={(e) => setV({ ...v, direcao: e.target.value as typeof v.direcao })}
        >
          <option value="isento_para_tributado">LCI/LCA → CDB equivalente</option>
          <option value="tributado_para_isento">CDB → LCI/LCA equivalente</option>
        </CampoSelecao>
        <Campo
          rotulo={isentoParaTributado ? "LCI/LCA (% do CDI)" : "CDB (% do CDI)"}
          valor={v.percentual}
          mudar={(x) => setV({ ...v, percentual: x })}
        />
        <Campo rotulo="Prazo (dias corridos)" valor={v.prazo} mudar={(x) => setV({ ...v, prazo: x })} />
        <Campo
          rotulo="CDI (% a.a.)"
          valor={v.cdi}
          mudar={(x) => setV({ ...v, cdi: x })}
          dica="começa no último publicado"
        />
      </Formulario>
      {r ? <VistaIsento r={r} isentoParaTributado={isentoParaTributado} /> : null}
    </div>
  );
}

function SelicCdbPoupanca({
  cdi,
  selic,
  meta,
  tr,
}: {
  readonly cdi: string;
  readonly selic: string;
  readonly meta: string;
  readonly tr: string;
}) {
  const f = useFonteRendaFixa();
  const [v, setV] = useState({ valor: "10000", prazo: "365", selic, cdi, percentual: "100", meta, tr });
  const sim = useMutation({
    mutationFn: () => {
      exigirNumeros(v);
      return f.simularSelicCdbPoupanca({
        valor: numeroDigitado(v.valor),
        prazoDias: Number(v.prazo),
        selicAnual: numeroDigitado(v.selic),
        cdiAnual: numeroDigitado(v.cdi),
        percentualCdb: numeroDigitado(v.percentual),
        metaSelicAnual: numeroDigitado(v.meta),
        trMensal: numeroDigitado(v.tr),
      });
    },
  });
  const r = sim.data;
  const linhas = r
    ? ([
        ["Tesouro Selic", r.tesouroSelic, "var(--rf-1)"],
        ["CDB", r.cdb, "var(--rf-2)"],
        ["Poupança", r.poupanca, "var(--rf-3)"],
      ] as const)
    : [];
  return (
    <div className="pilha">
      <Formulario aoEnviar={() => sim.mutate()} carregando={sim.isPending} erro={sim.error}>
        <Campo rotulo="Valor (R$)" valor={v.valor} mudar={(x) => setV({ ...v, valor: x })} />
        <Campo rotulo="Prazo (dias corridos)" valor={v.prazo} mudar={(x) => setV({ ...v, prazo: x })} />
        <Campo rotulo="Selic (% a.a.)" valor={v.selic} mudar={(x) => setV({ ...v, selic: x })} />
        <Campo rotulo="CDI (% a.a.)" valor={v.cdi} mudar={(x) => setV({ ...v, cdi: x })} />
        <Campo rotulo="CDB (% do CDI)" valor={v.percentual} mudar={(x) => setV({ ...v, percentual: x })} />
        <Campo
          rotulo="Meta Selic (% a.a.)"
          valor={v.meta}
          mudar={(x) => setV({ ...v, meta: x })}
          dica="decide a regra da poupança"
        />
        <Campo
          rotulo="TR (% ao mês)"
          valor={v.tr}
          mudar={(x) => setV({ ...v, tr: x })}
          dica="começa na última publicada"
        />
      </Formulario>
      {r ? (
        <div className="rf-resultado" aria-live="polite">
          <TabelaAlternativas linhas={linhas} />
          <Linhas
            rotulo="Valor bruto de cada alternativa ao longo do prazo"
            rotulosX={r.serie.map((s) => data(s.dia).slice(3))}
            series={[
              {
                nome: "Tesouro Selic",
                valores: r.serie.map((s) => Number(s.tesouroSelic)),
                cor: "var(--rf-1)",
              },
              {
                nome: "CDB",
                valores: r.serie.map((s) => Number(s.cdb)),
                cor: "var(--rf-2)",
                tracejada: true,
              },
              { nome: "Poupança", valores: r.serie.map((s) => Number(s.poupanca)), cor: "var(--rf-3)" },
            ]}
            formatarY={reaisCurto}
          />
          <Legenda
            itens={linhas.map(([nome, a, cor]) => ({ nome, cor, valor: `${reais(a.liquido)} líquido` }))}
          />
          <Premissas itens={r.premissas} />
        </div>
      ) : null}
    </div>
  );
}

function VistaPreIpca({ r, ipca }: { readonly r: ResultadoPreIpca; readonly ipca: string }) {
  // A curva vai de −2% a 14% em passos de 0,5%: o índice do equilíbrio no eixo X.
  const indiceEquilibrio = Math.round((Number(r.inflacaoEquilibrio) + 2) * 2);
  return (
    <div className="rf-resultado" aria-live="polite">
      <p className="rf-resultado__destaque">
        Os dois empatam com inflação de <strong className="num">{pct(r.inflacaoEquilibrio)} ao ano</strong>.
        Com IPCA de {pct(numeroDigitado(ipca))}: prefixado {reais(r.prefixado.liquido)} × IPCA+{" "}
        {reais(r.ipcaMais.liquido)} líquidos.
      </p>
      <Linhas
        rotulo="Valor líquido final por cenário de inflação"
        rotulosX={r.curva.map((c) => `${Number(c.ipca).toFixed(1)}%`)}
        series={[
          {
            nome: "Prefixado",
            valores: r.curva.map((c) => Number(c.prefixado)),
            cor: "var(--rf-2)",
            tracejada: true,
          },
          { nome: "IPCA+", valores: r.curva.map((c) => Number(c.ipcaMais)), cor: "var(--rf-1)" },
        ]}
        formatarY={reaisCurto}
        marcaX={{
          indice: Math.min(Math.max(indiceEquilibrio, 0), r.curva.length - 1),
          texto: "equilíbrio",
        }}
      />
      <Legenda
        itens={[
          { nome: "Prefixado", cor: "var(--rf-2)" },
          { nome: "IPCA+", cor: "var(--rf-1)" },
        ]}
      />
      <Premissas itens={r.premissas} />
    </div>
  );
}

function PreIpca() {
  const f = useFonteRendaFixa();
  const [v, setV] = useState({ valor: "10000", prazo: "1095", pre: "", real: "", ipca: "" });
  const sim = useMutation({
    mutationFn: () => {
      exigirNumeros(v);
      return f.simularPreIpca({
        valor: numeroDigitado(v.valor),
        prazoDias: Number(v.prazo),
        taxaPre: numeroDigitado(v.pre),
        taxaReal: numeroDigitado(v.real),
        ipcaEsperado: numeroDigitado(v.ipca),
      });
    },
  });
  const r = sim.data;
  return (
    <div className="pilha">
      <Formulario aoEnviar={() => sim.mutate()} carregando={sim.isPending} erro={sim.error}>
        <Campo rotulo="Valor (R$)" valor={v.valor} mudar={(x) => setV({ ...v, valor: x })} />
        <Campo rotulo="Prazo (dias corridos)" valor={v.prazo} mudar={(x) => setV({ ...v, prazo: x })} />
        <Campo
          rotulo="Prefixado (% a.a.)"
          valor={v.pre}
          mudar={(x) => setV({ ...v, pre: x })}
          dica="a taxa oferecida hoje"
        />
        <Campo
          rotulo="IPCA + (% a.a.)"
          valor={v.real}
          mudar={(x) => setV({ ...v, real: x })}
          dica="a taxa real oferecida"
        />
        <Campo
          rotulo="IPCA esperado (% a.a.)"
          valor={v.ipca}
          mudar={(x) => setV({ ...v, ipca: x })}
          dica="sua premissa"
        />
      </Formulario>
      {r ? <VistaPreIpca r={r} ipca={v.ipca} /> : null}
    </div>
  );
}

export function Simuladores() {
  const [qual, setQual] = useState<Qual>("isento");
  const resumo = useResumoRF();
  const t = taxasIniciais(resumo.data?.indicadores);
  return (
    <Painel>
      <Segmentado
        rotulo="Simulador"
        valor={qual}
        aoMudar={setQual}
        opcoes={[
          { valor: "isento", rotulo: "LCI/LCA × CDB" },
          { valor: "selic", rotulo: "Selic × CDB × poupança" },
          { valor: "pre", rotulo: "Prefixado × IPCA+" },
        ]}
      />
      {qual === "isento" ? <Isento key={`i${t.cdi}`} cdi={t.cdi} /> : null}
      {qual === "selic" ? (
        <SelicCdbPoupanca key={`s${t.cdi}`} cdi={t.cdi} selic={t.selic} meta={t.meta} tr={t.tr} />
      ) : null}
      {qual === "pre" ? <PreIpca /> : null}
    </Painel>
  );
}

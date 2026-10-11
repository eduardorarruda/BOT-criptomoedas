import type { ItemImobiliario, VisaoImobiliario as Visao } from "@zentrade/contratos/esquemas";
import { Link } from "@tanstack/react-router";
import { Building2, Calculator, Plus } from "lucide-react";
import { m } from "motion/react";
import { Cabecalho, Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { NumeroAnimado } from "../../componentes/NumeroAnimado";
import { sinalDe } from "../../lib/formatar";
import { PremissaCdi, Premissas } from "./componentes";
import { FONTE_VALOR, formatarReais, formatarTaxa, TIPOS } from "./formato";
import { useCdiPremissa, useVisaoImobiliario } from "./ganchos";
import { Rosca } from "./graficos/Rosca";
import "./imobiliario.css";

/** Visão geral do imobiliário: patrimônio, renda, alocação e cada investimento. */
const reais = (t: string) => formatarReais(t);

function Numeros({ v }: { readonly v: Visao }) {
  return (
    <dl className="imob-metricas">
      <div className="imob-metricas__destaque">
        <dt>Patrimônio imobiliário líquido</dt>
        <dd>
          <NumeroAnimado valor={v.patrimonio} formatar={reais} />
        </dd>
        <p className="metrica__nota apagado">valor atual menos dívidas, em {v.quantidade} investimentos</p>
      </div>
      <div>
        <dt>Renda mensal líquida</dt>
        <dd>
          <NumeroAnimado valor={v.rendaMensal} formatar={reais} />
        </dd>
        <p className="metrica__nota apagado">média dos últimos 12 meses, já sem despesas</p>
      </div>
      <div>
        <dt>Resultado líquido</dt>
        <dd>
          <NumeroAnimado
            valor={v.resultadoLiquido}
            formatar={(t) => formatarReais(t, { sinal: true })}
            className={sinalDe(v.resultadoLiquido) === "neutro" ? "" : sinalDe(v.resultadoLiquido)}
          />
        </dd>
        <p className="metrica__nota apagado">sobre {formatarReais(v.investido)} aportados</p>
      </div>
    </dl>
  );
}

function Cartao({ item, indice }: { readonly item: ItemImobiliario; readonly indice: number }) {
  const { investimento: inv, metricas: met } = item;
  const tipo = TIPOS[inv.tipo];
  const Icone = tipo.icone;
  return (
    <m.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(indice * 0.04, 0.3) }}
    >
      <Link to="/imobiliario/$id" params={{ id: inv.id }} className="imob-cartao">
        <span className="imob-cartao__icone" aria-hidden="true">
          <Icone size={18} strokeWidth={1.8} />
        </span>
        <span>
          <span className="imob-cartao__nome">{inv.nome}</span>
          <span className="imob-cartao__meta">
            {" "}
            · {tipo.rotulo}
            {inv.ticker ? ` · ${inv.ticker}` : ""}
          </span>
          <span className="imob-cartao__meta" style={{ display: "block" }}>
            {met ? `Valor atual ${FONTE_VALOR[met.fonteValorAtual]}` : item.erroMetricas}
          </span>
        </span>
        {met ? (
          <span className="imob-cartao__numeros">
            <span className="num">{formatarReais(met.patrimonioLiquido)}</span>
            <small className={`num ${sinalDe(met.resultadoLiquido)}`}>
              {formatarReais(met.resultadoLiquido, { sinal: true })} · TIR {formatarTaxa(met.tirAnual, 1)}{" "}
              a.a.
            </small>
            {met.cdi ? (
              <small className="num apagado">
                vs. CDI: {formatarReais(met.cdi.diferenca, { sinal: true })}
              </small>
            ) : null}
          </span>
        ) : null}
      </Link>
    </m.li>
  );
}

function Conteudo({ v }: { readonly v: Visao }) {
  if (v.quantidade === 0) {
    return (
      <EstadoVazio
        icone={Building2}
        titulo="Nenhum investimento imobiliário ainda"
        acao={
          <span className="imob-barra">
            <Link to="/imobiliario/novo" className="botao botao--primario">
              Cadastrar o primeiro
            </Link>
            <Link to="/imobiliario/simuladores" className="botao botao--secundario">
              Usar os simuladores
            </Link>
          </span>
        }
      >
        Cadastre um imóvel, um FII, um consórcio ou outro investimento para acompanhar quanto você pôs, quanto
        rendeu e quanto vale hoje. Os simuladores funcionam sem cadastro.
      </EstadoVazio>
    );
  }
  const fatias = v.alocacao.map((a) => ({
    nome: TIPOS[a.tipo].rotulo,
    valor: Number(a.valor),
    texto: formatarReais(a.valor, { compacto: true }),
  }));
  return (
    <>
      <div className="imob-topo">
        <Numeros v={v} />
        <Painel titulo="Alocação por tipo" id="titulo-alocacao">
          <Rosca
            titulo="Alocação do patrimônio imobiliário por tipo"
            fatias={fatias}
            centro={formatarReais(v.patrimonio, { compacto: true })}
            legendaCentro="patrimônio"
          />
        </Painel>
      </div>
      <Painel titulo="Investimentos" id="titulo-investimentos">
        <ul className="imob-lista" role="list">
          {v.itens.map((i, k) => (
            <Cartao key={i.investimento.id} item={i} indice={k} />
          ))}
        </ul>
      </Painel>
    </>
  );
}

const PREMISSAS_VISAO = [
  "Patrimônio = valor atual (cotação, valor informado, valorização estimada ou custo) menos o saldo devedor.",
  "Resultado líquido = patrimônio + vendas + renda − aportes − parcelas − despesas − impostos; sem IR sobre ganho ainda não realizado.",
  "TIR anual realizada pelas datas de cada lançamento, até hoje.",
];

export function VisaoImobiliario() {
  const [cdi, setCdi] = useCdiPremissa();
  const { data, error, isPending, refetch } = useVisaoImobiliario(cdi);
  return (
    <div className="pilha">
      <Cabecalho
        titulo="Imobiliário"
        acoes={
          <>
            <Link to="/imobiliario/simuladores" className="botao botao--secundario">
              <Calculator size={16} aria-hidden="true" /> Simuladores
            </Link>
            <Link to="/imobiliario/novo" className="botao botao--primario">
              <Plus size={16} aria-hidden="true" /> Cadastrar
            </Link>
          </>
        }
      >
        Imóveis, fundos, consórcio e afins: quanto você pôs, quanto rendeu e quanto vale hoje — com as contas
        à vista.
      </Cabecalho>
      <PremissaCdi cdi={cdi} aoMudar={setCdi} />
      {isPending ? <Esqueleto altura={220} rotulo="Carregando o imobiliário" /> : null}
      {error ? <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} /> : null}
      {data ? <Conteudo v={data} /> : null}
      <Premissas itens={PREMISSAS_VISAO} />
    </div>
  );
}

import type { ResumoRendaFixa } from "@zentrade/contratos/esquemas";
import { CalendarClock, CalendarRange, Landmark, Plus, PlugZap } from "lucide-react";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { NumeroAnimado } from "../../componentes/NumeroAnimado";
import { useResumoRF } from "./consultas";
import { TaxasDoDia } from "./Fontes";
import { data, fracaoPct, INDEXADOR, pct, reais, TIPO, tomDe } from "./formato";
import { corDe, Legenda, Rosca } from "./Graficos";
import type { Aba, BuscaRendaFixa } from "./filtros";

function Metricas({ r }: { readonly r: ResumoRendaFixa }) {
  const formatar = (t: string) => reais(t);
  return (
    <dl className="metricas rf-metricas">
      <div className="metrica metrica--destaque">
        <dt>Líquido estimado hoje</dt>
        <dd>
          <NumeroAnimado valor={r.liquido} formatar={formatar} />
        </dd>
        <dd className="metrica__nota">
          bruto {reais(r.bruto)} − IR {reais(r.ir)} − IOF {reais(r.iof)}
        </dd>
      </div>
      <div className="metrica">
        <dt>Total aplicado</dt>
        <dd>
          <NumeroAnimado valor={r.aplicado} formatar={formatar} />
        </dd>
        <dd className="metrica__nota">{r.quantidade} títulos</dd>
      </div>
      <div className="metrica">
        <dt>Rendimento bruto</dt>
        <dd className={tomDe(r.rendimentoBruto)}>
          <NumeroAnimado valor={r.rendimentoBruto} formatar={(t) => reais(t, { sinal: true })} />
        </dd>
        <dd className="metrica__nota">{pct(r.rentabilidadeBrutaPct, { sinal: true })} sobre o aplicado</dd>
      </div>
      <div className="metrica">
        <dt>Rendimento no mês</dt>
        <dd className={tomDe(r.rendimentoMes)}>
          {r.rendimentoMes === null ? (
            <span className="apagado">—</span>
          ) : (
            <NumeroAnimado valor={r.rendimentoMes} formatar={(t) => reais(t, { sinal: true })} />
          )}
        </dd>
        <dd className="metrica__nota">
          {r.rendimentoMes === null
            ? "falta índice para algum título"
            : `bruto, desde 01/${r.hoje.slice(5, 7)}`}
        </dd>
      </div>
      <div className="metrica">
        <dt>Próximo vencimento</dt>
        <dd className="num rf-metricas__data">{r.proximoVencimento ? data(r.proximoVencimento.dia) : "—"}</dd>
        <dd className="metrica__nota">{r.proximoVencimento?.nome ?? "nenhum título com vencimento"}</dd>
      </div>
    </dl>
  );
}

function Alocacao({
  titulo,
  itens,
  rotulos,
}: {
  readonly titulo: string;
  readonly itens: ResumoRendaFixa["porTipo"];
  readonly rotulos: Readonly<Record<string, string>>;
}) {
  const fatias = itens.map((a) => ({ rotulo: rotulos[a.chave] ?? a.chave, fracao: Number(a.fracao) }));
  return (
    <Painel titulo={titulo} className="rf-alocacao">
      <div className="rf-alocacao__corpo">
        <Rosca
          fatias={fatias}
          rotulo={`${titulo}: ${fatias.map((f) => `${f.rotulo} ${Math.round(f.fracao * 100)}%`).join(", ")}`}
        />
        <Legenda
          itens={itens.map((a, i) => ({
            nome: rotulos[a.chave] ?? a.chave,
            cor: corDe(i),
            valor: `${fracaoPct(a.fracao)} · ${reais(a.bruto)}`,
          }))}
        />
      </div>
    </Painel>
  );
}

function Vencimentos({
  r,
  abrir,
  verEscada,
}: {
  readonly r: ResumoRendaFixa;
  readonly abrir: (id: string) => void;
  readonly verEscada: () => void;
}) {
  return (
    <Painel
      titulo="Calendário de vencimentos"
      acoes={
        r.vencimentos.length > 0 ? (
          <Botao pequeno variante="fantasma" icone={CalendarRange} onClick={verEscada}>
            Ver por mês
          </Botao>
        ) : null
      }
    >
      {r.vencimentos.length === 0 ? (
        <p className="apagado">Nenhum título com data de vencimento. Caixinhas e poupança não vencem.</p>
      ) : (
        <ol className="rf-vencimentos" role="list">
          {r.vencimentos.map((v) => (
            <li key={v.tituloId}>
              <button type="button" className="rf-vencimentos__item" onClick={() => abrir(v.tituloId)}>
                <CalendarClock size={16} aria-hidden="true" />
                <span className="rf-vencimentos__texto">
                  <span className="num">{data(v.dia)}</span>
                  <span className="rf-vencimentos__nome">{v.nome}</span>
                </span>
                <span className="apagado num">em {v.diasCorridos} dias</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Painel>
  );
}

export function Visao({
  irPara,
  abrir,
  demo,
}: {
  readonly irPara: (a: Aba, extra?: BuscaRendaFixa) => void;
  readonly abrir: (id: string) => void;
  readonly demo: boolean;
}) {
  const { data: r, error, isPending, refetch } = useResumoRF();
  if (isPending) return <Esqueleto altura={180} rotulo="Calculando a carteira de renda fixa" />;
  if (error) return <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} />;
  if (r.quantidade === 0) {
    return (
      <div className="pilha">
        <EstadoVazio
          icone={Landmark}
          titulo="Nenhum título de renda fixa ainda"
          acao={
            <div className="rf-acoes">
              <Botao variante="primario" icone={PlugZap} onClick={() => irPara("conectar")}>
                Conectar banco
              </Botao>
              <Botao icone={Plus} onClick={() => irPara("cadastrar")}>
                Cadastrar à mão
              </Botao>
            </div>
          }
        >
          Conecte sua conta pela Pluggy para trazer CDBs, Tesouro e caixinhas, ou cadastre um título à mão. A
          tela calcula o valor de hoje pelos índices do Banco Central, estima IR e IOF e mostra quanto sobra
          líquido.
        </EstadoVazio>
        <Painel titulo="Taxas de referência">
          <TaxasDoDia indicadores={r.indicadores} demo={demo} />
        </Painel>
      </div>
    );
  }
  return (
    <div className="pilha">
      <Metricas r={r} />
      {r.indisponiveis.length > 0 ? (
        <p className="nota" role="status">
          {r.indisponiveis.length} título(s) sem posição: falta índice publicado ou taxa. Eles ficam fora dos
          totais até o dado existir; veja o motivo em Títulos.
        </p>
      ) : null}
      <div className="rf-grade">
        <Alocacao titulo="Por tipo" itens={r.porTipo} rotulos={TIPO} />
        <Alocacao titulo="Por indexador" itens={r.porIndexador} rotulos={INDEXADOR} />
      </div>
      <div className="rf-grade">
        <Vencimentos r={r} abrir={abrir} verEscada={() => irPara("titulos", { visao: "escada" })} />
        <Painel titulo="Taxas de referência">
          <TaxasDoDia indicadores={r.indicadores} demo={demo} />
        </Painel>
      </div>
    </div>
  );
}

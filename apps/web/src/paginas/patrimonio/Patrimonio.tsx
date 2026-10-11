import {
  CLASSES_PATRIMONIO,
  type ClassePatrimonio,
  type Patrimonio as PatrimonioDTO,
} from "@zentrade/contratos/esquemas";
import { Link } from "@tanstack/react-router";
import { ChartPie, LayoutGrid, Table2, TriangleAlert } from "lucide-react";
import { Cabecalho, Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import {
  AlternarVisao,
  BarraFiltros,
  FiltroChips,
  useFiltrosUrl,
  VisoesSalvas,
} from "../../componentes/filtros";
import { NumeroAnimado } from "../../componentes/NumeroAnimado";
import { Selo } from "../../componentes/Selo";
import { formatarPercentual, sinalDe, TRACO } from "../../lib/formatar";
import { formatarRelativo } from "../../lib/tempo";
import { reais } from "../renda-fixa/formato";
import { CartaoClasse } from "./CartaoClasse";
import {
  descreverItens,
  nadaCadastrado,
  ROTA_CLASSE,
  ROTULO_CLASSE,
  SITUACAO,
  valorDaClasse,
} from "./composicao";
import { buscaPatrimonio, classesEscolhidas, diferencaDaClasse, somarClasses, type Soma } from "./filtros";
import { usePatrimonioConsolidado } from "./ganchos";
import { GraficoComposicao } from "./GraficoComposicao";
import "./patrimonio.css";

const reaisTexto = (t: string): string => reais(t);

function Avisos({ avisos }: { readonly avisos: readonly string[] }) {
  return avisos.map((a) => (
    <p key={a} className="patrimonio-aviso">
      <TriangleAlert size={14} aria-hidden="true" className="atencao" /> {a}
    </p>
  ));
}

function Total({
  p,
  soma,
  rotulo,
}: {
  readonly p: PatrimonioDTO;
  readonly soma: Soma;
  readonly rotulo: string;
}) {
  return (
    <div className="patrimonio-total">
      <p className="patrimonio-total__rotulo">{rotulo}</p>
      <p className="patrimonio-total__valor">
        <NumeroAnimado valor={soma.total} formatar={reaisTexto} />
      </p>
      <p className="patrimonio-total__situacao">
        {soma.parcial ? (
          <Selo tom="atencao" icone={TriangleAlert}>
            Total parcial
          </Selo>
        ) : null}
        <span className="apagado">calculado {formatarRelativo(p.calculadoEm)}</span>
      </p>
      {p.cambio ? (
        <p className="apagado patrimonio-total__cambio">
          Cripto convertida a <span className="num">{reais(p.cambio.preco)}</span> por USDT (par USDTBRL da
          Binance, {formatarRelativo(p.cambio.em)}).
        </p>
      ) : null}
    </div>
  );
}

function SemNada({ p }: { readonly p: PatrimonioDTO }) {
  return (
    <div className="pilha">
      <EstadoVazio
        icone={ChartPie}
        titulo="Nada para somar ainda"
        acao={
          <div className="patrimonio-acoes">
            <Link to="/contas" className="botao botao--secundario">
              Conectar a Binance
            </Link>
            <Link to="/renda-fixa" className="botao botao--secundario">
              Cadastrar renda fixa
            </Link>
            <Link to="/imobiliario/novo" className="botao botao--secundario">
              Cadastrar imóvel ou FII
            </Link>
          </div>
        }
      >
        O patrimônio soma a carteira cripto (conta real da Binance), a renda fixa e o imobiliário. Assim que
        houver algo em uma delas, o total aparece aqui.
      </EstadoVazio>
      <Avisos avisos={p.classes.flatMap((c) => c.avisos)} />
    </div>
  );
}

function ComoSomamos() {
  return (
    <div className="patrimonio-como">
      <ul>
        <li>
          Cada classe vem da tela dela, com as mesmas contas: <strong>Carteira</strong>,{" "}
          <strong>Renda fixa</strong> e <strong>Imobiliário</strong>. Aqui só se soma.
        </li>
        <li>
          A cripto é convertida pelo último preço do par USDT/BRL da Binance. Sem esse preço, ela aparece em
          USDT e fica <strong>fora do total</strong>; nenhuma taxa é inventada.
        </li>
        <li>
          O que não tem valor em reais (título sem índice, moeda sem preço, lançamento que não fecha) fica
          fora do total, e o aviso da classe diz o quê.
        </li>
        <li>Conta de testnet é dinheiro de teste e não entra.</li>
      </ul>
      <p className="apagado">Retrato do que está cadastrado e sincronizado; não é recomendação.</p>
    </div>
  );
}

const VISOES = [
  { valor: "cartoes", rotulo: "Cartões", icone: LayoutGrid },
  { valor: "tabela", rotulo: "Tabela", icone: Table2 },
] as const;

function TabelaClasses({
  p,
  soma,
  escolhidas,
}: {
  readonly p: PatrimonioDTO;
  readonly soma: Soma;
  readonly escolhidas: readonly ClassePatrimonio[];
}) {
  return (
    <div
      className="tabela-rolagem"
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- região rolável: o foco é o que permite rolar pelo teclado (WCAG 2.1.1)
      tabIndex={0}
      role="region"
      aria-label="Classes do patrimônio em tabela (role para os lados)"
    >
      <table className="tabela tabela--zebra patrimonio-tabela">
        <caption className="so-leitor">Classes do patrimônio, em reais</caption>
        <thead>
          <tr>
            <th scope="col">Classe</th>
            <th scope="col" className="tabela__num">
              Valor
            </th>
            <th scope="col" className="tabela__num">
              Fatia da soma
            </th>
            <th scope="col" className="tabela__num">
              Investido
            </th>
            <th scope="col" className="tabela__num">
              Valor − investido
            </th>
            <th scope="col">Itens</th>
            <th scope="col">Situação</th>
            <th scope="col">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {p.classes.map((c) => {
            const fora = !escolhidas.includes(c.classe);
            const fracao = soma.fracao(c.classe);
            const diferenca = diferencaDaClasse(c);
            const situacao = SITUACAO[c.situacao];
            return (
              <tr key={c.classe} className={fora ? "patrimonio-tabela__fora" : undefined}>
                <th scope="row">
                  <span
                    className={`patrimonio-tabela__marca patrimonio-cor--${c.classe}`}
                    aria-hidden="true"
                  />
                  <Link to={ROTA_CLASSE[c.classe]}>{ROTULO_CLASSE[c.classe]}</Link>
                </th>
                <td className="tabela__num num">{valorDaClasse(c)}</td>
                <td className="tabela__num num">
                  {fora || fracao === null ? TRACO : formatarPercentual(fracao)}
                </td>
                <td className="tabela__num num">{c.investido === null ? TRACO : reais(c.investido)}</td>
                <td className={`tabela__num num ${diferenca ? sinalDe(diferenca) : ""}`}>
                  {diferenca === null ? TRACO : reais(diferenca, { sinal: true })}
                </td>
                <td>{descreverItens(c.classe, c.itens)}</td>
                <td>
                  {fora ? (
                    <Selo tom="neutro">Fora desta soma</Selo>
                  ) : (
                    <Selo tom={situacao.tom}>{situacao.texto}</Selo>
                  )}
                </td>
                <td>{c.atualizadoEm === null ? TRACO : formatarRelativo(c.atualizadoEm)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Conteudo({ p }: { readonly p: PatrimonioDTO }) {
  const { busca: b, mudar, limpar, aplicar, ativos } = useFiltrosUrl(buscaPatrimonio);
  if (nadaCadastrado(p)) return <SemNada p={p} />;
  const escolhidas = classesEscolhidas(b);
  const todas = escolhidas.length === CLASSES_PATRIMONIO.length;
  const soma = somarClasses(p, escolhidas);
  const visao = b.visao ?? "cartoes";
  const nomes = escolhidas.map((c) => ROTULO_CLASSE[c].toLowerCase()).join(" + ");
  return (
    <div className="pilha">
      <section className="patrimonio-resumo" aria-label="Total e composição">
        <Total p={p} soma={soma} rotulo={todas ? "Total em reais" : `Soma de ${nomes}, em reais`} />
        {soma.fatias.length > 0 ? <GraficoComposicao fatias={soma.fatias} /> : null}
      </section>
      <Avisos avisos={p.avisos} />
      <BarraFiltros
        rotulo="O que somar"
        ativos={ativos}
        aoLimpar={limpar}
        resumo={
          todas ? (
            "Somando as três classes."
          ) : (
            <>
              Somando <strong>{nomes}</strong>; o resto fica de fora desta conta.
            </>
          )
        }
        extra={<VisoesSalvas tela="patrimonio" buscaAtual={b} aoAplicar={aplicar} />}
        ferramentas={
          <AlternarVisao
            opcoes={VISOES}
            valor={visao}
            aoMudar={(v) => mudar({ visao: v === "cartoes" ? undefined : v })}
          />
        }
      >
        <FiltroChips
          rotulo="Somar"
          opcoes={CLASSES_PATRIMONIO.map((c) => ({ valor: c, rotulo: ROTULO_CLASSE[c] }))}
          selecionados={todas ? [] : escolhidas}
          aoMudar={(v) =>
            mudar({
              classes: v.length === 0 || v.length === CLASSES_PATRIMONIO.length ? undefined : v.join(","),
            })
          }
        />
      </BarraFiltros>
      {visao === "tabela" ? (
        <TabelaClasses p={p} soma={soma} escolhidas={escolhidas} />
      ) : (
        <ul role="list" className="patrimonio-classes" aria-label="Classes do patrimônio">
          {p.classes.map((c, i) => (
            <CartaoClasse
              key={c.classe}
              c={c}
              ordem={i}
              fracao={soma.fracao(c.classe)}
              fora={!escolhidas.includes(c.classe)}
            />
          ))}
        </ul>
      )}
      <Painel titulo="Como o total é somado" id="titulo-como-patrimonio">
        <ComoSomamos />
      </Painel>
    </div>
  );
}

export function Patrimonio() {
  const consulta = usePatrimonioConsolidado();
  const p = consulta.data;
  return (
    <>
      <Cabecalho titulo="Patrimônio">
        Tudo o que você tem, somado em reais: cripto, renda fixa e imobiliário. Cada número vem da tela da sua
        classe.
      </Cabecalho>
      {consulta.isPending ? <Esqueleto altura={320} rotulo="Carregando o patrimônio" /> : null}
      {consulta.error ? (
        <ErroCarregar
          erro={consulta.error}
          compacto={p !== undefined}
          tentarDeNovo={() => void consulta.refetch()}
        />
      ) : null}
      {p ? <Conteudo p={p} /> : null}
    </>
  );
}

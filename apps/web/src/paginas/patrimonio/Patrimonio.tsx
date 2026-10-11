import type { Patrimonio as PatrimonioDTO } from "@zentrade/contratos/esquemas";
import { Link } from "@tanstack/react-router";
import { ChartPie, TriangleAlert } from "lucide-react";
import { Cabecalho, Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { NumeroAnimado } from "../../componentes/NumeroAnimado";
import { Selo } from "../../componentes/Selo";
import { formatarRelativo } from "../../lib/tempo";
import { reais } from "../renda-fixa/formato";
import { CartaoClasse } from "./CartaoClasse";
import { fatiasDoPatrimonio, nadaCadastrado } from "./composicao";
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

function Total({ p }: { readonly p: PatrimonioDTO }) {
  return (
    <div className="patrimonio-total">
      <p className="patrimonio-total__rotulo">Total em reais</p>
      <p className="patrimonio-total__valor">
        <NumeroAnimado valor={p.total} formatar={reaisTexto} />
      </p>
      <p className="patrimonio-total__situacao">
        {p.parcial ? (
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

function Conteudo({ p }: { readonly p: PatrimonioDTO }) {
  if (nadaCadastrado(p)) return <SemNada p={p} />;
  const fatias = fatiasDoPatrimonio(p);
  return (
    <div className="pilha">
      <section className="patrimonio-resumo" aria-label="Total e composição">
        <Total p={p} />
        {fatias.length > 0 ? <GraficoComposicao fatias={fatias} /> : null}
      </section>
      <Avisos avisos={p.avisos} />
      <ul role="list" className="patrimonio-classes" aria-label="Classes do patrimônio">
        {p.classes.map((c, i) => (
          <CartaoClasse key={c.classe} c={c} ordem={i} />
        ))}
      </ul>
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

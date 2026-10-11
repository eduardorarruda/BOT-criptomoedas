import type { DetalheImobiliario } from "@zentrade/contratos/esquemas";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Cabecalho, Painel } from "../../componentes/Cabecalho";
import { Confirmar } from "../../componentes/Confirmar";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { CampoValor, PremissaCdi, Premissas } from "./componentes";
import { FinanciamentoDetalhe } from "./detalhe/Financiamento";
import { Lancamentos } from "./detalhe/Lancamentos";
import { FatosDoTipo, MetricasPrincipais } from "./detalhe/Metricas";
import { formatarReais, lerReaisDigitado, TIPOS } from "./formato";
import { GraficoBarras } from "./graficos/Barras";
import {
  hojeLocal,
  useAtualizarInvestimento,
  useCdiPremissa,
  useDetalheImobiliario,
  useRemoverInvestimento,
} from "./ganchos";
import { fluxoPorMes, rotuloMes } from "./series";
import "./imobiliario.css";

/** Um investimento: números, financiamento, fluxo de caixa, lançamentos e premissas. */
function ValorAtual({ d }: { readonly d: DetalheImobiliario }) {
  const inv = d.investimento;
  const cotas = inv.tipo === "fii" || inv.tipo === "reit";
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const atualizar = useAtualizarInvestimento(inv.id);
  const avisar = useAvisos();
  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    const v = lerReaisDigitado(texto);
    if (v === null || v.startsWith("-")) return setErro("Digite um valor, por exemplo 450.000,00.");
    setErro(null);
    atualizar.mutate(
      { valorAtual: v, valorAtualEm: hojeLocal() },
      {
        onSuccess: () => {
          setTexto("");
          avisar("sucesso", "Valor atual registrado.");
        },
        onError: (x) => avisar("erro", mensagemDe(x)),
      },
    );
  };
  const atual = inv.valorAtual
    ? `Hoje: ${inv.moeda === "USD" ? "US$ " + inv.valorAtual : formatarReais(inv.valorAtual)}`
    : "Ainda não informado.";
  return (
    <form className="formulario formulario--linha" onSubmit={enviar} noValidate>
      <CampoValor
        rotulo={cotas ? "Preço atual por cota" : "Valor atual"}
        sufixo={inv.moeda === "USD" ? "US$" : "R$"}
        valor={texto}
        aoMudar={setTexto}
        erro={erro}
        dica={`${atual} Uma avaliação ou cotação recente; vale como premissa até a venda.`}
      />
      <Botao type="submit" icone={Save} carregando={atualizar.isPending}>
        Atualizar
      </Botao>
    </form>
  );
}

function FluxoDeCaixa({ d }: { readonly d: DetalheImobiliario }) {
  const meses = fluxoPorMes(d.lancamentos);
  if (meses.length < 2) return null;
  return (
    <Painel titulo="Fluxo de caixa" id="titulo-fluxo">
      <GraficoBarras
        titulo="Entradas e saídas por mês"
        descricao="dinheiro que entrou (renda, vendas) acima do zero e o que saiu (aportes, despesas, impostos) abaixo; parcelas de financiamento não entram aqui"
        rotulos={meses.map((m) => rotuloMes(m.mes))}
        series={[
          { nome: "Entradas", cor: "ganho", valores: meses.map((m) => m.entradas) },
          { nome: "Saídas", cor: "perda", valores: meses.map((m) => m.saidas) },
        ]}
        formatar={(v) => formatarReais(String(v))}
        formatarEixo={(v) => formatarReais(String(v), { compacto: true })}
      />
    </Painel>
  );
}

function Remover({ id, nome }: { readonly id: string; readonly nome: string }) {
  const [aberto, setAberto] = useState(false);
  const remover = useRemoverInvestimento();
  const navegar = useNavigate();
  const avisar = useAvisos();
  return (
    <>
      <Botao variante="fantasma" icone={Trash2} onClick={() => setAberto(true)}>
        Apagar
      </Botao>
      <Confirmar
        aberto={aberto}
        titulo={`Apagar ${nome}?`}
        rotuloConfirmar="Apagar investimento e lançamentos"
        carregando={remover.isPending}
        aoCancelar={() => setAberto(false)}
        aoConfirmar={() =>
          remover.mutate(id, {
            onSuccess: () => {
              avisar("info", `${nome} apagado.`);
              void navegar({ to: "/imobiliario" });
            },
            onError: (e) => avisar("erro", mensagemDe(e)),
          })
        }
      >
        O cadastro, o financiamento e todos os lançamentos somem. Não dá para desfazer.
      </Confirmar>
    </>
  );
}

function Topo({ inv }: { readonly inv: DetalheImobiliario["investimento"] }) {
  return (
    <Cabecalho
      titulo={inv.nome}
      acoes={
        <>
          <Link to="/imobiliario" className="botao botao--fantasma">
            <ArrowLeft size={16} aria-hidden="true" /> Voltar
          </Link>
          <Remover id={inv.id} nome={inv.nome} />
        </>
      }
    >
      {TIPOS[inv.tipo].rotulo}
      {inv.ticker ? ` · ${inv.ticker}` : ""} — {TIPOS[inv.tipo].descricao}
    </Cabecalho>
  );
}

function Conteudo({
  d,
  cdi,
  setCdi,
}: {
  readonly d: DetalheImobiliario;
  readonly cdi: number | null;
  readonly setCdi: (v: number | null) => void;
}) {
  const inv = d.investimento;
  return (
    <>
      <Topo inv={inv} />
      <PremissaCdi cdi={cdi} aoMudar={setCdi} />
      {d.metricas ? (
        <MetricasPrincipais m={d.metricas} />
      ) : (
        <ErroCarregar erro={new Error(d.erroMetricas ?? "")} tentarDeNovo={() => undefined} />
      )}
      <Painel titulo="Detalhes" id="titulo-fatos">
        <FatosDoTipo d={d} />
        <ValorAtual d={d} />
      </Painel>
      {d.tabela ? (
        <Painel
          titulo={`Financiamento ${d.tabela.sistema === "SAC" ? "SAC" : "Price"}`}
          id="titulo-financiamento"
        >
          <FinanciamentoDetalhe tabela={d.tabela} />
        </Painel>
      ) : null}
      <FluxoDeCaixa d={d} />
      <Painel titulo="Lançamentos" id="titulo-lancamentos">
        <Lancamentos investimento={inv} lancamentos={d.lancamentos} />
      </Painel>
      <Premissas itens={d.metricas?.premissas ?? []} />
    </>
  );
}

export function DetalheInvestimento() {
  const { id = "" } = useParams({ strict: false });
  const [cdi, setCdi] = useCdiPremissa();
  const { data, error, isPending, refetch } = useDetalheImobiliario(id, cdi);
  return (
    <div className="pilha">
      {isPending ? <Esqueleto altura={320} rotulo="Carregando o investimento" /> : null}
      {error ? <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} /> : null}
      {data ? <Conteudo d={data} cdi={cdi} setCdi={setCdi} /> : null}
    </div>
  );
}

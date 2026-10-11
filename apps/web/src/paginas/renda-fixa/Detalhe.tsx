import type { TituloDetalhe } from "@zentrade/contratos/esquemas";
import { Info, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { CampoTexto } from "../../componentes/Campo";
import { Confirmar } from "../../componentes/Confirmar";
import { Dialogo } from "../../componentes/Dialogo";
import { ErroCarregar, Esqueleto } from "../../componentes/Estados";
import { useRemoverTitulo, useTituloRF } from "./consultas";
import type { PremissasTela } from "./fonte";
import { data, LIQUIDEZ, pct, reais, rentabilidadeContratada, TIPO, tomDe } from "./formato";
import { Legenda, Linhas } from "./Graficos";

const curto = (dia: string) => `${dia.slice(5, 7)}/${dia.slice(2, 4)}`;
const reaisCurto = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

type PosicaoCalculada = Extract<TituloDetalhe["posicao"], { disponivel: true }>;
type Linha = [string, string, (string | undefined)?, string?];

/** Cada número da posição com a explicação de onde veio. */
function linhasDaPosicao(p: PosicaoCalculada): Linha[] {
  return [
    ["Aplicado", reais(p.aplicado)],
    [
      "Valor bruto",
      reais(p.bruto),
      p.fonte === "instituicao" ? "informado pela instituição" : "calculado pelos índices",
    ],
    [
      "IOF estimado",
      reais(p.iof),
      `${pct(p.aliquotaIofPct, { casas: 0 })} do rendimento (${p.diasCorridos} dias corridos)`,
    ],
    [
      "IR estimado",
      reais(p.ir),
      p.isentoIr ? "isento para pessoa física" : `${pct(p.aliquotaIrPct, { casas: 1 })} (tabela regressiva)`,
    ],
    ["Valor líquido", reais(p.liquido), "se resgatado hoje"],
    [
      "Rendimento bruto",
      `${reais(p.rendimentoBruto, { sinal: true })} (${pct(p.rentabilidadeBrutaPct, { sinal: true })})`,
      undefined,
      tomDe(p.rendimentoBruto),
    ],
    [
      "Rendimento líquido",
      `${reais(p.rendimentoLiquido, { sinal: true })} (${pct(p.rentabilidadeLiquidaPct, { sinal: true })})`,
      undefined,
      tomDe(p.rendimentoLiquido),
    ],
    [
      "Equivale a",
      p.percentualDoCdi ? `${pct(p.percentualDoCdi, { casas: 1 })} do CDI` : "—",
      "rendimento bruto ÷ CDI do mesmo período",
    ],
    ["CDI no período", pct(p.cdiPeriodoPct)],
    ["Poupança no período", pct(p.poupancaPeriodoPct), "só aniversários completos"],
  ];
}

function Posicao({ t }: { readonly t: TituloDetalhe }) {
  const p = t.posicao;
  if (!p.disponivel) return <p className="nota nota--perigo">{p.motivo}</p>;
  const linhas = linhasDaPosicao(p);
  return (
    <>
      <dl className="rf-detalhe__posicao">
        {linhas.map(([rotulo, valor, nota, tom]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd className={`num ${tom ?? ""}`}>{valor}</dd>
            {nota ? <p className="apagado">{nota}</p> : null}
          </div>
        ))}
      </dl>
      <p className="rf-fonte">
        Posição de {data(p.ate)} · {p.diasUteis} dias úteis desde a aplicação.
      </p>
      {p.avisos.length > 0 ? (
        <ul className="rf-avisos" role="list">
          {p.avisos.map((a) => (
            <li key={a}>
              <Info size={14} aria-hidden="true" /> {a}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function Premissas({
  valor,
  aoMudar,
}: {
  readonly valor: PremissasTela;
  readonly aoMudar: (p: PremissasTela) => void;
}) {
  const [cdi, setCdi] = useState(valor.cdi ?? "");
  const [ipca, setIpca] = useState(valor.ipca ?? "");
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const limpo = (t: string) => t.trim().replace(",", ".");
    aoMudar({
      ...(limpo(cdi) ? { cdi: limpo(cdi), selic: limpo(cdi) } : {}),
      ...(limpo(ipca) ? { ipca: limpo(ipca) } : {}),
    });
  };
  return (
    <form className="formulario formulario--linha rf-premissas" onSubmit={enviar} noValidate>
      <CampoTexto
        rotulo="CDI/Selic (% a.a.)"
        inputMode="decimal"
        value={cdi}
        onChange={(e) => setCdi(e.target.value)}
        placeholder="último publicado"
        className="campo--estreito"
      />
      <CampoTexto
        rotulo="IPCA (% a.a.)"
        inputMode="decimal"
        value={ipca}
        onChange={(e) => setIpca(e.target.value)}
        placeholder="12 meses"
        className="campo--estreito"
      />
      <Botao type="submit" pequeno>
        Recalcular
      </Botao>
    </form>
  );
}

function Projecao({
  t,
  premissas,
  aoMudar,
}: {
  readonly t: TituloDetalhe;
  readonly premissas: PremissasTela;
  readonly aoMudar: (p: PremissasTela) => void;
}) {
  const pr = t.projecao;
  return (
    <section className="rf-detalhe__projecao" aria-labelledby="titulo-projecao">
      <h3 id="titulo-projecao" className="painel__titulo">
        Projeção até {t.vencimento ? "o vencimento" : "12 meses"}
      </h3>
      <Premissas valor={premissas} aoMudar={aoMudar} />
      {!pr.disponivel ? (
        <p className="nota">{pr.motivo}</p>
      ) : (
        <>
          <Linhas
            rotulo={`Projeção do valor bruto e líquido até ${data(pr.fim)}`}
            rotulosX={pr.pontos.map((p) => curto(p.dia))}
            series={[
              { nome: "Bruto", valores: pr.pontos.map((p) => Number(p.bruto)), cor: "var(--cat-1)" },
              {
                nome: "Líquido",
                valores: pr.pontos.map((p) => Number(p.liquido)),
                cor: "var(--cat-2)",
                tracejada: true,
              },
            ]}
            formatarY={reaisCurto}
          />
          <Legenda
            itens={[
              {
                nome: `Bruto em ${data(pr.fim)}`,
                cor: "var(--cat-1)",
                valor: reais(pr.pontos.at(-1)?.bruto),
              },
              {
                nome: `Líquido em ${data(pr.fim)}`,
                cor: "var(--cat-2)",
                valor: reais(pr.pontos.at(-1)?.liquido),
              },
            ]}
          />
          <p className="painel__legenda">Premissas (projeção não é promessa de rentabilidade):</p>
          <ul className="rf-premissas__lista">
            {pr.premissas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Só título manual se remove; o da Pluggy é da sincronização. */
function RemoverTitulo({ t, aoRemover }: { readonly t: TituloDetalhe; readonly aoRemover: () => void }) {
  const remover = useRemoverTitulo();
  const avisar = useAvisos();
  const [confirmando, setConfirmando] = useState(false);
  if (t.origem !== "manual") {
    return <p className="apagado">Este título vem da Pluggy e é atualizado a cada sincronização.</p>;
  }
  return (
    <>
      <div className="formulario__acoes">
        <Botao variante="perigo" icone={Trash2} onClick={() => setConfirmando(true)}>
          Remover título
        </Botao>
      </div>
      <Confirmar
        aberto={confirmando}
        titulo="Remover este título?"
        rotuloConfirmar="Remover"
        carregando={remover.isPending}
        aoCancelar={() => setConfirmando(false)}
        aoConfirmar={() =>
          remover.mutate(t.id, {
            onSuccess: () => {
              setConfirmando(false);
              avisar("sucesso", "Título removido da carteira.");
              aoRemover();
            },
            onError: (e) => avisar("erro", mensagemDe(e)),
          })
        }
      >
        {t.nome} sai da carteira e dos totais. O investimento no banco não muda: isto só apaga o cadastro
        aqui.
      </Confirmar>
    </>
  );
}

export function Detalhe({ id, aoFechar }: { readonly id: string | null; readonly aoFechar: () => void }) {
  const [premissas, setPremissas] = useState<PremissasTela>({});
  const consulta = useTituloRF(id, premissas);
  const t = consulta.data;
  return (
    <Dialogo
      aberto={id !== null}
      aoFechar={aoFechar}
      titulo={t?.nome ?? "Título"}
      largo
      descricao={t ? `${TIPO[t.tipo]} · ${rentabilidadeContratada(t)}` : undefined}
    >
      {consulta.isPending ? <Esqueleto linhas={6} rotulo="Calculando o título" /> : null}
      {consulta.error ? (
        <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />
      ) : null}
      {t ? (
        <div className="rf-detalhe">
          <p className="apagado">
            {t.emissor ? `${t.emissor} · ` : ""}aplicado em {data(t.dataAplicacao)} ·{" "}
            {t.vencimento ? `vence em ${data(t.vencimento)}` : "sem vencimento"} · liquidez{" "}
            {LIQUIDEZ[t.liquidez].toLowerCase()}
            {t.carenciaAte ? ` (carência até ${data(t.carenciaAte)})` : ""}
          </p>
          <Posicao t={t} />
          <Projecao t={t} premissas={premissas} aoMudar={setPremissas} />
          <RemoverTitulo t={t} aoRemover={aoFechar} />
        </div>
      ) : null}
    </Dialogo>
  );
}

import type { TipoImobiliario } from "@zentrade/contratos/esquemas";
import { TIPOS_IMOBILIARIO } from "@zentrade/contratos/esquemas";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { CampoTexto } from "../../componentes/Campo";
import { Cabecalho, Painel } from "../../componentes/Cabecalho";
import { Segmentado } from "../../componentes/Segmentado";
import { CampoValor, Explicacao } from "./componentes";
import { TIPOS } from "./formato";
import { useCriarInvestimento } from "./ganchos";
import { CAMPOS_FINANCIAMENTO, CAMPOS_POR_TIPO, montarPedido, type DefinicaoCampo } from "./pedido";
import "./imobiliario.css";

/**
 * Cadastro guiado: primeiro o tipo (cada um explica o que acompanha), depois só os
 * campos daquele tipo. Compra e custos viram os primeiros lançamentos.
 */
type Valores = Record<string, string>;

const SUFIXO = { reais: "R$", pct: "%", inteiro: undefined, data: undefined, texto: undefined } as const;

function Campo({
  d,
  valores,
  erros,
  mudar,
  moeda,
}: {
  readonly d: DefinicaoCampo;
  readonly valores: Valores;
  readonly erros: Valores;
  readonly mudar: (chave: string, v: string) => void;
  readonly moeda: "R$" | "US$";
}) {
  const rotulo = d.obrigatorio ? d.rotulo : `${d.rotulo} (opcional)`;
  if (d.tipo === "data" || d.tipo === "texto") {
    return (
      <CampoTexto
        rotulo={rotulo}
        type={d.tipo === "data" ? "date" : "text"}
        value={valores[d.chave] ?? ""}
        onChange={(e) => mudar(d.chave, e.target.value)}
        dica={d.dica}
        erro={erros[d.chave]}
        maxLength={d.tipo === "texto" ? 120 : undefined}
      />
    );
  }
  const sufixo = d.tipo === "reais" ? moeda : SUFIXO[d.tipo];
  return (
    <CampoValor
      rotulo={rotulo}
      valor={valores[d.chave] ?? ""}
      aoMudar={(v) => mudar(d.chave, v)}
      dica={d.dica}
      erro={erros[d.chave]}
      {...(sufixo ? { sufixo } : {})}
    />
  );
}

function EscolhaTipo({
  tipo,
  aoEscolher,
}: {
  readonly tipo: TipoImobiliario | null;
  readonly aoEscolher: (t: TipoImobiliario) => void;
}) {
  return (
    <div className="imob-tipos" role="group" aria-label="Tipo de investimento">
      {TIPOS_IMOBILIARIO.map((t) => {
        const { rotulo, descricao, icone: Icone } = TIPOS[t];
        return (
          <button
            key={t}
            type="button"
            className="imob-tipo"
            aria-pressed={tipo === t}
            onClick={() => aoEscolher(t)}
          >
            <Icone size={20} strokeWidth={1.8} aria-hidden="true" />
            <strong>{rotulo}</strong>
            <span>{descricao}</span>
          </button>
        );
      })}
    </div>
  );
}

function Financiamento({
  valores,
  erros,
  mudar,
}: {
  readonly valores: Valores;
  readonly erros: Valores;
  readonly mudar: (c: string, v: string) => void;
}) {
  return (
    <fieldset className="formulario">
      <legend className="formulario__secao">Financiamento</legend>
      <Segmentado
        rotulo="Comprou financiado?"
        opcoes={[
          { valor: "nao", rotulo: "Não" },
          { valor: "sim", rotulo: "Sim" },
        ]}
        valor={valores.financiado === "sim" ? "sim" : "nao"}
        aoMudar={(v) => mudar("financiado", v)}
      />
      {valores.financiado === "sim" ? (
        <>
          <Segmentado
            rotulo="Sistema de amortização"
            opcoes={[
              { valor: "SAC", rotulo: "SAC (parcelas caem)" },
              { valor: "PRICE", rotulo: "Price (parcelas iguais)" },
            ]}
            valor={valores.sistema === "PRICE" ? "PRICE" : "SAC"}
            aoMudar={(v) => mudar("sistema", v)}
          />
          <div className="grade-campos">
            {CAMPOS_FINANCIAMENTO.map((d) => (
              <Campo key={d.chave} d={d} valores={valores} erros={erros} mudar={mudar} moeda="R$" />
            ))}
          </div>
          <Explicacao>
            A tela gera a tabela completa; parcelas com vencimento até hoje contam como pagas.
          </Explicacao>
        </>
      ) : null}
    </fieldset>
  );
}

function Rodape({ temErros, enviando }: { readonly temErros: boolean; readonly enviando: boolean }) {
  return (
    <>
      {temErros ? (
        <p className="formulario__erro" role="alert">
          Confira os campos marcados.
        </p>
      ) : null}
      <div className="formulario__acoes">
        <Botao type="submit" variante="primario" icone={Plus} carregando={enviando}>
          Cadastrar
        </Botao>
      </div>
    </>
  );
}

function Dados({
  tipo,
  valores,
  erros,
  mudar,
  enviando,
  aoEnviar,
}: {
  readonly tipo: TipoImobiliario;
  readonly valores: Valores;
  readonly erros: Valores;
  readonly mudar: (chave: string, v: string) => void;
  readonly enviando: boolean;
  readonly aoEnviar: (e: FormEvent) => void;
}) {
  const financiavel = TIPOS[tipo].grupo === "imovel" && tipo !== "planta";
  return (
    <form className="formulario" onSubmit={aoEnviar} noValidate>
      <div className="grade-campos">
        <CampoTexto
          rotulo="Nome"
          value={valores.nome ?? ""}
          onChange={(e) => mudar("nome", e.target.value)}
          erro={erros.nome}
          maxLength={120}
          dica="Para você reconhecer, por exemplo “Apto Centro”."
        />
        {CAMPOS_POR_TIPO[tipo].map((d) => (
          <Campo
            key={d.chave}
            d={d}
            valores={valores}
            erros={erros}
            mudar={mudar}
            moeda={tipo === "reit" ? "US$" : "R$"}
          />
        ))}
      </div>
      {financiavel ? <Financiamento valores={valores} erros={erros} mudar={mudar} /> : null}
      <Rodape temErros={Object.keys(erros).length > 0} enviando={enviando} />
    </form>
  );
}

function Topo({ etapa }: { readonly etapa: 1 | 2 }) {
  return (
    <>
      <Cabecalho
        titulo="Cadastrar investimento"
        acoes={
          <Link to="/imobiliario" className="botao botao--fantasma">
            <ArrowLeft size={16} aria-hidden="true" /> Voltar
          </Link>
        }
      >
        Escolha o tipo e preencha só o que você sabe agora; aluguéis, proventos e despesas entram depois, como
        lançamentos.
      </Cabecalho>
      <ol className="imob-passos" aria-label="Etapas">
        <li aria-current={etapa === 1 ? "step" : undefined}>1. Tipo</li>
        <li aria-hidden="true">›</li>
        <li aria-current={etapa === 2 ? "step" : undefined}>2. Dados</li>
      </ol>
    </>
  );
}

/** Monta o pedido, mostra os erros por campo ou cadastra e abre o investimento. */
function useEnviar(tipo: TipoImobiliario | null, valores: Valores, setErros: (e: Valores) => void) {
  const criar = useCriarInvestimento();
  const avisar = useAvisos();
  const navegar = useNavigate();
  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    if (!tipo) return;
    const { pedido, erros } = montarPedido(tipo, valores);
    setErros(erros);
    if (!pedido) return;
    criar.mutate(pedido, {
      onSuccess: (d) => {
        avisar("sucesso", `${d.investimento.nome} cadastrado.`);
        void navegar({ to: "/imobiliario/$id", params: { id: d.investimento.id } });
      },
      onError: (erro) => avisar("erro", mensagemDe(erro)),
    });
  };
  return { enviar, enviando: criar.isPending };
}

export function NovoInvestimento() {
  const [tipo, setTipo] = useState<TipoImobiliario | null>(null);
  const [valores, setValores] = useState<Valores>({});
  const [erros, setErros] = useState<Valores>({});
  const { enviar, enviando } = useEnviar(tipo, valores, setErros);
  const mudar = (chave: string, v: string): void => setValores((x) => ({ ...x, [chave]: v }));

  return (
    <div className="pilha">
      <Topo etapa={tipo ? 2 : 1} />
      <Painel titulo="Que tipo de investimento?" id="titulo-tipo">
        <EscolhaTipo
          tipo={tipo}
          aoEscolher={(t) => {
            setTipo(t);
            setErros({});
          }}
        />
      </Painel>
      {tipo ? (
        <Painel titulo={TIPOS[tipo].rotulo} id="titulo-dados">
          <Dados
            tipo={tipo}
            valores={valores}
            erros={erros}
            mudar={mudar}
            enviando={enviando}
            aoEnviar={enviar}
          />
        </Painel>
      ) : null}
    </div>
  );
}

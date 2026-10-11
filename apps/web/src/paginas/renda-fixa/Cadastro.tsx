import {
  INDEXADORES,
  LIQUIDEZES,
  NovoTituloEsquema,
  TIPOS_TITULO,
  type Indexador,
  type Liquidez,
  type TipoTitulo,
} from "@zentrade/contratos/esquemas";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { CampoSelecao, CampoTexto } from "../../componentes/Campo";
import { useCriarTitulo } from "./consultas";
import { INDEXADOR, LIQUIDEZ, TIPO } from "./formato";

/** Indexador mais comum de cada tipo: a pessoa pode trocar. */
const INDEXADOR_SUGERIDO: Partial<Record<TipoTitulo, Indexador>> = {
  TESOURO_SELIC: "SELIC",
  TESOURO_PREFIXADO: "PREFIXADO",
  TESOURO_IPCA: "IPCA",
  POUPANCA: "POUPANCA",
};

interface Estado {
  tipo: TipoTitulo;
  nome: string;
  emissor: string;
  indexador: Indexador;
  percentualIndexador: string;
  taxaAnual: string;
  dataAplicacao: string;
  vencimento: string;
  valorAplicado: string;
  liquidez: Liquidez;
  carenciaAte: string;
}

const INICIAL: Estado = {
  tipo: "CDB",
  nome: "",
  emissor: "",
  indexador: "CDI",
  percentualIndexador: "100",
  taxaAnual: "",
  dataAplicacao: "",
  vencimento: "",
  valorAplicado: "",
  liquidez: "vencimento",
  carenciaAte: "",
};

/** "10.000,50" ou "10000.50" → "10000.50". */
export const numeroDigitado = (t: string): string => {
  const limpo = t.trim().replace(/\s|R\$|%/g, "");
  return limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
};

export function montarTitulo(e: Estado) {
  const posFixado = e.indexador === "CDI" || e.indexador === "SELIC";
  const opcional = (t: string) => (t.trim() === "" ? null : t.trim());
  return {
    tipo: e.tipo,
    nome: e.nome.trim(),
    emissor: opcional(e.emissor),
    indexador: e.indexador,
    percentualIndexador: posFixado ? numeroDigitado(e.percentualIndexador || "100") : null,
    taxaAnual: e.taxaAnual.trim() ? numeroDigitado(e.taxaAnual) : null,
    dataAplicacao: e.dataAplicacao,
    vencimento: opcional(e.vencimento),
    valorAplicado: numeroDigitado(e.valorAplicado),
    liquidez: e.liquidez,
    carenciaAte: e.liquidez === "carencia" ? opcional(e.carenciaAte) : null,
  };
}

interface PropsCampos {
  readonly e: Estado;
  readonly mudar: <K extends keyof Estado>(campo: K, valor: Estado[K]) => void;
  readonly erros: Readonly<Record<string, string>>;
}

/** Tipo, nome, emissor e como o título rende. */
function CamposRendimento({
  e,
  mudar,
  erros,
  setE,
}: PropsCampos & { readonly setE: (f: (a: Estado) => Estado) => void }) {
  const posFixado = e.indexador === "CDI" || e.indexador === "SELIC";
  return (
    <>
      <CampoSelecao
        rotulo="Tipo"
        value={e.tipo}
        onChange={(ev) => {
          const tipo = ev.target.value as TipoTitulo;
          setE((a) => ({ ...a, tipo, indexador: INDEXADOR_SUGERIDO[tipo] ?? a.indexador }));
        }}
      >
        {TIPOS_TITULO.map((t) => (
          <option key={t} value={t}>
            {TIPO[t]}
          </option>
        ))}
      </CampoSelecao>
      <CampoTexto
        rotulo="Nome"
        value={e.nome}
        onChange={(ev) => mudar("nome", ev.target.value)}
        erro={erros.nome}
        placeholder="ex.: CDB Banco X 110%"
      />
      <CampoTexto
        rotulo="Emissor (opcional)"
        value={e.emissor}
        onChange={(ev) => mudar("emissor", ev.target.value)}
      />
      <CampoSelecao
        rotulo="Indexador"
        value={e.indexador}
        onChange={(ev) => mudar("indexador", ev.target.value as Indexador)}
      >
        {INDEXADORES.map((i) => (
          <option key={i} value={i}>
            {INDEXADOR[i]}
          </option>
        ))}
      </CampoSelecao>
      {posFixado ? (
        <CampoTexto
          rotulo={`% do ${INDEXADOR[e.indexador]}`}
          inputMode="decimal"
          value={e.percentualIndexador}
          onChange={(ev) => mudar("percentualIndexador", ev.target.value)}
          erro={erros.percentualIndexador}
          dica="100 = 100% do índice"
        />
      ) : null}
      {e.indexador !== "POUPANCA" ? (
        <CampoTexto
          rotulo={
            posFixado
              ? "Taxa somada (% a.a., opcional)"
              : e.indexador === "IPCA"
                ? "Taxa real (% a.a.)"
                : "Taxa (% a.a.)"
          }
          inputMode="decimal"
          value={e.taxaAnual}
          onChange={(ev) => mudar("taxaAnual", ev.target.value)}
          erro={erros.taxaAnual}
          dica={e.indexador === "IPCA" ? "o que vem depois de IPCA +" : undefined}
        />
      ) : null}
    </>
  );
}

/** Quanto, quando e a liquidez. */
function CamposValores({ e, mudar, erros }: PropsCampos) {
  return (
    <>
      <CampoTexto
        rotulo="Valor aplicado (R$)"
        inputMode="decimal"
        value={e.valorAplicado}
        onChange={(ev) => mudar("valorAplicado", ev.target.value)}
        erro={erros.valorAplicado}
      />
      <CampoTexto
        rotulo="Data da aplicação"
        type="date"
        value={e.dataAplicacao}
        onChange={(ev) => mudar("dataAplicacao", ev.target.value)}
        erro={erros.dataAplicacao}
      />
      <CampoTexto
        rotulo="Vencimento (opcional)"
        type="date"
        value={e.vencimento}
        onChange={(ev) => mudar("vencimento", ev.target.value)}
        erro={erros.vencimento}
      />
      <CampoSelecao
        rotulo="Liquidez"
        value={e.liquidez}
        onChange={(ev) => mudar("liquidez", ev.target.value as Liquidez)}
      >
        {LIQUIDEZES.map((l) => (
          <option key={l} value={l}>
            {LIQUIDEZ[l]}
          </option>
        ))}
      </CampoSelecao>
      {e.liquidez === "carencia" ? (
        <CampoTexto
          rotulo="Carência até"
          type="date"
          value={e.carenciaAte}
          onChange={(ev) => mudar("carenciaAte", ev.target.value)}
          erro={erros.carenciaAte}
        />
      ) : null}
    </>
  );
}

export function Cadastro({ aoCriar }: { readonly aoCriar: (id: string) => void }) {
  const [e, setE] = useState<Estado>(INICIAL);
  const [erros, setErros] = useState<Record<string, string>>({});
  const criar = useCriarTitulo();
  const avisar = useAvisos();
  const mudar = <K extends keyof Estado>(campo: K, valor: Estado[K]) =>
    setE((atual) => ({ ...atual, [campo]: valor }));

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    const lido = NovoTituloEsquema.safeParse(montarTitulo(e));
    if (!lido.success) {
      setErros(Object.fromEntries(lido.error.issues.map((i) => [String(i.path[0] ?? "nome"), i.message])));
      return;
    }
    setErros({});
    criar.mutate(lido.data, {
      onSuccess: (t) => {
        avisar(
          "sucesso",
          `${t.nome} cadastrado. ${t.posicao.disponivel ? "A posição já foi calculada." : t.posicao.motivo}`,
        );
        setE(INICIAL);
        aoCriar(t.id);
      },
      onError: (er) => avisar("erro", mensagemDe(er)),
    });
  };

  return (
    <form className="formulario rf-cadastro" onSubmit={enviar} noValidate>
      <p className="apagado">
        Para títulos que não vêm pela Pluggy. Informe como está na nota de aplicação; o valor de hoje é
        calculado pelos índices do Banco Central.
      </p>
      <div className="grade-campos">
        <CamposRendimento e={e} mudar={mudar} setE={setE} erros={erros} />
        <CamposValores e={e} mudar={mudar} erros={erros} />
      </div>
      <div className="formulario__acoes">
        <Botao type="submit" variante="primario" icone={Plus} carregando={criar.isPending}>
          Cadastrar título
        </Botao>
      </div>
    </form>
  );
}

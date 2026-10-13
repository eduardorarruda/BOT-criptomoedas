import type {
  InvestimentoImobiliario,
  LancamentoImobiliario,
  NovoLancamentoImobiliario,
  TipoLancamentoImobiliario,
} from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { mensagemDe } from "../../../api/erros";
import { useAvisos } from "../../../componentes/Avisos";
import { Botao } from "../../../componentes/Botao";
import { CampoSelecao, CampoTexto } from "../../../componentes/Campo";
import { EstadoVazio } from "../../../componentes/Estados";
import { CampoValor } from "../componentes";
import {
  CATEGORIAS,
  DESCRICAO_LANCAMENTO,
  formatarReais,
  lerReaisDigitado,
  ROTULO_LANCAMENTO,
} from "../formato";
import { hojeLocal, useAdicionarLancamento, useRemoverLancamento } from "../ganchos";
import { TabelaRolagem } from "../../../componentes/TabelaRolagem";

/** Lançamentos: o que aconteceu no tempo (compra, aluguel, despesa, venda). */
const TIPOS: readonly TipoLancamentoImobiliario[] = ["aporte", "receita", "despesa", "resgate", "imposto"];

export interface Rascunho {
  data: string;
  tipo: TipoLancamentoImobiliario;
  categoria: string;
  valor: string;
  quantidade: string;
  cambio: string;
  descricao: string;
}

const vazio = (): Rascunho => ({
  data: hojeLocal(),
  tipo: "receita",
  categoria: "aluguel",
  valor: "",
  quantidade: "",
  cambio: "",
  descricao: "",
});

const positivo = (t: string): string | null => {
  const v = lerReaisDigitado(t);
  return v !== null && dec(v).gt(0) ? v : null;
};

/** Confere o rascunho e monta o lançamento (ou diz o que falta, campo a campo). */
export function validarLancamento(
  r: Rascunho,
  cotas: boolean,
  dolar: boolean,
): { erros: Record<string, string>; lancamento?: NovoLancamentoImobiliario } {
  const erros: Record<string, string> = {};
  const valor = positivo(r.valor);
  const quantidade = r.quantidade.trim() === "" ? null : positivo(r.quantidade);
  const cambio = positivo(r.cambio);
  if (valor === null) erros.valor = "Digite um valor maior que zero.";
  if (r.quantidade.trim() !== "" && quantidade === null)
    erros.quantidade = "Quantidade de cotas maior que zero.";
  if (cotas && ["compra", "venda"].includes(r.categoria.trim()) && quantidade === null) {
    erros.quantidade = "Informe quantas cotas foram compradas ou vendidas.";
  }
  if (dolar && cambio === null) erros.cambio = "Informe o câmbio do dia (R$ por US$).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data)) erros.data = "Escolha a data.";
  if (r.categoria.trim() === "") erros.categoria = "Escolha ou digite uma categoria.";
  if (Object.keys(erros).length > 0 || valor === null) return { erros };
  return {
    erros,
    lancamento: {
      data: r.data,
      tipo: r.tipo,
      categoria: r.categoria.trim(),
      valor,
      ...(quantidade ? { quantidade } : {}),
      ...(dolar && cambio ? { cambio } : {}),
      ...(r.descricao.trim() ? { descricao: r.descricao.trim() } : {}),
    },
  };
}

interface PropsCampos {
  readonly r: Rascunho;
  readonly erros: Record<string, string>;
  readonly mudar: <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => void;
  readonly cotas: boolean;
  readonly dolar: boolean;
}

function TipoECategoria({ r, erros, mudar }: PropsCampos) {
  const idLista = useId();
  return (
    <>
      <CampoSelecao
        rotulo="Tipo"
        value={r.tipo}
        onChange={(e) => {
          const tipo = e.target.value as TipoLancamentoImobiliario;
          mudar("tipo", tipo);
          mudar("categoria", CATEGORIAS[tipo][0] ?? "");
        }}
        dica={DESCRICAO_LANCAMENTO[r.tipo]}
      >
        {TIPOS.map((t) => (
          <option key={t} value={t}>
            {ROTULO_LANCAMENTO[t]}
          </option>
        ))}
      </CampoSelecao>
      <CampoTexto
        rotulo="Categoria"
        value={r.categoria}
        onChange={(e) => mudar("categoria", e.target.value)}
        list={idLista}
        erro={erros.categoria}
        maxLength={40}
      />
      <datalist id={idLista}>
        {CATEGORIAS[r.tipo].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

function CamposLancamento(p: PropsCampos) {
  const { r, erros, mudar, cotas, dolar } = p;
  return (
    <>
      <CampoTexto
        rotulo="Data"
        type="date"
        value={r.data}
        onChange={(e) => mudar("data", e.target.value)}
        erro={erros.data}
      />
      <TipoECategoria {...p} />
      <CampoValor
        rotulo="Valor"
        sufixo={dolar ? "US$" : "R$"}
        valor={r.valor}
        aoMudar={(v) => mudar("valor", v)}
        erro={erros.valor}
      />
      {cotas ? (
        <CampoValor
          rotulo="Cotas"
          sufixo="cotas"
          valor={r.quantidade}
          aoMudar={(v) => mudar("quantidade", v)}
          erro={erros.quantidade}
        />
      ) : null}
      {dolar ? (
        <CampoValor
          rotulo="Câmbio do dia"
          sufixo="R$"
          valor={r.cambio}
          aoMudar={(v) => mudar("cambio", v)}
          erro={erros.cambio}
        />
      ) : null}
      <CampoTexto
        rotulo="Observação (opcional)"
        value={r.descricao}
        onChange={(e) => mudar("descricao", e.target.value)}
        maxLength={500}
      />
    </>
  );
}

function Formulario({ investimento }: { readonly investimento: InvestimentoImobiliario }) {
  const [r, setR] = useState<Rascunho>(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const adicionar = useAdicionarLancamento(investimento.id);
  const avisar = useAvisos();
  const cotas = investimento.tipo === "fii" || investimento.tipo === "reit";
  const dolar = investimento.moeda === "USD";
  const mudar = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((a) => ({ ...a, [k]: v }));
  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    const v = validarLancamento(r, cotas, dolar);
    setErros(v.erros);
    if (!v.lancamento) return;
    adicionar.mutate(v.lancamento, {
      onSuccess: () => {
        avisar("sucesso", "Lançamento registrado.");
        setR({ ...vazio(), tipo: r.tipo, categoria: r.categoria });
      },
      onError: (erro) => avisar("erro", mensagemDe(erro)),
    });
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label="Novo lançamento">
      <div className="imob-lancamento-novo">
        <CamposLancamento r={r} erros={erros} mudar={mudar} cotas={cotas} dolar={dolar} />
        <Botao type="submit" variante="primario" icone={Plus} carregando={adicionar.isPending}>
          Lançar
        </Botao>
      </div>
    </form>
  );
}

function Linha({
  l,
  dolar,
  apagar,
  ocupado,
}: {
  readonly l: LancamentoImobiliario;
  readonly dolar: boolean;
  readonly apagar: () => void;
  readonly ocupado: boolean;
}) {
  const entrada = l.tipo === "receita" || l.tipo === "resgate";
  return (
    <tr>
      <th scope="row" className="num">
        {l.data.split("-").reverse().join("/")}
      </th>
      <td>{ROTULO_LANCAMENTO[l.tipo]}</td>
      <td>
        {l.categoria}
        {l.quantidade ? <span className="apagado num"> · {l.quantidade.replace(".", ",")} cotas</span> : null}
        {l.descricao ? <div className="imob-lancamentos__descricao">{l.descricao}</div> : null}
      </td>
      <td className={`tabela__num num ${entrada ? "ganho" : ""}`}>
        {dolar ? `US$ ${l.valor.replace(".", ",")}` : formatarReais(l.valor)}
        {l.cambio ? <div className="apagado">câmbio {l.cambio.replace(".", ",")}</div> : null}
      </td>
      <td>
        <button
          type="button"
          className="botao-icone botao-icone--p botao-icone--perigo"
          aria-label={`Apagar lançamento de ${l.data}: ${l.categoria}`}
          disabled={ocupado}
          onClick={apagar}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function Tabela({
  investimento,
  lancamentos,
}: {
  readonly investimento: InvestimentoImobiliario;
  readonly lancamentos: readonly LancamentoImobiliario[];
}) {
  const remover = useRemoverLancamento(investimento.id);
  const avisar = useAvisos();
  const apagar = (id: string) =>
    remover.mutate(id, {
      onSuccess: () => avisar("info", "Lançamento apagado."),
      onError: (erro) => avisar("erro", mensagemDe(erro)),
    });
  return (
    <TabelaRolagem className="imob-lancamentos" rotulo="Lançamentos (role para os lados)">
      <table className="tabela">
        <caption className="so-leitor">Lançamentos, do mais recente ao mais antigo</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Tipo</th>
            <th scope="col">Categoria</th>
            <th scope="col" className="tabela__num">
              Valor
            </th>
            <th scope="col">
              <span className="so-leitor">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...lancamentos].reverse().map((l) => (
            <Linha
              key={l.id}
              l={l}
              dolar={investimento.moeda === "USD"}
              apagar={() => apagar(l.id)}
              ocupado={remover.isPending}
            />
          ))}
        </tbody>
      </table>
    </TabelaRolagem>
  );
}

export function Lancamentos({
  investimento,
  lancamentos,
}: {
  readonly investimento: InvestimentoImobiliario;
  readonly lancamentos: readonly LancamentoImobiliario[];
}) {
  return (
    <div className="pilha">
      <Formulario investimento={investimento} />
      {lancamentos.length === 0 ? (
        <EstadoVazio icone={Plus} titulo="Nenhum lançamento ainda">
          Registre a compra, os aluguéis ou proventos recebidos e as despesas: é deles que saem o resultado e
          a TIR.
        </EstadoVazio>
      ) : (
        <Tabela investimento={investimento} lancamentos={lancamentos} />
      )}
    </div>
  );
}

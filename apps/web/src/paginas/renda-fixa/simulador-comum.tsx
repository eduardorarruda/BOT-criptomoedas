import type { Indicadores, ResultadoSelicCdbPoupanca } from "@zentrade/contratos/esquemas";
import { Calculator } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { ErroApi, mensagemDe } from "../../api/erros";
import { Botao } from "../../componentes/Botao";
import { CampoTexto } from "../../componentes/Campo";
import { numeroDigitado } from "./Cadastro";
import { pct, reais } from "./formato";

/** Peças comuns aos simuladores: validação, campos, formulário, premissas e a tabela. */
/** Antes de chamar a conta: todo campo preenchido com número (vírgula ou ponto). */
export function exigirNumeros(campos: Readonly<Record<string, string>>): void {
  const ruins = Object.entries(campos).filter(([, v]) => !/^-?\d+(\.\d+)?$/.test(numeroDigitado(v)));
  if (ruins.length > 0) {
    throw new ErroApi(
      "dados_invalidos",
      "Preencha todos os campos com números (pode usar vírgula). Nenhuma taxa é inventada: as premissas são suas.",
    );
  }
}
export { reaisCurto } from "./formato";

/** Último CDI e meta Selic publicados, para começar o formulário (a pessoa ajusta). */
export function taxasIniciais(i: Indicadores | undefined) {
  const anual = (serie: string) => i?.series.find((s) => s.serie === serie)?.anualizado ?? "";
  const tr = i?.series.find((s) => s.serie === "TR")?.ultimoValor ?? "";
  return { cdi: anual("CDI"), selic: anual("SELIC"), meta: anual("SELIC_META"), tr };
}

export function Campo({
  rotulo,
  valor,
  mudar,
  dica,
}: {
  readonly rotulo: string;
  readonly valor: string;
  readonly mudar: (v: string) => void;
  readonly dica?: string;
}) {
  return (
    <CampoTexto
      rotulo={rotulo}
      inputMode="decimal"
      value={valor}
      onChange={(e) => mudar(e.target.value)}
      dica={dica}
      className="campo--num"
    />
  );
}

export function Premissas({ itens }: { readonly itens: readonly string[] }) {
  return (
    <>
      <p className="painel__legenda">
        Premissas (contas, não recomendação; não é promessa de rentabilidade):
      </p>
      <ul className="rf-premissas__lista">
        {itens.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </>
  );
}

export function Formulario({
  children,
  aoEnviar,
  carregando,
  erro,
}: {
  readonly children: ReactNode;
  readonly aoEnviar: () => void;
  readonly carregando: boolean;
  readonly erro: unknown;
}) {
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    aoEnviar();
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <div className="grade-campos">{children}</div>
      {erro ? (
        <p className="formulario__erro" role="alert">
          {mensagemDe(erro)}
        </p>
      ) : null}
      <div className="formulario__acoes">
        <Botao type="submit" variante="primario" icone={Calculator} carregando={carregando}>
          Simular
        </Botao>
      </div>
    </form>
  );
}

type Alternativa = ResultadoSelicCdbPoupanca["cdb"];

/** As três alternativas lado a lado: bruto, impostos, custódia e líquido. */
export function TabelaAlternativas({
  linhas,
}: {
  readonly linhas: readonly (readonly [string, Alternativa, string])[];
}) {
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <thead>
          <tr>
            <th scope="col">Alternativa</th>
            <th scope="col" className="tabela__num">
              Bruto
            </th>
            <th scope="col" className="tabela__num">
              IR
            </th>
            <th scope="col" className="tabela__num">
              Custódia
            </th>
            <th scope="col" className="tabela__num">
              Líquido
            </th>
            <th scope="col" className="tabela__num">
              Rent. líquida
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(([nome, a]) => (
            <tr key={nome}>
              <th scope="row">{nome}</th>
              <td className="tabela__num num">{reais(a.bruto)}</td>
              <td className="tabela__num num">{reais(a.ir)}</td>
              <td className="tabela__num num">{reais(a.custodia)}</td>
              <td className="tabela__num num">{reais(a.liquido)}</td>
              <td className="tabela__num num">{pct(a.rentabilidadeLiquidaPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

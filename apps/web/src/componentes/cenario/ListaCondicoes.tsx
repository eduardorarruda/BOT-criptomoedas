import type { Condicao } from "@zentrade/dominio";
import { Check, X } from "lucide-react";
import "./cenario.css";

/**
 * A regra aberta em condições: cada uma com ✓ ou ✗, o texto com os valores do momento e,
 * para leitor de tela, "verdadeira" ou "falsa". Grupos E / OU / NÃO aparecem com o que
 * pedem e se o grupo todo valeu.
 */
const TITULO_DO_GRUPO: Record<Exclude<Condicao["tipo"], "condicao">, string> = {
  e: "Todas estas precisam ser verdadeiras",
  ou: "Pelo menos uma destas precisa ser verdadeira",
  nao: "Nenhuma destas pode ser verdadeira",
};

function Marca({ valor }: { readonly valor: boolean }) {
  const Icone = valor ? Check : X;
  return (
    <span className="condicao__marca" aria-hidden="true">
      <Icone size={13} strokeWidth={2.6} />
    </span>
  );
}

function No({ c }: { readonly c: Condicao }) {
  const classe = `condicao condicao--${c.valor ? "sim" : "nao"}`;
  const estado = c.valor ? "Verdadeira" : "Falsa";
  if (c.tipo === "condicao")
    return (
      <li className={classe}>
        <Marca valor={c.valor} />
        <span className="condicao__texto">
          <span className="so-leitor">{estado}: </span>
          {c.texto}
        </span>
      </li>
    );
  return (
    <li className={`${classe} condicao--grupo`}>
      <Marca valor={c.valor} />
      <div className="condicao__texto">
        <span className="so-leitor">{estado}: </span>
        {TITULO_DO_GRUPO[c.tipo]}
        {c.filhos?.length ? (
          <ul>
            {c.filhos.map((f, i) => (
              <No key={i} c={f} />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

export function ListaCondicoes({
  condicoes,
  rotulo,
}: {
  readonly condicoes: Condicao;
  readonly rotulo: string;
}) {
  return (
    <ul className="condicoes" aria-label={rotulo}>
      <No c={condicoes} />
    </ul>
  );
}

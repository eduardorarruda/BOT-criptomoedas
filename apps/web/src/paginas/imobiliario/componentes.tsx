import { Info, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CampoTexto } from "../../componentes/Campo";
import { lerPercentualDigitado } from "./formato";

/** Peças repetidas nas telas do imobiliário. */

/** Premissas sempre à vista: a conta vale o que valem elas. Nunca é recomendação. */
export function Premissas({
  itens,
  titulo = "Premissas desta conta",
}: {
  readonly itens: readonly string[];
  readonly titulo?: string;
}) {
  return (
    <aside className="imob-premissas" aria-label={titulo}>
      <p className="imob-premissas__titulo">
        <TriangleAlert size={16} aria-hidden="true" />
        {titulo}
      </p>
      <ul>
        {itens.map((i) => (
          <li key={i}>{i}</li>
        ))}
        <li>
          Simulação e estimativa dependem das premissas: não são promessa de rentabilidade nem recomendação de
          compra ou venda.
        </li>
      </ul>
    </aside>
  );
}

export function Explicacao({ children }: { readonly children: ReactNode }) {
  return (
    <p className="nota">
      <Info size={16} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Campo de valor em reais ou percentual: texto livre ("1.234,56", "10,5"), lido sem float. */
export function CampoValor({
  rotulo,
  valor,
  aoMudar,
  dica,
  erro,
  sufixo,
}: {
  readonly rotulo: string;
  readonly valor: string;
  readonly aoMudar: (v: string) => void;
  readonly dica?: ReactNode | undefined;
  readonly erro?: string | null | undefined;
  readonly sufixo?: "R$" | "%" | "US$" | "meses" | "anos" | "cotas" | undefined;
}) {
  return (
    <CampoTexto
      rotulo={sufixo ? `${rotulo} (${sufixo})` : rotulo}
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      inputMode="decimal"
      autoComplete="off"
      dica={dica}
      erro={erro}
    />
  );
}

/** A premissa de CDI usada nas comparações (vazia = sem comparação). */
export function PremissaCdi({
  cdi,
  aoMudar,
}: {
  readonly cdi: number | null;
  readonly aoMudar: (v: number | null) => void;
}) {
  const [texto, setTexto] = useState(cdi === null ? "" : String(cdi * 100).replace(".", ","));
  const [erro, setErro] = useState<string | null>(null);
  const mudar = (t: string): void => {
    setTexto(t);
    if (t.trim() === "") {
      setErro(null);
      aoMudar(null);
      return;
    }
    const v = lerPercentualDigitado(t);
    const valido = v !== null && v >= 0 && v <= 1;
    setErro(valido ? null : "Digite o CDI ao ano entre 0 e 100, por exemplo 10,5.");
    if (valido) aoMudar(v);
  };
  return (
    <div className="imob-cdi">
      <CampoValor
        rotulo="CDI ao ano para comparar"
        sufixo="%"
        valor={texto}
        aoMudar={mudar}
        erro={erro}
        dica="Premissa sua: a tela compara cada investimento com o mesmo dinheiro rendendo esta taxa. Vazio = sem comparação."
      />
    </div>
  );
}

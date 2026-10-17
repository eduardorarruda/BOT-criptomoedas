import { Dialogo } from "../componentes/Dialogo";
import "../estilos/paleta.css";

/** "?": a lista de atalhos do teclado. Chega sob demanda, como a paleta. */
const GERAIS: readonly (readonly [string, readonly string[]])[] = [
  ["Abrir a paleta de comandos", ["Ctrl", "Shift", "P"]],
  ["Abrir a paleta (fora de um campo)", ["/"]],
  ["Ver esta lista de atalhos", ["?"]],
  ["Buscar nas conversas (Assistente)", ["Ctrl", "K"]],
  ["Conversa nova (Assistente)", ["Ctrl", "Shift", "O"]],
];

function Teclas({ teclas }: { readonly teclas: readonly string[] }) {
  return (
    <dd>
      {teclas.map((t, i) => (
        <kbd key={`${t}-${i}`} className="paleta__tecla">
          {t}
        </kbd>
      ))}
    </dd>
  );
}

/** `irPara`: [nome da tela, letra] de cada "g + letra" (vem da casca, que já tem o menu). */
export function AjudaAtalhos({
  aberta,
  aoFechar,
  irPara,
}: {
  readonly aberta: boolean;
  readonly aoFechar: () => void;
  readonly irPara: readonly (readonly [string, string])[];
}) {
  return (
    <Dialogo
      aberto={aberta}
      aoFechar={aoFechar}
      titulo="Atalhos do teclado"
      descricao="No Mac, Cmd no lugar de Ctrl. As teclas soltas não valem com o cursor num campo de texto."
    >
      <div className="atalhos">
        <section className="atalhos__grupo" aria-labelledby="atalhos-gerais">
          <h3 id="atalhos-gerais" className="rotulo-caixa">
            Em qualquer tela
          </h3>
          <dl className="atalhos__lista">
            {GERAIS.map(([o, teclas]) => (
              <div key={o}>
                <dt>{o}</dt>
                <Teclas teclas={teclas} />
              </div>
            ))}
          </dl>
        </section>
        <section className="atalhos__grupo" aria-labelledby="atalhos-ir">
          <h3 id="atalhos-ir" className="rotulo-caixa">
            Ir para (g e a letra)
          </h3>
          <dl className="atalhos__lista">
            {irPara.map(([nome, letra]) => (
              <div key={letra}>
                <dt>{nome}</dt>
                <Teclas teclas={["g", letra]} />
              </div>
            ))}
          </dl>
        </section>
      </div>
    </Dialogo>
  );
}

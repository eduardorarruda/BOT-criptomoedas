import { CircleAlert, CircleCheck, CircleX, Scale } from "lucide-react";
import type { Backtest } from "../../api/esquemas";
import { Painel } from "../../componentes/Cabecalho";
import { resumoDoVeredito, veredito, type Tom } from "./veredito";

const ICONE = { verde: CircleCheck, amarelo: CircleAlert, vermelho: CircleX } as const;
const ROTULO: Record<Tom, string> = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" };

/** Verificações verdes, amarelas e vermelhas, sempre com ícone e texto (a cor só reforça). */
export function Veredito({ b }: { readonly b: Backtest }) {
  const checagens = veredito(b);
  return (
    <Painel
      titulo="Veredito"
      id={`veredito-${b.id}`}
      icone={Scale}
      descricao={resumoDoVeredito(checagens)}
      variante="destaque"
    >
      <ul role="list" className="bt-veredito">
        {checagens.map((c) => {
          const Icone = ICONE[c.tom];
          return (
            <li key={c.id} className={`bt-veredito__item bt-veredito__item--${c.tom}`}>
              <Icone size={18} strokeWidth={2} aria-hidden="true" />
              <div>
                <p className="bt-veredito__titulo">
                  <span className="so-leitor">{ROTULO[c.tom]}: </span>
                  {c.titulo}
                </p>
                <p className="bt-veredito__detalhe">{c.detalhe}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="bt-veredito__nota">
        Isto descreve o que aconteceu numa simulação do passado. Não é recomendação de investir nem de operar,
        e verde não quer dizer lucro no futuro. Os cortes (100 operações, 5% de ruína…) são regras práticas.
      </p>
    </Painel>
  );
}

import type { CenarioDoAtivoDTO, PensamentoAtualDTO } from "@zentrade/contratos/esquemas";
import { Link } from "@tanstack/react-router";
import { CircleSlash, Sparkles } from "lucide-react";
import { CENARIO, resumoDoRobo } from "../../lib/cenario";
import { formatarRelativo } from "../../lib/tempo";
import { Selo } from "../Selo";
import { NumerosDoCenario, ReguaDaMedia, SeloCenario } from "./Cenario";
import "./cenario.css";

const INTERVALO: Record<string, string> = {
  "1m": "1 min",
  "5m": "5 min",
  "15m": "15 min",
  "30m": "30 min",
  "1h": "1 h",
  "4h": "4 h",
  "1d": "1 dia",
};

const par = (simbolo: string): string => simbolo.replace(/(USDT|BRL|USDC)$/, "/$1");

function RoboDoCenario({ atual, nome }: { readonly atual: PensamentoAtualDTO; readonly nome: string }) {
  const r = resumoDoRobo(atual.pensamento);
  const claude = atual.pensamento.agente === "desligado" ? "Claude desligado" : "Claude confere";
  return (
    <li className="robo-do-cenario">
      <Selo tom={r.tom}>{r.rotulo}</Selo>
      <div>
        <Link to="/aovivo" search={{ robo: atual.roboId }} className="robo-do-cenario__nome">
          {nome}
        </Link>
        <span className="robo-do-cenario__claude">
          {atual.pensamento.agente === "desligado" ? (
            <CircleSlash size={12} aria-hidden="true" />
          ) : (
            <Sparkles size={12} aria-hidden="true" />
          )}
          {claude}
        </span>
      </div>
      <p className="robo-do-cenario__motivo">{r.motivo}</p>
    </li>
  );
}

/**
 * Um ativo: se o mercado está em alta, queda ou lateral (com os números), e o que cada
 * robô que vigia este ativo está fazendo e por quê, numa linha.
 */
export function CartaoCenario({
  ativo,
  robos,
  nomeDoRobo,
  agora,
}: {
  readonly ativo: CenarioDoAtivoDTO;
  readonly robos: readonly PensamentoAtualDTO[];
  readonly nomeDoRobo: (roboId: string) => string;
  readonly agora: number;
}) {
  const c = CENARIO[ativo.cenario.cenario];
  const Icone = c.icone;
  return (
    <article
      className={`cartao-cenario cartao-cenario--${ativo.cenario.cenario}`}
      aria-label={`${par(ativo.simbolo)} em ${INTERVALO[ativo.intervalo]}: ${c.extenso}`}
    >
      <header className="cartao-cenario__topo">
        <span className="cartao-cenario__medalha" aria-hidden="true">
          <Icone size={22} strokeWidth={1.9} />
        </span>
        <div className="cartao-cenario__ativo">
          <h3 className="cartao-cenario__nome">{par(ativo.simbolo)}</h3>
          <span className="cartao-cenario__intervalo">velas de {INTERVALO[ativo.intervalo]}</span>
        </div>
        <SeloCenario cenario={ativo.cenario.cenario} />
      </header>
      <p className="cartao-cenario__frase">{ativo.cenario.texto}</p>
      <ReguaDaMedia leitura={ativo.cenario} />
      <NumerosDoCenario leitura={ativo.cenario} />
      <ul className="robos-do-cenario" aria-label={`Robôs em ${par(ativo.simbolo)}`}>
        {robos.map((r) => (
          <RoboDoCenario key={r.roboId} atual={r} nome={nomeDoRobo(r.roboId)} />
        ))}
      </ul>
      <p className="cartao-cenario__atualizado">
        Lido na vela fechada{" "}
        <time dateTime={new Date(ativo.em).toISOString()}>{formatarRelativo(ativo.em, agora)}</time>.
      </p>
    </article>
  );
}

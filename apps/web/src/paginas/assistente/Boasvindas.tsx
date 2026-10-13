import { useQueryClient } from "@tanstack/react-query";
import { Bot, CalendarClock, Coins, Scale, type LucideIcon } from "lucide-react";
import type { Usuario } from "../../api/esquemas";
import { Enso } from "../../componentes/Enso";
import { chaves } from "../../ganchos/chaves";

const SUGESTOES: readonly { readonly texto: string; readonly icone: LucideIcon }[] = [
  { texto: "Como estão meus robôs hoje?", icone: Bot },
  { texto: "Resumo da minha carteira cripto", icone: Coins },
  { texto: "Quando vencem meus títulos de renda fixa?", icone: CalendarClock },
  { texto: "Explique a última decisão do robô", icone: Scale },
];

function saudacao(hora: number): string {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** O começo de uma conversa: o Ensō, uma saudação pelo nome e o que dá para perguntar. */
export function Saudacao() {
  // A sessão já foi carregada antes de abrir qualquer tela (a rota exige): só lê do cache.
  const usuario = useQueryClient().getQueryData<Usuario | null>(chaves.sessao);
  const primeiro = usuario?.nome.trim().split(/\s+/)[0];
  // O usuário do modo de demonstração se chama "Você": "Boa noite, Você" soaria estranho.
  const primeiroNome = primeiro && primeiro.toLowerCase() !== "você" ? primeiro : null;
  return (
    <div className="saudacao">
      <Enso tamanho={52} animar rotulo="ZenTrade" />
      <h2 className="saudacao__titulo titulo-serif">
        {saudacao(new Date().getHours())}
        {primeiroNome ? `, ${primeiroNome}` : ""}
      </h2>
      <p className="saudacao__texto">
        Pergunte sobre os seus robôs, a carteira, a renda fixa e as decisões. Eu só leio os seus dados e
        mostro de onde tirei cada coisa. Quem decide continua sendo você.
      </p>
    </div>
  );
}

export function Sugestoes({
  aoEscolher,
  desligadas,
}: {
  readonly aoEscolher: (texto: string) => void;
  readonly desligadas: boolean;
}) {
  return (
    <ul className="sugestoes" aria-label="Sugestões">
      {SUGESTOES.map(({ texto, icone: Icone }) => (
        <li key={texto}>
          <button type="button" className="sugestao" onClick={() => aoEscolher(texto)} disabled={desligadas}>
            <Icone size={15} aria-hidden="true" />
            {texto}
          </button>
        </li>
      ))}
    </ul>
  );
}

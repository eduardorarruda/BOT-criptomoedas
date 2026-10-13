import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { Cabecalho } from "../../componentes/Cabecalho";
import { Segmentado } from "../../componentes/Segmentado";
import { SimAlugarComprar } from "./simuladores/SimAlugarComprar";
import { SimFii } from "./simuladores/SimFii";
import { SimFinanciamento } from "./simuladores/SimFinanciamento";
import { SimGanhoCapital } from "./simuladores/SimGanhoCapital";
import { SimRentabilidade } from "./simuladores/SimRentabilidade";
import "./imobiliario.css";

/** Simuladores sem cadastro: a conta roda no navegador e muda enquanto você digita. */
const ABAS = {
  financiamento: {
    rotulo: "Financiamento",
    descricao: "SAC × Price lado a lado.",
    Componente: SimFinanciamento,
  },
  "alugar-comprar": {
    rotulo: "Alugar × comprar",
    descricao: "Com custo de oportunidade.",
    Componente: SimAlugarComprar,
  },
  rentabilidade: {
    rotulo: "Rentabilidade",
    descricao: "Cap rate, TIR, VPL e payback de um imóvel.",
    Componente: SimRentabilidade,
  },
  fii: { rotulo: "FII", descricao: "Renda mensal para X cotas.", Componente: SimFii },
  "ganho-capital": {
    rotulo: "Venda e IR",
    descricao: "Ganho de capital na venda de um imóvel.",
    Componente: SimGanhoCapital,
  },
} as const;
type Aba = keyof typeof ABAS;

export function Simuladores() {
  const [aba, setAba] = useState<Aba>("financiamento");
  const { Componente, descricao } = ABAS[aba];
  return (
    <div className="pilha">
      <Cabecalho
        titulo="Simuladores imobiliários"
        acoes={
          <Link to="/imobiliario" className="botao botao--fantasma">
            <ArrowLeft size={16} aria-hidden="true" /> Imobiliário
          </Link>
        }
      >
        Contas sem cadastro, com as premissas à vista. Simulação não é promessa de rentabilidade nem conselho
        de compra ou venda.
      </Cabecalho>
      <Segmentado
        rotulo="Simulador"
        opcoes={(Object.keys(ABAS) as Aba[]).map((valor) => ({ valor, rotulo: ABAS[valor].rotulo }))}
        valor={aba}
        aoMudar={setAba}
      />
      <h2 className="so-leitor">{ABAS[aba].rotulo}</h2>
      <p className="apagado">{descricao}</p>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={aba}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Componente />
        </m.div>
      </AnimatePresence>
    </div>
  );
}

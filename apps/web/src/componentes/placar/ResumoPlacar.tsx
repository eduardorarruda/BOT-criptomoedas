import { Link } from "@tanstack/react-router";
import { ArrowRight, Coins, ShieldCheck, Target } from "lucide-react";
import { usePlacar } from "../../ganchos/consultas";
import { Painel } from "../Cabecalho";
import { Dinheiro } from "../Dinheiro";
import { ErroCarregar, Esqueleto } from "../Estados";
import { CartaoKpi, GradeKpi } from "../Kpi";
import { contagem, moedaDaTela, porcento, tomDaPrecisao } from "./formato";
import "./placar.css";

/** O placar do Claude em três números, para a visão geral. Sem decisões do Claude, não ocupa espaço. */
export function ResumoPlacar() {
  const { data, error, isPending, refetch } = usePlacar();
  if (isPending) return <Esqueleto forma="kpis" quantidade={3} rotulo="Carregando o placar do Claude" />;
  if (error) return <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} compacto />;
  const m = data.total;
  if (m.decisoes === 0) return null;
  const tom = tomDaPrecisao(m.aprovacoes.taxa, data.meta);
  return (
    <Painel
      titulo="Placar do Claude"
      id="titulo-resumo-placar"
      icone={Target}
      descricao={m.aviso ?? `Meta: pelo menos ${porcento(data.meta)} das aprovações com lucro.`}
      acoes={
        <Link to="/decisoes" hash="placar" className="link-seta">
          Ver o placar <ArrowRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      <GradeKpi rotulo="Resumo do placar do Claude" colunas={3} className="placar-resumo-kpis">
        <CartaoKpi
          icone={Target}
          rotulo="Aprovações certas"
          valor={<span className="num">{porcento(m.aprovacoes.taxa)}</span>}
          nota={contagem(m.aprovacoes)}
          {...(tom === "atencao" ? { tom: "atencao" as const } : {})}
        />
        <CartaoKpi
          icone={ShieldCheck}
          rotulo="Vetos certos"
          valor={<span className="num">{porcento(m.vetos.taxa)}</span>}
          nota={contagem(m.vetos)}
        />
        <CartaoKpi
          icone={Coins}
          rotulo="Agregou contra aprovar tudo"
          valor={
            m.dinheiro ? (
              <Dinheiro valor={m.dinheiro.agregado} sinal colorir moeda={moedaDaTela(m.moeda)} />
            ) : (
              <span className="apagado">—</span>
            )
          }
          nota="em dinheiro, depois das taxas"
        />
      </GradeKpi>
    </Painel>
  );
}

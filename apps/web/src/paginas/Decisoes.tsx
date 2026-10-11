import type { EstadoDecisao } from "@zentrade/contratos/esquemas";
import { ScrollText } from "lucide-react";
import { useState } from "react";
import { Cabecalho } from "../componentes/Cabecalho";
import { CampoSelecao } from "../componentes/Campo";
import { AnalisesAoVivo } from "../componentes/decisao/AnalisesAoVivo";
import { CartaoDecisao } from "../componentes/decisao/CartaoDecisao";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { Segmentado } from "../componentes/Segmentado";
import { useDecisoes, useRobos } from "../ganchos/consultas";
import { agruparPorDia } from "../lib/agrupar";

type Filtro = "todas" | EstadoDecisao;
const FILTROS: readonly { valor: Filtro; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "aguardando_aprovacao", rotulo: "Aguardam você" },
  { valor: "executada", rotulo: "Executadas" },
  { valor: "barrada", rotulo: "Barradas" },
  { valor: "registrada", rotulo: "Só registradas" },
];

const VAZIO: Record<Filtro, string> = {
  todas:
    "Quando uma estratégia der sinal, a decisão aparece aqui com o raciocínio, as fontes e o veredito do risco.",
  aguardando_aprovacao: "Nada esperando sua resposta. Robôs no modo Sugerir pedem aprovação aqui.",
  executada: "Nenhuma ordem executada com esse filtro.",
  barrada: "O risco não barrou nada com esse filtro.",
  registrada: "Robôs no modo Observar registram aqui o que teriam feito.",
  aprovada: "Nenhuma decisão aprovada.",
  recusada: "Nenhuma decisão recusada.",
  expirada: "Nenhuma decisão expirada.",
  falhou: "Nenhuma falha.",
};

export function Decisoes() {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [roboId, setRoboId] = useState("");
  const robos = useRobos().data ?? [];
  const consulta = useDecisoes({
    ...(filtro === "todas" ? {} : { estado: filtro }),
    ...(roboId ? { roboId } : {}),
    limite: 100,
  });
  const grupos = agruparPorDia(consulta.data ?? [], (d) => d.em);

  return (
    <>
      <Cabecalho titulo="Decisões">
        O diário dos robôs: por que o sinal disparou, o que a IA argumentou, o que o risco decidiu e como
        terminou.
      </Cabecalho>
      <div className="barra-filtros">
        <Segmentado rotulo="Mostrar" opcoes={FILTROS} valor={filtro} aoMudar={setFiltro} />
        <CampoSelecao
          rotulo="Robô"
          value={roboId}
          onChange={(e) => setRoboId(e.target.value)}
          className="campo--estreito"
        >
          <option value="">Todos os robôs</option>
          {robos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </CampoSelecao>
      </div>
      <AnalisesAoVivo robos={robos} roboId={roboId || undefined} />
      {consulta.isPending ? <Esqueleto linhas={8} rotulo="Carregando as decisões" /> : null}
      {consulta.error ? (
        <ErroCarregar erro={consulta.error} tentarDeNovo={() => void consulta.refetch()} />
      ) : null}
      {consulta.data?.length === 0 ? (
        <EstadoVazio icone={ScrollText} titulo="Nada por aqui">
          {VAZIO[filtro]}
        </EstadoVazio>
      ) : null}
      <div className="linha-do-tempo">
        {grupos.map((g) => (
          <section key={g.chave} className="linha-do-tempo__dia" aria-labelledby={`dia-${g.chave}`}>
            <h2 id={`dia-${g.chave}`} className="linha-do-tempo__titulo">
              {g.titulo}
            </h2>
            <ol role="list" className="linha-do-tempo__lista">
              {g.itens.map((d) => (
                <li key={d.id}>
                  <CartaoDecisao decisao={d} robo={robos.find((r) => r.id === d.roboId)} />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}

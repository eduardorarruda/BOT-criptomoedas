import type { ModoRobo, RoboDTO } from "@zentrade/contratos/esquemas";
import { Link } from "@tanstack/react-router";
import { Bot, Pause, Play, Plus, Radio, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { mensagemDe } from "../api/erros";
import { useAvisos } from "../componentes/Avisos";
import { Botao } from "../componentes/Botao";
import { Cabecalho } from "../componentes/Cabecalho";
import { Dialogo } from "../componentes/Dialogo";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { PrecoAoVivo } from "../componentes/PrecoAoVivo";
import { Segmentado } from "../componentes/Segmentado";
import { Selo } from "../componentes/Selo";
import { useEstrategias, useRobos } from "../ganchos/consultas";
import { useAtualizarRobo, useCriarRobo } from "../ganchos/mutacoes";
import { formatarDinheiro, formatarPercentual } from "../lib/formatar";
import { MODO_ROBO, REDE } from "../lib/rotulos";
import { formatarData } from "../lib/tempo";
import { EditorLimites } from "./robos/EditorLimites";
import { FormRobo } from "./robos/FormRobo";

const MODOS = (Object.keys(MODO_ROBO) as ModoRobo[]).map((m) => ({ valor: m, rotulo: MODO_ROBO[m].texto }));

function LinhaRobo({ robo, nomeEstrategia }: { readonly robo: RoboDTO; readonly nomeEstrategia: string }) {
  const atualizar = useAtualizarRobo();
  const avisar = useAvisos();
  const [confirmarAuto, setConfirmarAuto] = useState(false);
  const mudar = (mudanca: Parameters<typeof atualizar.mutate>[0]["mudanca"], texto: string): void =>
    atualizar.mutate(
      { id: robo.id, mudanca },
      { onSuccess: () => avisar("sucesso", texto), onError: (e) => avisar("erro", mensagemDe(e)) },
    );
  const l = robo.limites;

  return (
    <li className={`robo ${robo.pausado ? "robo--pausado" : ""} ${robo.modo === "auto" ? "robo--auto" : ""}`}>
      <div className="robo__topo">
        <div className="robo__identidade">
          <h2 className="robo__nome">{robo.nome}</h2>
          <p className="robo__meta">
            <span className="num">{robo.simbolo}</span> · {robo.intervalo} · {nomeEstrategia} v
            {robo.estrategiaVersao}
          </p>
        </div>
        <div className="robo__cotacao">
          <span className="robo__preco">
            <PrecoAoVivo simbolo={robo.simbolo} />
          </span>
          <span className="robo__desde">desde {formatarData(robo.criadoEm)}</span>
        </div>
      </div>
      <div className="robo__selos">
        <Selo tom={REDE[robo.rede].tom}>{REDE[robo.rede].texto}</Selo>
        {robo.pausado ? (
          <Selo tom="atencao" icone={Pause}>
            Pausado
          </Selo>
        ) : (
          <Selo tom={robo.modo === "auto" ? "marca" : "neutro"} ponto>
            Ativo
          </Selo>
        )}
      </div>
      <div className="robo__modo">
        <Segmentado
          rotulo={`Modo de ${robo.nome}`}
          ocultarRotulo
          opcoes={MODOS}
          valor={robo.modo}
          aoMudar={(m) =>
            m === "auto"
              ? setConfirmarAuto(true)
              : mudar({ modo: m }, `${robo.nome} agora está em ${MODO_ROBO[m].texto}.`)
          }
        />
        <p className="robo__modo-descricao">{MODO_ROBO[robo.modo].descricao}</p>
      </div>
      <div className="robo__rodape">
        <details className="robo__limites">
          <summary>
            <SlidersHorizontal size={15} aria-hidden="true" />
            <span className="so-leitor">Limites de risco:</span>
            <span className="robo__limite">
              perda diária <span className="num">{formatarDinheiro(l.perdaDiariaMaxima)}</span>
            </span>
            <span className="robo__limite">
              exposição <span className="num">{formatarDinheiro(l.exposicaoMaxima)}</span>
            </span>
            <span className="robo__limite">
              confiança <span className="num">{formatarPercentual(l.confiancaMinima, { casas: 0 })}</span>
            </span>
          </summary>
          <EditorLimites
            limites={l}
            salvando={atualizar.isPending}
            aoSalvar={(limites) => mudar({ limites }, `Limites de ${robo.nome} salvos.`)}
          />
        </details>
        <div className="robo__acoes">
          <Link
            to="/aovivo"
            search={{ robo: robo.id }}
            className="botao botao--fantasma botao--pequeno"
            aria-label={`Ver ${robo.nome} ao vivo`}
          >
            <Radio size={15} aria-hidden="true" />
            Ao vivo
          </Link>
          <Botao
            pequeno
            icone={robo.pausado ? Play : Pause}
            carregando={atualizar.isPending}
            onClick={() =>
              mudar(
                { pausado: !robo.pausado },
                robo.pausado
                  ? `${robo.nome} voltou a trabalhar.`
                  : `${robo.nome} pausado. Nada é analisado até você retomar.`,
              )
            }
          >
            {robo.pausado ? "Retomar" : "Pausar"}
          </Botao>
        </div>
      </div>
      <Dialogo
        aberto={confirmarAuto}
        aoFechar={() => setConfirmarAuto(false)}
        titulo="Ligar o modo automático?"
        descricao={`No automático, ${robo.nome} envia ordens sozinho sempre que o motor de risco aprovar, sem pedir sua confirmação. Rede: ${REDE[robo.rede].texto}.`}
      >
        <div className="formulario__acoes">
          <Botao variante="fantasma" onClick={() => setConfirmarAuto(false)}>
            Continuar como está
          </Botao>
          <Botao
            variante={robo.rede === "real" ? "perigo" : "primario"}
            onClick={() => {
              setConfirmarAuto(false);
              mudar({ modo: "auto" }, `${robo.nome} agora opera sozinho, dentro dos limites de risco.`);
            }}
          >
            Ligar automático
          </Botao>
        </div>
      </Dialogo>
    </li>
  );
}

export function Robos() {
  const robos = useRobos();
  const estrategias = useEstrategias();
  const criar = useCriarRobo();
  const avisar = useAvisos();
  const [criando, setCriando] = useState(false);
  const nome = (id: string) => estrategias.data?.find((e) => e.id === id)?.nome ?? "estratégia";

  return (
    <>
      <Cabecalho
        titulo="Robôs"
        acoes={
          <Botao variante="primario" icone={Plus} onClick={() => setCriando(true)}>
            Novo robô
          </Botao>
        }
      >
        Cada robô segue uma estratégia num par. Você escolhe se ele só observa, sugere ou opera sozinho.
      </Cabecalho>
      {robos.isPending ? <Esqueleto forma="cartoes" quantidade={4} rotulo="Carregando robôs" /> : null}
      {robos.error ? <ErroCarregar erro={robos.error} tentarDeNovo={() => void robos.refetch()} /> : null}
      {robos.data?.length === 0 ? (
        <EstadoVazio
          icone={Bot}
          titulo="Nenhum robô ainda"
          acao={
            <Botao variante="primario" icone={Plus} onClick={() => setCriando(true)}>
              Criar o primeiro robô
            </Botao>
          }
        >
          Um robô novo nasce só observando: registra o que faria, sem enviar ordens.
        </EstadoVazio>
      ) : null}
      <ul role="list" className="robos">
        {robos.data?.map((r) => (
          <LinhaRobo key={r.id} robo={r} nomeEstrategia={nome(r.estrategiaId)} />
        ))}
      </ul>
      <Dialogo aberto={criando} aoFechar={() => setCriando(false)} titulo="Novo robô" largo>
        <FormRobo
          estrategias={estrategias.data ?? []}
          enviando={criar.isPending}
          aoCancelar={() => setCriando(false)}
          aoCriar={(r) =>
            criar.mutate(r, {
              onSuccess: (robo) => {
                setCriando(false);
                avisar("sucesso", `${robo.nome} criado. Ele começa observando.`);
              },
              onError: (e) => avisar("erro", mensagemDe(e)),
            })
          }
        />
      </Dialogo>
    </>
  );
}

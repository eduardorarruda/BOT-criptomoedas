import type { ItemPluggy } from "@zentrade/contratos/esquemas";
import { CircleAlert, CircleCheck, KeyRound, Link2, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { CampoTexto } from "../../componentes/Campo";
import { Confirmar } from "../../componentes/Confirmar";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import {
  useConectarItem,
  useFonteRendaFixa,
  usePluggy,
  useRemoverItem,
  useSincronizarItem,
} from "./consultas";
import { abrirWidget, ehUuid } from "./pluggy-widget";

const quando = (ms: number | null): string =>
  ms === null
    ? "nunca"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(ms);

const SITUACAO: Record<string, { texto: string; tom: "ganho" | "atencao" | "perda" }> = {
  UPDATED: { texto: "Atualizado", tom: "ganho" },
  UPDATING: { texto: "Atualizando", tom: "atencao" },
  WAITING_USER_INPUT: { texto: "Esperando você no banco", tom: "atencao" },
  LOGIN_ERROR: { texto: "Login recusado", tom: "perda" },
  OUTDATED: { texto: "Desatualizado", tom: "perda" },
};

function Item({ item }: { readonly item: ItemPluggy }) {
  const s = SITUACAO[item.situacao] ?? { texto: item.situacao, tom: "atencao" as const };
  return (
    <li className="rf-item">
      <div className="rf-item__topo">
        {item.logoUrl ? (
          <img src={item.logoUrl} alt="" width={28} height={28} className="rf-item__logo" />
        ) : (
          <PlugZap size={22} aria-hidden="true" />
        )}
        <strong>{item.instituicao}</strong>
        <Selo tom={s.tom} icone={s.tom === "ganho" ? CircleCheck : CircleAlert}>
          {s.texto}
        </Selo>
      </div>
      <p className="apagado">
        {item.titulos} títulos · banco atualizou em {quando(item.atualizadoNoBanco)} · última sincronização{" "}
        {quando(item.ultimaSincronizacao)}
      </p>
      {item.erro || item.erroSincronizacao ? (
        <p className="nota nota--perigo" role="status">
          {item.erroSincronizacao ?? item.erro}
        </p>
      ) : null}
      <AcoesItem item={item} />
    </li>
  );
}

/** Sincronizar agora e remover só daqui (nunca na Pluggy). */
function AcoesItem({ item }: { readonly item: ItemPluggy }) {
  const sincronizar = useSincronizarItem();
  const remover = useRemoverItem();
  const avisar = useAvisos();
  const [removendo, setRemovendo] = useState(false);
  return (
    <>
      <div className="rf-acoes">
        <Botao
          pequeno
          icone={RefreshCw}
          carregando={sincronizar.isPending}
          onClick={() =>
            sincronizar.mutate(item.id, {
              onSuccess: (r) =>
                avisar(
                  "sucesso",
                  `Sincronizado: ${r.novos} novos, ${r.atualizados} atualizados, ${r.encerrados} encerrados${r.ignorados ? `, ${r.ignorados} fora da renda fixa` : ""}.`,
                ),
              onError: (e) => avisar("erro", mensagemDe(e)),
            })
          }
        >
          Sincronizar agora
        </Botao>
        <Botao pequeno variante="fantasma" icone={Trash2} onClick={() => setRemovendo(true)}>
          Remover daqui
        </Botao>
      </div>
      <Confirmar
        aberto={removendo}
        titulo="Remover esta conexão do ZenTrade?"
        rotuloConfirmar="Remover daqui"
        carregando={remover.isPending}
        aoCancelar={() => setRemovendo(false)}
        aoConfirmar={() =>
          remover.mutate(item.id, {
            onSuccess: () => {
              setRemovendo(false);
              avisar("sucesso", "Conexão removida do ZenTrade. Na Pluggy ela continua existindo.");
            },
            onError: (e) => avisar("erro", mensagemDe(e)),
          })
        }
      >
        Os títulos desta conexão saem da carteira. A conexão na Pluggy não é apagada: no MeuPluggy, reconectar
        depois dos 15 dias de teste não é possível, então não a apague lá.
      </Confirmar>
    </>
  );
}

function PorItemId() {
  const [aberto, setAberto] = useState(false);
  const [id, setId] = useState("");
  const conectar = useConectarItem();
  const avisar = useAvisos();
  if (!aberto) {
    return (
      <button type="button" className="link-seta" onClick={() => setAberto(true)}>
        Já tenho o Item ID
      </button>
    );
  }
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!ehUuid(id)) return;
    conectar.mutate(id.trim(), {
      onSuccess: (r) => avisar("sucesso", `${r.item.instituicao} conectado: ${r.novos} títulos.`),
      onError: (er) => avisar("erro", mensagemDe(er)),
    });
  };
  return (
    <form className="formulario formulario--linha" onSubmit={enviar} noValidate>
      <CampoTexto
        rotulo="Item ID (painel da Pluggy)"
        value={id}
        onChange={(e) => setId(e.target.value)}
        className="campo--mono"
        erro={id && !ehUuid(id) ? "o Item ID é um UUID (36 caracteres)" : null}
      />
      <Botao type="submit" pequeno carregando={conectar.isPending} disabled={!ehUuid(id)}>
        Ligar conexão
      </Botao>
    </form>
  );
}

function BotaoConectar() {
  const fonte = useFonteRendaFixa();
  const conectar = useConectarItem();
  const avisar = useAvisos();
  const [abrindo, setAbrindo] = useState(false);
  const iniciar = async () => {
    setAbrindo(true);
    try {
      const itemId = await abrirWidget(await fonte.connectToken());
      if (!itemId) return;
      const r = await conectar.mutateAsync(itemId);
      avisar("sucesso", `${r.item.instituicao} conectado: ${r.novos} títulos de renda fixa.`);
    } catch (e) {
      avisar(
        "erro",
        e instanceof Error && !("codigo" in e) ? `Não deu para conectar: ${e.message}.` : mensagemDe(e),
      );
    } finally {
      setAbrindo(false);
    }
  };
  return (
    <Botao
      variante="primario"
      icone={Link2}
      carregando={abrindo || conectar.isPending}
      onClick={() => void iniciar()}
    >
      Conectar banco
    </Botao>
  );
}

export function Conectar({ demo }: { readonly demo: boolean }) {
  const { data, error, isPending, refetch } = usePluggy();
  if (isPending) return <Esqueleto linhas={3} rotulo="Carregando as conexões" />;
  if (error) return <ErroCarregar erro={error} tentarDeNovo={() => void refetch()} />;
  if (!data.configurada) {
    return (
      <EstadoVazio
        icone={KeyRound}
        titulo={demo ? "Sem conexão na demonstração" : "A Pluggy não está configurada"}
      >
        {demo
          ? "Na demonstração não há conexão com bancos. "
          : "Quem administra esta instalação precisa criar uma aplicação no painel da Pluggy (dashboard.pluggy.ai) e pôr PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env da API. "}
        O caminho gratuito para uso pessoal é o MeuPluggy, que só deixa conectar bancos nos 15 dias de teste
        da conta de desenvolvedor: faça a conexão nesse prazo. O cadastro manual funciona sem nada disso.
      </EstadoVazio>
    );
  }
  return (
    <div className="pilha">
      <Painel titulo="Conectar pela Pluggy (Open Finance)">
        <p>
          O widget da Pluggy abre aqui mesmo. A autorização é feita no app do seu banco; o ZenTrade só lê os
          investimentos, nunca movimenta dinheiro, e não vê sua senha. Os dados são sincronizados ao conectar,
          a cada 6 horas e quando você pedir.
        </p>
        <p className="nota">
          MeuPluggy: só dá para conectar bancos nos 15 dias de teste da conta de desenvolvedor. Depois disso a
          conexão segue funcionando, mas não entra banco novo, e apagar a conexão na Pluggy faz perder o
          acesso.
        </p>
        <div className="rf-acoes">
          <BotaoConectar />
          <PorItemId />
        </div>
      </Painel>
      <Painel titulo="Conexões">
        {data.itens.length === 0 ? (
          <p className="apagado">Nenhuma conexão ainda.</p>
        ) : (
          <ul className="rf-itens" role="list">
            {data.itens.map((i) => (
              <Item key={i.id} item={i} />
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}

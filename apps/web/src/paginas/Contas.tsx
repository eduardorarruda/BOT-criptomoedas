import type { Rede } from "@zentrade/contratos";
import { KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { mensagemDe } from "../api/erros";
import type { ContaCorretora } from "../api/esquemas";
import { useAvisos } from "../componentes/Avisos";
import { Botao } from "../componentes/Botao";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { CampoSelecao, CampoTexto } from "../componentes/Campo";
import { Confirmar } from "../componentes/Confirmar";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { Selo } from "../componentes/Selo";
import { useContas } from "../ganchos/consultas";
import { useCriarConta, useRemoverConta } from "../ganchos/mutacoes";
import { REDE } from "../lib/rotulos";
import { formatarData } from "../lib/tempo";

function FormConta() {
  const criar = useCriarConta();
  const avisar = useAvisos();
  const [rede, setRede] = useState<Exclude<Rede, "papel">>("testnet");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [semSaque, setSemSaque] = useState(false);
  const [presaIp, setPresaIp] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    if (!semSaque || !presaIp) {
      setErro("Confirme os dois cuidados: a chave sem permissão de saque e presa ao IP do servidor.");
      return;
    }
    if (apiKey.trim().length < 16 || apiSecret.trim().length < 16) {
      setErro("A chave e o segredo da Binance têm dezenas de caracteres. Copie de novo, sem espaços.");
      return;
    }
    setErro(null);
    criar.mutate(
      { corretora: "binance", rede, apiKey: apiKey.trim(), apiSecret: apiSecret.trim() },
      {
        onSuccess: (c) => {
          setApiKey("");
          setApiSecret("");
          setSemSaque(false);
          setPresaIp(false);
          avisar(
            "sucesso",
            `Chave ${c.apiKeyFinal} cadastrada. O segredo foi guardado cifrado e não volta para a tela.`,
          );
        },
        onError: (er) => avisar("erro", mensagemDe(er)),
      },
    );
  };

  return (
    <form className="formulario" onSubmit={enviar} noValidate autoComplete="off">
      <div className="alerta-chave" role="note">
        <ShieldAlert size={20} aria-hidden="true" />
        <div>
          <p>
            <strong>Antes de colar a chave, na Binance:</strong>
          </p>
          <ol>
            <li>
              Crie a chave <strong>sem permissão de saque</strong>. O ZenTrade só precisa ler e negociar.
            </li>
            <li>
              <strong>Restrinja a chave ao IP</strong> do servidor onde o ZenTrade roda. Chave sem IP fixo
              pode ser usada de qualquer lugar.
            </li>
            <li>Comece pela testnet. Dinheiro real só depois de semanas observando.</li>
          </ol>
        </div>
      </div>
      <CampoSelecao
        rotulo="Rede"
        value={rede}
        onChange={(e) => setRede(e.target.value as Exclude<Rede, "papel">)}
        dica={REDE[rede].descricao}
      >
        <option value="testnet">Testnet (recomendado)</option>
        <option value="real">Dinheiro real</option>
      </CampoSelecao>
      <CampoTexto
        rotulo="Chave da API (API Key)"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        className="campo--mono"
      />
      <CampoTexto
        rotulo="Segredo (Secret Key)"
        type="password"
        value={apiSecret}
        onChange={(e) => setApiSecret(e.target.value)}
        spellCheck={false}
        autoComplete="new-password"
        dica="Vai cifrado para a API e nunca é mostrado de novo."
      />
      <label className="caixa">
        <input type="checkbox" checked={semSaque} onChange={(e) => setSemSaque(e.target.checked)} />
        <span>A chave não tem permissão de saque.</span>
      </label>
      <label className="caixa">
        <input type="checkbox" checked={presaIp} onChange={(e) => setPresaIp(e.target.checked)} />
        <span>A chave está presa ao IP do servidor do ZenTrade.</span>
      </label>
      {erro ? (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="formulario__acoes">
        <Botao type="submit" variante="primario" icone={Plus} carregando={criar.isPending}>
          Cadastrar chave
        </Botao>
      </div>
      <p className="apagado">Cadastrar uma chave pede que você confirme sua identidade.</p>
    </form>
  );
}

export function Contas() {
  const contas = useContas();
  const remover = useRemoverConta();
  const avisar = useAvisos();
  const [removendo, setRemovendo] = useState<ContaCorretora | null>(null);

  return (
    <>
      <Cabecalho titulo="Contas e chaves">
        As chaves de corretora que os robôs usam. O segredo fica cifrado no servidor; aqui só aparece o fim da
        chave.
      </Cabecalho>
      <div className="grade-dupla">
        <Painel titulo="Chaves cadastradas" id="titulo-chaves">
          {contas.isPending ? <Esqueleto linhas={3} /> : null}
          {contas.error ? (
            <ErroCarregar erro={contas.error} tentarDeNovo={() => void contas.refetch()} />
          ) : null}
          {contas.data?.length === 0 ? (
            <EstadoVazio icone={KeyRound} titulo="Nenhuma chave">
              Sem chave, os robôs operam só em papel. Cadastre uma chave da testnet para testar com a
              corretora.
            </EstadoVazio>
          ) : null}
          <ul role="list" className="chaves">
            {contas.data?.map((c) => (
              <li key={c.id}>
                <KeyRound size={16} aria-hidden="true" />
                <span>
                  Binance <span className="num apagado">{c.apiKeyFinal}</span>
                </span>
                <Selo tom={REDE[c.rede].tom}>{REDE[c.rede].texto}</Selo>
                <span className="apagado">desde {formatarData(c.criadaEm)}</span>
                <Botao
                  pequeno
                  variante="fantasma"
                  icone={Trash2}
                  onClick={() => setRemovendo(c)}
                  aria-label={`Remover chave ${c.apiKeyFinal}`}
                >
                  Remover
                </Botao>
              </li>
            ))}
          </ul>
        </Painel>
        <Painel titulo="Cadastrar chave da Binance" id="titulo-cadastrar">
          <FormConta />
        </Painel>
      </div>
      <Confirmar
        aberto={removendo !== null}
        titulo="Remover esta chave?"
        rotuloConfirmar="Remover chave"
        carregando={remover.isPending}
        aoCancelar={() => setRemovendo(null)}
        aoConfirmar={() =>
          removendo &&
          remover.mutate(removendo.id, {
            onSuccess: () => {
              avisar("sucesso", "Chave removida. Apague-a também na Binance.");
              setRemovendo(null);
            },
            onError: (e) => avisar("erro", mensagemDe(e)),
          })
        }
      >
        Robôs que usam a chave {removendo?.apiKeyFinal} param de enviar ordens. Para invalidar de vez, apague
        a chave também no site da Binance.
      </Confirmar>
    </>
  );
}

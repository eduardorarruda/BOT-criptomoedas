import type { Rede } from "@zentrade/contratos/esquemas";
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
import { useStatusBinance } from "./carteira/ganchos";
import { formatarData } from "../lib/tempo";
import { DoisFatores } from "./contas/DoisFatores";

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
    if (!semSaque) {
      setErro("Confirme que a chave não tem permissão de saque: chave com saque é recusada.");
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
              Crie a chave <strong>sem permissão de saque</strong>. O ZenTrade só precisa ler e negociar. Na
              rede real ele confere as permissões na Binance antes de salvar:{" "}
              <strong>chave com saque é recusada</strong>, e uma chave que ganhe saque depois deixa de operar.
            </li>
            <li>
              <strong>Restrinja a chave ao IP</strong> do servidor onde o ZenTrade roda (recomendação da
              Binance). Sem isso a chave é aceita, mas fica um aviso: quem a obtiver pode negociar na sua
              conta de qualquer lugar.
            </li>
            <li>Comece pela testnet. Dinheiro real só depois de semanas observando, e com 2FA ligado.</li>
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
        <span>A chave está presa ao IP do servidor do ZenTrade (recomendado).</span>
      </label>
      {rede === "real" && !presaIp ? (
        <p className="formulario__erro" role="note">
          Chave de dinheiro real sem restrição de IP: se ela vazar, qualquer um negocia na sua conta. Se o IP
          do servidor é fixo, restrinja a chave a ele na Binance antes de cadastrar.
        </p>
      ) : null}
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

/** O que a Binance diz da chave agora (permissões, IP): bloqueio e riscos em destaque. */
function AvisosDaChave({ rede }: { readonly rede: ContaCorretora["rede"] }) {
  const status = useStatusBinance();
  const avisos = status.data?.contas.find((s) => s.rede === rede)?.avisos ?? [];
  if (avisos.length === 0) return null;
  return (
    <span className="chave__avisos">
      {avisos.map((a) => (
        <span key={a} className={/^(BLOQUEADA|ATENÇÃO)/.test(a) ? "formulario__erro" : "apagado"}>
          {a}
        </span>
      ))}
    </span>
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
      <DoisFatores />
      <div className="grade-dupla">
        <Painel titulo="Chaves cadastradas" id="titulo-chaves" icone={KeyRound}>
          {contas.isPending ? <Esqueleto forma="lista" linhas={2} rotulo="Carregando chaves" /> : null}
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
              <li key={c.id} className="chave">
                <span className="chave__icone" aria-hidden="true">
                  <KeyRound size={16} />
                </span>
                <span className="chave__textos">
                  <span className="chave__nome">
                    Binance <span className="num apagado">{c.apiKeyFinal}</span>
                    <Selo tom={REDE[c.rede].tom}>{REDE[c.rede].texto}</Selo>
                  </span>
                  <span className="chave__meta">desde {formatarData(c.criadaEm)}</span>
                  <AvisosDaChave rede={c.rede} />
                </span>
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
        <Painel titulo="Cadastrar chave da Binance" id="titulo-cadastrar" icone={Plus}>
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

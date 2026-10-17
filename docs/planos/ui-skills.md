# Plano: interface mais clara na primeira vez, nas telas cheias e no teclado

**Objetivo.** Quem acabou de instalar o ZenTrade abre telas vazias e não sabe por onde começar. Quem já usa precisa ver primeiro o que pede ação. Este passe cria um "Comece aqui" com progresso tirado dos dados, faz cada tela vazia apontar o próximo passo, põe o que pede ação no topo das telas cheias, dá desfazer às ações reversíveis, acerta a consistência visual e acrescenta uma paleta de comandos.

**Arquitetura.** Tudo no `apps/web`. O progresso do "Comece aqui" é uma função pura (`lib/primeirosPassos.ts`) que lê sessão, chaves, estratégias, backtests, robôs, documentos e a config pública; o componente só desenha. O exemplo ganha um modo vazio (`?vazio=1`) que imita uma instalação nova, sem tocar na API. A paleta de comandos e a ajuda de atalhos chegam sob demanda (`lazy`): a casca só carrega o ouvinte de teclas.

**Base técnica.** React 19, TanStack Router/Query, Motion, Vitest + Testing Library + axe-core. Sem dependência nova.

**Origem.** Pedido do dono: "verificar a interface melhorando ela com ECC, superpowers e ui-ux-pro-max", com as cinco frentes da tarefa (primeira vez, hierarquia, microinterações, consistência, teclado).

**Restrições globais.**

- Não mexer em `paginas/conhecimento/**` (outro agente), `index.html`, `public/**`, `layout/RodapeLegal.tsx` nem `/privacidade`.
- JS inicial hoje: 185 kB gzip. Não pode subir de forma relevante; o que é novo e pesado entra por `lazy`.
- axe e todos os testes verdes; textos em português do Brasil, sem travessão no meio da frase, sem conselho de investimento, sem euforia (nada de confete).
- Ctrl/Cmd+K já é a busca do assistente e Ctrl/Cmd+Shift+O é conversa nova: a paleta usa Ctrl/Cmd+Shift+P e "/".

## Brainstorm (o que foi considerado e decidido)

O dono deu a direção por escrito e pediu que o trabalho seguisse sem perguntas; as decisões abaixo ficam registradas como padrões que ele pode recusar.

| Pergunta                             | Opções                                                          | Decisão e porquê                                                                                                                                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onde o 2FA é ligado?                 | Só pela API (hoje); tela nova; painel em Contas e chaves        | **Painel em "Contas e chaves".** A API já tem `POST /sessao/2fa` e `/ativar`, mas a tela não; o primeiro passo do "Comece aqui" levaria a lugar nenhum. Sem QR (exigiria biblioteca): chave para digitar no app e link `otpauth://`. |
| Como saber se o passo está feito?    | Marcar à mão; derivar dos dados                                 | **Derivar dos dados.** Nada de caixa que a pessoa marca sem ter feito. Enquanto algum dado carrega, a lista não aparece (sem piscar).                                                                                                |
| "Chave de testnet sem saque"         | Conferir permissões; aceitar qualquer chave testnet             | Feito quando existe chave **testnet**. O formulário já exige marcar "sem saque" e a API recusa saque na rede real.                                                                                                                   |
| "Rodar um backtest e ler o veredito" | Backtest concluído; backtest aberto                             | Feito com um backtest **concluído**; o link abre a tela de Backtests, onde o veredito vem primeiro.                                                                                                                                  |
| "Ligar um robô em papel"             | Qualquer robô; robô de papel ativo                              | Feito com robô na rede **papel** e não pausado.                                                                                                                                                                                      |
| Controlador LGPD (só quem opera)     | Esconder sempre; passo obrigatório; passo opcional "quem opera" | **Passo opcional à parte**, com o nome das variáveis. Não há papel de "operador" no usuário, então o texto fala com quem opera e não conta no progresso.                                                                             |
| Depois de completo                   | Comemorar; sumir                                                | **Sumir.** Calmo: some quando tudo está feito. "Ocultar" também some, com Desfazer, e a paleta reabre.                                                                                                                               |
| Undo em quê                          | Tudo; só o que é reversível de verdade                          | **Só o reversível:** pausar/retomar e trocar o modo do robô, ocultar o "Comece aqui". Aprovar decisão manda ordem: sem desfazer. Desfazer nunca liga o automático (esse passa sempre pelo diálogo).                                  |
| Otimista em quê                      | Toda escrita; só o que deixa mais seguro                        | **Só na direção segura** (pausar, ir para observar/sugerir). Mostrar "retomado" antes da confirmação seria mentir sobre dinheiro.                                                                                                    |
| Hierarquia da Visão geral            | Manter; o que pede ação primeiro                                | **Ação primeiro:** parada total e "Aguardando você" antes dos números; a decisão pendente não se repete em "Últimas decisões".                                                                                                       |
| Hierarquia de Risco                  | Manter; estado antes de configuração                            | **Estado antes de configuração:** avisos sobem para logo depois das divergências; o formulário de limites desce.                                                                                                                     |

## Foco da revisão (falhas que o pedido implica e um teste precisa pegar)

1. Lista aparecendo e sumindo enquanto os dados chegam (passos "não feitos" por estarem carregando).
2. Passo do LGPD contando no progresso de quem não opera a instância.
3. Desfazer religando o modo automático sem o diálogo de confirmação.
4. Atalho "/" ou "?" disparando dentro de um campo de texto (roubando a digitação).
5. Paleta entrando no JS inicial e aumentando os 185 kB.

## Checklist de consistência (design-system + make-interfaces-feel-better)

- Tamanho de fonte só por token (`--t-*`); nada abaixo de 11 px.
- Raio só por token (`--raio-p/--raio/--raio-g/--raio-pilula`) onde o valor bate.
- Ícones na escala 12/14/16/18/20+ (sem 13, 15, 17).
- Títulos curtos com `text-wrap: balance`; descrições com `pretty`.
- Números que mudam com `tabular-nums` (já vale pela fonte mono).
- Dinheiro e datas só por `lib/formatar` e `lib/tempo`; nada de `toLocaleString` solto para R$.
- Botões: um primário por área; destrutivo em `perigo`, separado.

## Tarefas

### 1. Exemplo vazio (`?vazio=1`)

- **Arquivos:** `src/demo/estado.ts`, `src/demo/fonteDemo.ts`, `src/demo/vazio.ts` (novo), `src/main.tsx`, `src/demo/fonteDemo.test.ts`, `src/demo/vazio.test.ts`.
- **Interfaces:** `OpcoesDemo.vazio?: boolean`; `estadoVazioDemo(agora): EstadoDemo`; `lerModoVazio(busca: string, armazenamento?: Storage): boolean` (`?vazio=1` liga e guarda na aba, `?vazio=0` desliga).
- [ ] Teste: fonte vazia devolve listas vazias, resumo zerado e sessão sem 2FA. Rodar: falha.
- [ ] Teste: `lerModoVazio` liga, lembra e desliga. Rodar: falha.
- [ ] Implementar; rodar: passa. Commit `feat(web): exemplo vazio para ver a primeira vez`.

### 2. Ligar o 2FA pela tela

- **Arquivos:** `src/api/fonte.ts`, `src/api/fonteApi.ts`, `src/demo/fonteDemo.ts`, `src/ganchos/mutacoes.ts`, `src/paginas/contas/DoisFatores.tsx` (novo), `src/paginas/Contas.tsx`, testes.
- **Interfaces:** `Fonte.iniciarDoisFatores(): Promise<{ segredo: string; uri: string }>`; `Fonte.ativarDoisFatores(codigo: string): Promise<void>`; `useIniciarDoisFatores()`, `useAtivarDoisFatores()` (ao ativar, a sessão em cache passa a `doisFatores: true`).
- [ ] Teste da API: `POST /sessao/2fa` e `POST /sessao/2fa/ativar` com `{ codigo }`. Falha.
- [ ] Teste do exemplo: ativar com 6 dígitos liga o 2FA; código errado dá erro claro. Falha.
- [ ] Teste do painel: sem 2FA mostra "Ligar"; depois de gerar, mostra a chave e pede o código; ativado mostra "Ligado"; axe sem violações. Falha.
- [ ] Implementar; passa. Commit `feat(web): ligar o 2FA pela tela de contas`.

### 3. Progresso do "Comece aqui"

- **Arquivos:** `src/lib/primeirosPassos.ts`, `src/lib/primeirosPassos.test.ts`.
- **Interfaces:** `derivarPassos(d: DadosPassos): ResultadoPassos | null` (null enquanto carrega); `Passo { id, titulo, descricao, para, feito, opcional }`; `ResultadoPassos { passos, feitos, total, proximo, completo, operador }`.
- [ ] Testes: instalação nova = 0 de 6 e próximo é o 2FA; cada dado marca o passo certo; robô pausado ou testnet não conta como "papel"; backtest só concluído conta; LGPD fica em `operador`, fora do total; carregando = null. Falha.
- [ ] Implementar; passa.

### 4. "Comece aqui" na Visão geral

- **Arquivos:** `src/paginas/visao/ComeceAqui.tsx`, `src/paginas/visao/useComeceAqui.ts`, `src/estilos/primeiros-passos.css`, `src/paginas/VisaoGeral.tsx`, testes + axe.
- **Interfaces:** `ocultarComeceAqui(usuarioId)`, `mostrarComeceAqui(usuarioId)` (armazenamento local por pessoa).
- [ ] Teste: mostra "0 de 6", o próximo passo com botão primário e os outros como link; passo feito tem check e texto "feito"; "Ocultar" some e oferece Desfazer; completo não renderiza; axe. Falha.
- [ ] Implementar; passa. Commit `feat(web): comece aqui com progresso tirado dos dados`.

### 5. Telas vazias que levam ao próximo passo

- **Arquivos:** `VisaoGeral.tsx`, `Robos.tsx`, `Estrategias.tsx`, `Backtests.tsx`, `Decisoes.tsx`, `Ordens.tsx`, `aovivo/AoVivo.tsx`, `Contas.tsx`, `Tokens.tsx` e testes das telas.
- [ ] Teste por tela: sem estratégia, Robôs aponta para Estratégias; sem estratégia, Backtests aponta para Estratégias; sem robô, Decisões e Ao vivo apontam para Robôs. Falha.
- [ ] Implementar; passa; olhar as capturas do exemplo vazio. Commit `feat(web): telas vazias apontam o próximo passo`.

### 6. Hierarquia: o que pede ação primeiro

- **Arquivos:** `VisaoGeral.tsx`, `Risco.tsx`, testes.
- [ ] Teste: a decisão pendente aparece uma vez só na Visão geral e antes dos indicadores. Falha.
- [ ] Teste: em Risco, "Avisos" vem antes de "Limites da conta". Falha.
- [ ] Implementar; passa. Commit `refactor(web): o que pede ação vem primeiro`.

### 7. Avisos com ação (Desfazer) e robô otimista no sentido seguro

- **Arquivos:** `src/componentes/Avisos.tsx`, `src/estilos/feedback.css`, `src/ganchos/mutacoes.ts`, `src/paginas/Robos.tsx`, testes.
- **Interfaces:** `avisar(tom, texto, acao?: { rotulo: string; executar: () => void })`; `mudancaSegura(antes: RoboDTO, m: MudancaRobo): boolean`; `desfazerDe(antes, m): MudancaRobo | null` (nunca devolve `modo: "auto"`).
- [ ] Testes: aviso com ação mostra o botão, executa e fecha; passar o mouse ou focar segura o tempo; `mudancaSegura` e `desfazerDe` (auto nunca volta). Falha.
- [ ] Teste de Robôs: pausar mostra "Pausado" antes da resposta e "Desfazer" retoma. Falha.
- [ ] Implementar; passa. Commit `feat(web): desfazer nas ações do robô e avisos que esperam o mouse`.

### 8. Consistência

- **Arquivos:** CSS de `src/estilos/**`, `src/componentes/**`, `src/paginas/**` (menos `conhecimento`), ícones `.tsx`.
- [ ] Trocar valores exatos por tokens (fonte, raio); 10 px vira 11; ícones 13/15/17 viram 14/16/18; `text-wrap` em títulos e descrições; `reaisCurto` num lugar só.
- [ ] Testes, axe e capturas iguais ou melhores. Commit `style(web): tamanhos, raios e ícones pela escala`.

### 9. Paleta de comandos e atalhos

- **Arquivos:** `src/layout/comandos.ts` (+ teste), `src/layout/useAtalhosGlobais.ts` (+ teste), `src/layout/Paleta.tsx` (lazy, + teste com axe), `src/layout/AjudaAtalhos.tsx` (lazy), `src/layout/Casca.tsx`, `src/layout/BarraTopo.tsx`, `src/estilos/paleta.css`.
- **Interfaces:** `filtrarComandos(comandos, termo): Comando[]` (sem acento, por palavra, começo vale mais); `useAtalhosGlobais({ abrirPaleta, abrirAjuda, navegar })`: Ctrl/Cmd+Shift+P e "/" abrem a paleta, "?" a ajuda, "g" e uma letra navegam; nada dispara com foco em campo de texto.
- [ ] Testes de `filtrarComandos` e do gancho (inclui "não dispara no campo"). Falha.
- [ ] Teste da paleta: digitar filtra, setas mudam a opção ativa (`aria-activedescendant`), Enter navega, Esc fecha; axe. Falha.
- [ ] Implementar; conferir no build que a paleta é um pedaço à parte. Commit `feat(web): paleta de comandos e atalhos do teclado`.

### 10. Verificação antes de dizer que acabou

- [ ] `npx eslint apps/web`, `npx prettier --check apps/web docs`, `npx turbo run typecheck test build --filter=@zentrade/web`: saída lida, contagem de testes anotada.
- [ ] JS inicial (gzip) medido no `dist` e comparado com 185 kB.
- [ ] Capturas depois (1440×900 e 390×844, escuro e claro), incluindo o "Comece aqui" no exemplo vazio.

# ADR 008 — Conectar o Claude de cada pessoa pelo CLI oficial, sem reimplementar o OAuth

**Situação:** aceita · 2026-10

## Contexto

O provedor "cli" (o Claude Code pelo plano da pessoa) dependia de um login feito **no servidor**: quem opera entrava no container do agente e rodava `claude` → `/login` numa pasta por conta (`AGENTE_CLAUDE_CONTAS`). Com várias pessoas na mesma instância, isso não escala e obriga alguém a abrir terminal para cada uma — e quem opera acaba vendo o login dos outros.

O Claude Code tem um caminho oficial para isso: `claude setup-token` abre a autorização da Anthropic no navegador e imprime um token de longa duração (1 ano, Pro/Max/Team/Enterprise, só chamadas ao modelo), usado pela variável `CLAUDE_CODE_OAUTH_TOKEN`. `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` passam na frente dele, e o modo `--bare` não o lê.

O dono pediu que **ninguém** rode comando nenhum: cada pessoa conecta a própria conta na tela.

## Decisão

**O agente roda o `claude setup-token` oficial por ela, e o ZenTrade não reimplementa o cliente OAuth da Anthropic.**

- `POST /assistente/claude-token/conexao` (sessão, 2FA, reautenticação; 5 por hora por pessoa) pede ao agente uma conexão. O agente roda o CLI num pseudo-terminal (`script -qfec` do util-linux; sem módulo nativo como node-pty, que complicaria a imagem Alpine), com um `CLAUDE_CONFIG_DIR` novo e vazio e sem `ANTHROPIC_*` nem os segredos do ZenTrade no ambiente.
- O agente lê o link de autorização da tela do CLI (sem cores) e só o devolve se for `https` num domínio da Anthropic (claude.ai, claude.com, anthropic.com); senão aborta. Nada mais da saída do CLI sai do agente.
- A pessoa autoriza na página da Anthropic e cola o código (`POST …/conexao/:id/codigo`). O agente o escreve no terminal (só letras, números e `# - _ . ~`), espera o token pelo formato (`sk-ant-oat…`), grava **cifrado** em `credenciais_claude` e encerra o processo e a pasta. O token não passa pela API nem pela tela.
- Uma conexão viva por pessoa, só na memória do agente, conferida pelo `usuarioId` da sessão a cada passo; vence em 10 minutos.
- Quem preferir roda `claude setup-token` no próprio computador e cola o token (`PUT /assistente/claude-token`).
- Ao usar: o token da pessoa vem **antes** das contas do servidor; o CLI roda com `CLAUDE_CODE_OAUTH_TOKEN`, um `CLAUDE_CONFIG_DIR` novo por execução e sem `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`. Sem token, as contas de `AGENTE_CLAUDE_CONTAS`, como antes.
- A decifração fica no agente (ele já lê o banco sob RLS): a `ZENTRADE_CHAVE_MESTRA` passa a ir também para o agente.

## Por que não reimplementar o OAuth

- O fluxo (PKCE, client id, escopos, endpoints, troca e renovação) é da Anthropic e muda com o CLI. Copiar o client id do Claude Code e falar com os endpoints direto seria se passar pelo CLI, sem garantia de que continua permitido nem de que continua funcionando.
- O CLI oficial é a interface suportada e documentada para gerar o token; atualizar a imagem do agente acompanha qualquer mudança.
- O ZenTrade continua sem guardar nada do OAuth além do token final, que a própria Anthropic entrega para ser usado por variável de ambiente.

## Consequências

- O agente precisa do `script` (pacote `util-linux-misc` no Alpine) e da chave mestra. Sem o `script`, a conexão pelo botão some e fica a opção de colar; sem a chave mestra, o painel diz que o servidor não usa o Claude de cada pessoa.
- A tela do `setup-token` é de um programa de terceiros: se a Anthropic mudar o texto ou o formato do link, o agente para de achar o link ou o token e a conexão falha com mensagem clara (nunca com o conteúdo da tela). O teste usa um CLI falso; conferir com o CLI de verdade é passo manual a cada atualização da imagem.
- Remover o token no ZenTrade não o revoga na Anthropic; a tela lembra a pessoa de revogar lá também.
- O plano continua pessoal: cada pessoa conecta a própria conta (termos da Anthropic). Para atender muita gente de forma automatizada, a API segue sendo o caminho.

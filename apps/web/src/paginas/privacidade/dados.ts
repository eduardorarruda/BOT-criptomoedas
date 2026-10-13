/**
 * O conteúdo da política de privacidade que é lista ou tabela. Cada item foi conferido
 * no código (banco, API, agente, n8n e tela) em outubro de 2026; ao mudar um fluxo de
 * dados, mude aqui também. O texto corrido fica em ConteudoPrivacidade.tsx.
 */
export const ATUALIZADA_EM = "12 de outubro de 2026";
export const ATUALIZADA_EM_ISO = "2026-10-12";

export interface Secao {
  readonly id: string;
  readonly titulo: string;
}

/** O sumário e a ordem das seções. */
export const SECOES: readonly Secao[] = [
  { id: "resumo", titulo: "Em poucas palavras" },
  { id: "controlador", titulo: "Quem cuida dos seus dados" },
  { id: "dados", titulo: "Quais dados são tratados" },
  { id: "finalidades", titulo: "Para que e com qual base legal" },
  { id: "compartilhamento", titulo: "Com quem os dados são compartilhados" },
  { id: "internacional", titulo: "Transferência para fora do Brasil" },
  { id: "retencao", titulo: "Por quanto tempo os dados ficam guardados" },
  { id: "direitos", titulo: "Seus direitos e como exercê-los" },
  { id: "seguranca", titulo: "Como os dados são protegidos" },
  { id: "cookies", titulo: "Cookies e armazenamento no navegador" },
  { id: "criancas", titulo: "Crianças e adolescentes" },
  { id: "mudancas", titulo: "Mudanças nesta política" },
  { id: "perguntas", titulo: "Perguntas frequentes" },
];

export interface Item {
  readonly titulo: string;
  readonly texto: string;
}

export const DADOS: readonly Item[] = [
  {
    titulo: "Conta",
    texto:
      "Nome, e-mail, a senha guardada só como hash (Argon2id, nunca a senha em si), o segredo do autenticador (2FA) cifrado e se o 2FA está ligado. Não há cadastro aberto: quem opera a instância cria cada conta.",
  },
  {
    titulo: "Sessão",
    texto:
      "Um código de sessão (guardado só como hash), um código contra CSRF e os horários de entrada, de expiração e da última confirmação de identidade. A sessão não guarda seu endereço IP nem o seu navegador.",
  },
  {
    titulo: "Registros técnicos do servidor",
    texto:
      "Para cada pedido à API, o servidor registra método, caminho, código de resposta, tempo e o endereço IP de origem que ele enxerga. Senhas, chaves, tokens, cookies e códigos são ocultados antes de gravar. O corpo dos pedidos e o navegador não são registrados.",
  },
  {
    titulo: "Trilha de auditoria",
    texto:
      "Data e tipo de cada ação sensível: entrar (e tentativas recusadas), sair, confirmar identidade, ligar o 2FA, criar ou remover tokens e chaves de corretora, conectar banco, mudar robôs, estratégias, limites e a parada total, aprovar ou recusar decisões e aceitar divergências. Quando há aprovação, fica registrado por quem: o seu e-mail (pela tela), o número do token ou o usuário do Telegram. Sem IP.",
  },
  {
    titulo: "Chaves de API da corretora",
    texto:
      "A chave e o segredo da Binance que você cadastra, cifrados (AES-256-GCM). A tela mostra só os 4 últimos caracteres e a API nunca devolve a chave.",
  },
  {
    titulo: "Tokens de API",
    texto:
      "Nome, escopo (leitura ou operar), quando foi criado e o último uso. O token em si fica guardado só como hash.",
  },
  {
    titulo: "Operações",
    texto:
      "Estratégias, robôs, sinais, decisões (com a proposta da IA, a avaliação do risco e o custo da análise), ordens, execuções, proteções na corretora, backtests e, da sua carteira na Binance, negociações e saldos importados.",
  },
  {
    titulo: "Renda fixa",
    texto:
      "Títulos lançados à mão ou trazidos pelo Open Finance: tipo, nome, emissor e CNPJ do emissor, indexador, taxas, datas, valores aplicados e brutos ou líquidos, IR e IOF.",
  },
  {
    titulo: "Open Finance (Pluggy)",
    texto:
      "Da conexão com o seu banco: a instituição, a situação, a validade do consentimento e os investimentos. Contas correntes e transações não são buscadas. A senha do banco você digita na janela da própria Pluggy; o ZenTrade não a vê.",
  },
  {
    titulo: "Investimentos imobiliários",
    texto:
      "Imóveis e fundos imobiliários, financiamentos (valor, taxa, prazo, seguros), lançamentos de receitas e despesas e as observações que você escrever.",
  },
  {
    titulo: "Base de conhecimento",
    texto:
      "Notas, o texto extraído dos arquivos que você envia (o arquivo original não é guardado), páginas de links que você adiciona e notícias, divididos em trechos com seus vetores de busca (embeddings).",
  },
  {
    titulo: "Conversas com o assistente",
    texto:
      "O texto das suas perguntas e das respostas, as fontes e ferramentas usadas, o provedor e o modelo de IA.",
  },
  {
    titulo: "Uso e custo de IA",
    texto:
      "Data, origem (análise de robô ou assistente) e custo de cada chamada, para o orçamento de IA da conta.",
  },
  {
    titulo: "Avisos e alertas",
    texto: "Título e mensagem de cada aviso, se foi enviado ao Telegram ou e-mail e quando você leu.",
  },
  {
    titulo: "Preferências no navegador",
    texto:
      "Tema, menu recolhido, visões salvas dos filtros e afins ficam só no seu navegador (veja Cookies e armazenamento no navegador).",
  },
];

export interface Finalidade {
  readonly finalidade: string;
  readonly base: string;
}

export const FINALIDADES: readonly Finalidade[] = [
  {
    finalidade:
      "Criar e manter sua conta, autenticar você (senha, 2FA, sessão) e confirmar sua identidade antes de ações sensíveis.",
    base: "Execução de contrato ou de procedimentos a seu pedido (art. 7º, V).",
  },
  {
    finalidade:
      "Operar os robôs que você configura: enviar ordens, manter o stop na corretora, importar sua carteira e conferir a posição com o saldo.",
    base: "Execução de contrato ou de procedimentos a seu pedido (art. 7º, V).",
  },
  {
    finalidade:
      "Acompanhar renda fixa, imóveis e o patrimônio consolidado, com índices públicos do Banco Central e cotações da B3.",
    base: "Execução de contrato ou de procedimentos a seu pedido (art. 7º, V).",
  },
  {
    finalidade: "Conectar seu banco pelo Open Finance (Pluggy) para trazer seus investimentos.",
    base: "Consentimento (art. 7º, I), dado no fluxo da Pluggy e da sua instituição, que você pode revogar a qualquer momento.",
  },
  {
    finalidade:
      "Analisar sinais com IA, responder no assistente e buscar na base de conhecimento, quando você usa esses recursos.",
    base: "Execução de contrato ou de procedimentos a seu pedido (art. 7º, V).",
  },
  {
    finalidade:
      "Avisar sobre stops, perdas, pausas, divergências e propostas para aprovar, pelo Telegram ou e-mail.",
    base: "Execução de contrato (art. 7º, V) e legítimo interesse em avisar rápido sobre riscos à sua conta (art. 7º, IX).",
  },
  {
    finalidade:
      "Proteger a instância: trilha de auditoria, registros técnicos, limite de tentativas, investigação de incidentes e defesa em processos.",
    base: "Legítimo interesse (art. 7º, IX) e exercício regular de direitos (art. 7º, VI).",
  },
  {
    finalidade: "Atender a uma ordem judicial ou a um pedido de autoridade com base legal.",
    base: "Cumprimento de obrigação legal ou regulatória (art. 7º, II), só quando houver.",
  },
];

export interface Compartilhamento {
  readonly quem: string;
  readonly onde: string;
  readonly quando: string;
  readonly oQue: string;
}

export const COMPARTILHAMENTOS: readonly Compartilhamento[] = [
  {
    quem: "Binance",
    onde: "Exterior",
    quando: "Se você cadastra uma chave de API.",
    oQue: "Sua chave de API e os pedidos assinados com ela: ordens, consulta de saldo, negociações e permissões da chave. Dados de mercado são públicos.",
  },
  {
    quem: "Pluggy (Open Finance)",
    onde: "Brasil",
    quando: "Se você conecta um banco em Renda fixa.",
    oQue: "Um identificador interno seu (não o nome nem o e-mail) para abrir a conexão. A janela da Pluggy é carregada do site dela no seu navegador; as credenciais do banco vão direto para ela, que devolve os investimentos.",
  },
  {
    quem: "Anthropic (IA, pela API)",
    onde: "Estados Unidos",
    quando: "Se o assistente ou a análise usam a API da Anthropic.",
    oQue: "Sua pergunta, até 40 mensagens anteriores da conversa e o que as ferramentas de leitura buscam nos seus dados (resumo da conta, robôs, decisões, ordens, conhecimento, carteira, renda fixa e imóveis). Nas análises dos robôs, dados de mercado, posição, orçamento e histórico de decisões. Nome, e-mail e identificador não são enviados.",
  },
  {
    quem: "Anthropic (IA, pelo Claude Code)",
    onde: "Estados Unidos",
    quando: "Se o assistente usa o Claude Code de uma conta de plano.",
    oQue: "O mesmo conteúdo da linha acima, sob os termos da conta do plano que fez o login no Claude Code (a sua ou a de quem opera a instância). A sessão não é guardada pelo Claude Code.",
  },
  {
    quem: "Voyage AI (busca semântica)",
    onde: "Estados Unidos",
    quando: "Se a instância usa a Voyage para a base de conhecimento.",
    oQue: "O texto dos trechos da base de conhecimento e das buscas, para calcular os vetores. Com o Ollama, que roda no próprio servidor, nada disso sai.",
  },
  {
    quem: "Telegram e e-mail (pelo n8n)",
    onde: "Exterior (Telegram) e o servidor de e-mail configurado",
    quando: "Se quem opera configura alertas.",
    oQue: "Alertas (nome do robô, ativo, preços e quantidades), propostas para aprovar (com um resumo de até 1.000 caracteres) e o relatório diário (resultados, decisões, ordens, taxas e custo de IA). Numa instância com várias pessoas, todos os alertas vão para o mesmo chat. Quem aprova pelo Telegram tem o nome de usuário registrado.",
  },
  {
    quem: "Banco Central e brapi.dev (cotações da B3)",
    onde: "Brasil",
    quando: "Ao atualizar índices e cotações.",
    oQue: "Só códigos de séries e datas (Banco Central) e os códigos dos fundos imobiliários da carteira (brapi.dev). Nenhum dado que identifique você.",
  },
  {
    quem: "Sites que você adiciona à base de conhecimento",
    onde: "Onde o site estiver",
    quando: "Quando você adiciona um link.",
    oQue: "O servidor baixa a página; o site vê o endereço do servidor, não o seu.",
  },
  {
    quem: "Quem hospeda o servidor",
    onde: "Onde quem opera escolher",
    quando: "Se a instância roda num servidor alugado ou na nuvem.",
    oQue: "Os dados ficam guardados na infraestrutura dele, como operador.",
  },
];

export interface Retencao {
  readonly dado: string;
  readonly prazo: string;
}

export const RETENCOES: readonly Retencao[] = [
  { dado: "Sessão e cookies", prazo: "12 horas; sessões vencidas são apagadas a cada hora." },
  { dado: "Histórico ao vivo dos robôs", prazo: "24 horas." },
  {
    dado: "Conversas, documentos do conhecimento, renda fixa, imóveis, chaves e tokens",
    prazo: "Até você apagar na tela.",
  },
  {
    dado: "Conexão com o banco (Pluggy)",
    prazo:
      "Até você desconectar na tela. Isso apaga a conexão no ZenTrade; para encerrar também na Pluggy e no banco, revogue o consentimento lá.",
  },
  {
    dado: "Conta, robôs, estratégias, decisões, ordens, backtests, carteira, avisos e custos de IA",
    prazo: "Enquanto a conta existir. Não há apagamento automático.",
  },
  {
    dado: "Trilha de auditoria",
    prazo:
      "Enquanto a instância existir. Por segurança, o sistema não deixa alterar nem apagar esses registros; eles servem para proteger a instância e defender direitos (art. 7º, VI e IX) e não são compartilhados.",
  },
  {
    dado: "Registros técnicos do servidor e cópias de segurança",
    prazo: "Conforme a configuração de quem opera (rotação de logs e prazo dos backups).",
  },
];

export interface Armazenamento {
  readonly nome: string;
  readonly tipo: string;
  readonly paraQue: string;
}

export const ARMAZENAMENTOS: readonly Armazenamento[] = [
  {
    nome: "zt_sessao",
    tipo: "Cookie HttpOnly, SameSite=Strict, Secure por padrão, 12 h",
    paraQue: "Manter você conectado. A página não consegue lê-lo.",
  },
  {
    nome: "zt_csrf",
    tipo: "Cookie SameSite=Strict, Secure por padrão, 12 h",
    paraQue:
      "Proteger contra pedidos forjados por outros sites (CSRF). A página lê este para mandá-lo de volta.",
  },
  { nome: "zentrade:tema", tipo: "localStorage", paraQue: "Tema claro ou escuro." },
  { nome: "zentrade:menu-recolhido", tipo: "localStorage", paraQue: "Menu lateral recolhido." },
  {
    nome: "zentrade:assistente:barra",
    tipo: "localStorage",
    paraQue: "Gaveta do assistente aberta ou fechada.",
  },
  { nome: "zentrade:visoes:…", tipo: "localStorage", paraQue: "Visões salvas dos filtros de cada tela." },
  {
    nome: "zentrade.imobiliario.cdi",
    tipo: "localStorage",
    paraQue: "CDI usado nas comparações dos simuladores.",
  },
  { nome: "zentrade:abertura", tipo: "sessionStorage", paraQue: "Não repetir a animação de abertura." },
  {
    nome: "zentrade:demo:sessao",
    tipo: "sessionStorage",
    paraQue: "Só no modo de exemplo: lembrar que você entrou.",
  },
];

export const DIREITOS: readonly string[] = [
  "confirmar se tratamos dados seus e acessá-los;",
  "corrigir dados incompletos, inexatos ou desatualizados;",
  "pedir anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;",
  "receber seus dados em formato estruturado (portabilidade);",
  "pedir a eliminação dos dados tratados com base no consentimento;",
  "saber com quem seus dados foram compartilhados;",
  "saber que pode não dar o consentimento e o que acontece se não der;",
  "revogar o consentimento;",
  "pedir revisão de decisões tomadas só com base em tratamento automatizado (art. 20);",
  "reclamar à Autoridade Nacional de Proteção de Dados (ANPD).",
];

export const PERGUNTAS: readonly Item[] = [
  {
    titulo: "O projeto ZenTrade recebe os meus dados?",
    texto:
      "Não. O ZenTrade é um software livre que cada pessoa ou organização instala no próprio servidor. Os dados ficam no banco dessa instalação; os autores do projeto não recebem nada, e o software não tem telemetria.",
  },
  {
    titulo: "O ZenTrade usa cookies de rastreamento ou de publicidade?",
    texto:
      "Não. Há só dois cookies, de sessão e de proteção contra CSRF, necessários para o login funcionar. Não há análise de audiência, publicidade nem cookies de terceiros fora da janela da Pluggy, quando você conecta um banco.",
  },
  {
    titulo: "A IA vê os meus dados?",
    texto:
      "Só quando você usa o assistente ou um robô pede análise. Nesses momentos, o que for preciso para responder vai ao provedor de IA configurado, sem seu nome nem e-mail. A IA só lê: ela nunca envia ordens.",
  },
  {
    titulo: "Como apago a minha conta?",
    texto:
      "Peça pelo contato de quem opera a instância, no início desta política. Conversas, documentos, chaves, tokens, renda fixa e imóveis você mesmo apaga na tela.",
  },
];

/**
 * JSON-LD da página: a política como WebPage e as perguntas frequentes como FAQPage.
 * Só na página própria (o diálogo não é página e não vai para buscador).
 */
export function dadosEstruturadosPrivacidade(urlPagina?: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        ...(urlPagina ? { "@id": urlPagina, url: urlPagina } : {}),
        name: "Política de privacidade do ZenTrade",
        inLanguage: "pt-BR",
        dateModified: ATUALIZADA_EM_ISO,
        about: "Tratamento de dados pessoais pela LGPD (Lei nº 13.709/2018)",
      },
      {
        "@type": "FAQPage",
        inLanguage: "pt-BR",
        mainEntity: PERGUNTAS.map((p) => ({
          "@type": "Question",
          name: p.titulo,
          acceptedAnswer: { "@type": "Answer", text: p.texto },
        })),
      },
    ],
  };
}

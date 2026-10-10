# Jobs Scraper: brief do frontend web

Brief para desenhar o frontend web do **Jobs Scraper**. Hoje as vagas chegam só por um bot do Discord; a ideia é o site ser **mais um canal** que recebe as mesmas vagas e, além disso, oferecer o que o Discord não oferece bem: busca e filtros no histórico, acompanhamento das coletas e edição das configurações.

> Tudo que está aqui existe no backend, exceto o que está marcado como **(proposta)**. Não invente campos de dados: se uma informação não está nos modelos abaixo, ela não existe.

---

## 1. O produto em uma frase

Ferramenta pessoal (um único usuário, sem login de múltiplas contas) que coleta posts de vagas no LinkedIn, usa IA local para transformar cada post em uma vaga estruturada e gera, sob demanda, um **currículo em PDF ajustado para cada vaga**.

- **Público:** a própria pessoa dona do sistema, desenvolvedora front-end procurando vaga.
- **Idioma da interface:** português do Brasil.
- **Tom:** ferramenta de trabalho, objetiva. Prioridade é escanear muitas vagas rápido e agir (abrir o post, copiar o contato, gerar o currículo).
- **Plataformas:** desktop primeiro, mas precisa funcionar bem no celular (ver vagas e gerar currículo pelo celular é um caso comum).
- **Temas:** claro e escuro.

## 2. Como o sistema funciona (contexto)

```
LinkedIn → scraper → IA (extração) → banco → evento "vaga publicada" → canais (Discord, site)
                                                                          ↓
                                                         pedido de currículo → gerador de CV → PDF volta para o canal
```

1. **Coleta:** o scraper busca posts no LinkedIn por termos de busca (ex.: "Front End Vue"), periodicamente ou quando pedido ("coletar agora").
2. **Filtros:** posts em idioma não aceito, com baixa confiança da IA ou sem as palavras-chave relevantes são descartados.
3. **Vaga:** o que sobra vira uma vaga estruturada, salva uma única vez (sem duplicatas).
4. **Publicação:** cada vaga nova é anunciada para todos os canais ligados. O site receberia em tempo real.
5. **Currículo:** em qualquer vaga, o usuário pode pedir um currículo ajustado. Ele leva de alguns segundos a ~1 minuto para ficar pronto (IA + compilação LaTeX) e volta como PDF de uma página.

## 3. Dados

### 3.1 Vaga (`Job`)

| Campo                 | Tipo                                           | Observações para a interface                                                                               |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `postId`              | string                                         | Identificador único. Não exibir.                                                                           |
| `title`               | string                                         | Cargo. Sempre presente nas vagas salvas.                                                                   |
| `company`             | string \| null                                 | Empresa. Pode faltar (posts de recrutadores frequentemente omitem).                                         |
| `location`            | string \| null                                 | Cidade/estado. Pode faltar.                                                                                |
| `workMode`            | `"remoto"` \| `"hibrido"` \| `"presencial"` \| null | Modalidade. Exibir como "Remoto", "Híbrido", "Presencial".                                                 |
| `necessary_knowledge` | string[] \| null                               | Tecnologias pedidas (ex.: `["Vue.js", "TypeScript", "Tailwind"]`). Normalmente 3 a 12 itens.                |
| `link`                | string \| null                                 | URL do post original no LinkedIn.                                                                          |
| `recruiter_email`     | string \| null                                 | E-mail para candidatura. **Toda vaga tem `link` ou `recruiter_email` (ou os dois).**                       |
| `author`              | string \| null                                 | Quem publicou o post (nome da pessoa no LinkedIn).                                                         |
| `postedAt`            | data ISO \| null                               | Quando o post foi publicado. Exibir relativo ("há 3 horas").                                               |
| `createdAt`           | data ISO                                       | Quando a vaga entrou no sistema. Sempre presente.                                                          |
| `aiJobConfidence`     | número 0–100                                   | Confiança da IA de que o post é uma vaga. Na prática fica entre 60 e 100 (abaixo disso é descartado).     |
| `language`            | string \| null                                 | Idioma do post, código ISO ("pt", "en").                                                                   |
| `rawContent`          | string                                         | Texto completo do post original. Pode ser longo (até ~3.000 caracteres), com quebras de linha e emojis.    |

**Não existem** no backend: salário, nível (júnior/pleno/sênior), tipo de contrato (CLT/PJ), logo da empresa. Esses dados às vezes aparecem só dentro do `rawContent`.

Exemplo:

```json
{
	"postId": "a3f9c1e2...",
	"title": "Desenvolvedor(a) Front-end Pleno",
	"company": "Acme Tecnologia",
	"location": "São Paulo, SP",
	"workMode": "hibrido",
	"necessary_knowledge": ["Vue.js", "Nuxt", "TypeScript", "Tailwind CSS", "Testes unitários"],
	"link": "https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000000",
	"recruiter_email": "vagas@acme.com.br",
	"author": "Mariana Souza",
	"postedAt": "2026-10-09T13:20:00.000Z",
	"createdAt": "2026-10-09T15:02:11.000Z",
	"aiJobConfidence": 92,
	"language": "pt",
	"rawContent": "🚀 Estamos contratando!\n\nVaga: Desenvolvedor(a) Front-end Pleno\nModelo: híbrido (3x na semana em SP)\n\nRequisitos:\n- Vue 3 e Nuxt\n- TypeScript\n..."
}
```

### 3.2 Currículo ajustado (pedido e resultado)

- **Pedido:** só precisa da vaga (`postId`).
- **Resultado:** ou um PDF (`file.name`, ex.: `Curriculo-Acme-Tecnologia-Desenvolvedor-a-Front-end-Pleno.pdf`), ou uma mensagem de erro em texto (ex.: "Não encontrei essa vaga no banco de dados.", "O LaTeX do currículo não compilou. Veja os logs do cv-updater.").
- **Tempo:** de alguns segundos a ~1 minuto. Não existe progresso percentual, só "gerando" → "pronto" ou "falhou".
- O que o gerador ajusta (útil para explicar na interface): reescreve a apresentação para a vaga, coloca as tecnologias pedidas nas habilidades, escolhe os projetos do GitHub mais relevantes e reordena os bullets da experiência. Sempre cabe em uma página.

### 3.3 Coleta (`ScraperRun`), histórico dos últimos 90 dias

| Campo        | Tipo                                         | Observações                                                                 |
| ------------ | -------------------------------------------- | --------------------------------------------------------------------------- |
| `trigger`    | `"schedule"` \| `"manual"` \| `"once"`       | "Agendada", "Manual" (coletar agora) ou "Execução única".                    |
| `status`     | `"running"` \| `"success"` \| `"failed"`     | Em andamento, sucesso, falha.                                               |
| `startedAt`  | data                                         |                                                                             |
| `finishedAt` | data \| null                                 | Null enquanto está em andamento.                                            |
| `sent`       | número                                       | Total de posts enviados para a IA nessa coleta.                             |
| `terms`      | `{ term, sent, error }[]`                    | Resultado por termo de busca; um termo pode falhar e os outros não.         |
| `error`      | string \| null                               | Motivo da falha geral (ex.: "Login não concluído (...). O LinkedIn pediu verificação (captcha/2FA)...").         |

Uma coleta típica leva de 2 a 10 minutos. A **próxima coleta agendada** é `startedAt` da última + `intervalMinutes` (ver 3.4), a menos que as coletas estejam pausadas.

Atenção ao funil: `sent` é quantos posts foram para a IA, não quantas vagas viraram (muitos são descartados pelos filtros).

### 3.4 Configurações (editáveis)

**Coleta (scraper):**

| Campo             | Tipo / regras                                                                          | Padrão                 |
| ----------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| `searchTerms`     | lista de `{ term, enabled }`, 1 a 10 termos, até 100 caracteres, sem repetidos, ao menos 1 ativo | `Front End Vue` ativo  |
| `datePosted`      | `past-24h` \| `past-week` \| `past-month` \| `any` ("Últimas 24h", "Última semana"...) | `past-24h`             |
| `maxPostsPerRun`  | inteiro 1–200 (dividido entre os termos ativos)                                        | 50                     |
| `intervalMinutes` | inteiro de 1 a 10.080 (7 dias)                                                         | 240                    |
| `paused`          | booleano: pausa as coletas automáticas ("coletar agora" continua funcionando)          | false                  |

**Filtros das vagas (pós-processamento):**

| Campo              | Tipo / regras                                                                                      | Padrão |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------ |
| `minJobConfidence` | número 0–100: abaixo disso o post é descartado                                                     | 60     |
| `allowedLanguages` | lista de códigos de 2 letras (`pt`, `en`...), até 20; vazia aceita todos                           | `pt`   |
| `requiredKeywords` | até 50 palavras; a vaga precisa citar ao menos uma no cargo ou nas tecnologias; vazia desliga       | front-end, vue, react, typescript... |
| `excludedKeywords` | até 50 palavras; a vaga é descartada se citar alguma                                               | .net, asp.net, dotnet |

As mudanças valem na próxima coleta, sem reiniciar nada (o scraper relê a cada 30 s). Os filtros **não** reprocessam vagas antigas.

Comparação das palavras-chave (explicar em um texto de ajuda): por palavra inteira ("java" não pega "javascript"), ignorando maiúsculas, acentos, hífen e ".js" ("Vue.js" = "vue").

## 4. Telas e funcionalidades

### 4.1 Vagas (tela principal)

Lista das vagas, mais recentes primeiro, otimizada para escanear.

- **Card da vaga:** cargo (destaque), empresa · local, selo da modalidade, tempo relativo da publicação, chips de tecnologias (mostrar as primeiras e "+N"), indicação de que tem e-mail de contato.
- **Cor por modalidade** (já usada no Discord, pode ser mantida como acento): remoto verde `#2ECC71`, híbrido azul `#3498DB`, presencial laranja `#E67E22`, sem modalidade cinza `#95A5A6`.
- **Tempo real:** vagas novas chegam enquanto a tela está aberta. Não reordenar a lista sob o cursor: mostrar um aviso "3 vagas novas" que, ao clicar, as insere no topo. Marcar vagas ainda não vistas.
- **Busca textual** (cargo, empresa, tecnologias, texto do post).
- **Filtros:** modalidade (múltipla), tecnologias (múltipla, com contagem), período (24h, 7 dias, 30 dias, tudo), "tem e-mail de contato", idioma, confiança mínima.
- **Ações rápidas no card:** abrir post no LinkedIn, gerar currículo.
- **Estados:** carregando (skeleton), vazio sem vagas ainda ("Nenhuma vaga ainda. Rode uma coleta"), vazio por filtros ("Nenhuma vaga com esses filtros", com limpar filtros), erro de conexão.
- **Volume esperado:** de 5 a 50 vagas novas por dia; centenas a alguns milhares no histórico. Paginação ou scroll infinito.

### 4.2 Detalhe da vaga

Painel lateral no desktop, tela própria no celular.

- Todos os campos da vaga, com fallbacks para campos nulos (não mostrar rótulos vazios; título nunca falta).
- **Post original** (`rawContent`) com quebras de linha preservadas, recolhido por padrão se for longo.
- **Contato:** e-mail com botão de copiar, e um **modelo de mensagem** pronto para copiar:
  > Assunto: Candidatura – {cargo}
  >
  > Olá! Tudo bem?
  >
  > Vi a publicação sobre {cargo} no LinkedIn e tenho interesse na oportunidade. Envio em anexo meu currículo e fico à disposição para conversarmos.
  >
  > Obrigado!
- **Sem e-mail:** a ação principal vira "Ver post e se candidatar" (link) + "Gerar currículo".
- **Confiança da IA** discreta (ex.: rodapé "Confiança da IA: 92%"). Abaixo de ~75%, um aviso sutil "pode não ser uma vaga".

### 4.3 Gerar currículo

Fluxo assíncrono iniciado no card ou no detalhe.

1. Clique em "Gerar currículo" → estado **Gerando** (pode levar até ~1 min). O usuário pode continuar navegando: o progresso não pode depender de ficar na mesma tela (ex.: indicador global ou toast persistente).
2. **Pronto:** pré-visualizar o PDF e baixar. Mostrar a qual vaga ele pertence.
3. **Falhou:** mostrar a mensagem de erro recebida e permitir tentar de novo.
4. Vários pedidos podem estar em andamento ao mesmo tempo (vagas diferentes).
5. **(proposta)** Lista "Meus currículos" com os PDFs já gerados por vaga, para baixar de novo sem gerar outra vez.

### 4.4 Coletas

Acompanhar o scraper.

- **Status atual em destaque:** em andamento (com termos já processados e tempo decorrido) / ociosa com "próxima coleta em 1h 20min" / **pausada**.
- **Botão "Coletar agora"**, que funciona mesmo com as coletas pausadas. Desabilitar ou indicar fila se já houver coleta em andamento.
- **Histórico:** lista das coletas com gatilho, status, início, duração, posts enviados e detalhamento por termo (incluindo o erro de um termo específico).
- **Falha:** destacar a mensagem de erro. Falhas de login do LinkedIn exigem ação manual (resolver captcha/2FA), então mostrar como alerta que pede atenção, não como erro silencioso.

### 4.5 Configurações

Formulário com as duas seções da 3.4.

- **Termos de busca:** lista editável com toggle ativo/inativo, adicionar (até 10) e remover; validação de repetidos e de "ao menos um ativo".
- **Palavras-chave:** campos de chips (digitar e Enter), com texto de ajuda sobre a regra de comparação.
- **Confiança mínima:** slider 0–100 com o valor visível.
- **Idiomas:** seleção múltipla com nomes legíveis ("Português (pt)", "Inglês (en)").
- **Pausar coletas:** switch em destaque (também acessível pela tela de coletas).
- Validação inline com as regras da 3.4, botão salvar com estado de sucesso/erro, aviso de que as mudanças valem a partir da próxima coleta.

## 5. Integração com o backend (para orientar o design, não precisa ser desenhada)

O site entra no sistema como mais um canal, do mesmo jeito que o Discord:

- **Vagas novas em tempo real:** um serviço web (**proposta**) liga a própria fila `web` ao evento `job-published` e repassa cada vaga ao navegador via Server-Sent Events ou WebSocket.
- **Histórico de vagas:** lido da coleção `jobs` do MongoDB.
- **Currículo:** o serviço web publica um pedido na fila `cv-updater` com `replyTo` apontando para a fila `web-cv` e um identificador do pedido no `context`; o resultado volta nessa fila (PDF em base64 ou erro) e é repassado ao navegador.
- **Coletas:** leitura da coleção `scraper_runs`; "coletar agora" publica um comando `run-now` na fila `scraper`.
- **Configurações:** leitura e gravação pelas funções `loadSettings` / `updateSettings`, que validam com os mesmos schemas descritos na 3.4. Erros de validação voltam por campo.

Endpoints sugeridos **(proposta)**:

| Método e rota                     | Uso                                                       |
| --------------------------------- | --------------------------------------------------------- |
| `GET /api/jobs?q=&workMode=&skills=&since=&hasEmail=&cursor=` | Lista paginada com filtros                    |
| `GET /api/jobs/:postId`           | Detalhe                                                   |
| `GET /api/jobs/stream`            | SSE: vagas novas e resultados de currículo                 |
| `POST /api/jobs/:postId/cv`       | Pede currículo; responde `202` com `requestId`            |
| `GET /api/cv/:requestId`          | Status/resultado do pedido (fallback do SSE)              |
| `GET /api/scraper/runs`           | Histórico de coletas                                      |
| `POST /api/scraper/run`           | Coletar agora                                             |
| `GET / PUT /api/settings/:key`    | `key` = `scraper` ou `post-processing`                     |

## 6. Fora do escopo agora

- Contas de múltiplos usuários, permissões, login social.
- Acompanhamento de candidaturas (aplicada, entrevista, recusada). Pode ser uma evolução futura; se o design reservar espaço para isso, marque como futuro.
- Edição do currículo base (é um arquivo `.tex` mantido fora do sistema).
- Painel de saúde da infraestrutura (RabbitMQ, MongoDB, filas com erro).

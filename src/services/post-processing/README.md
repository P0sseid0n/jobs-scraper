# 🧠 post-processing

Transforma cada post da fila `post-processing` numa vaga estruturada, com um modelo local do Ollama, salva a vaga no MongoDB e a anuncia para os canais.

[← voltar ao README principal](../../../README.md)

## O caminho de um post

1. **Já visto:** posts que estão em `seen_posts` são ignorados. Cada post é processado uma única vez, seja vaga ou não.
2. **Várias vagas:** posts de agregadores são divididos por regra, sem IA. Só é dividido o post que fala de vagas ("vaga", "contratando", "candidate-se", "oportunidade", "hiring", "jobs"…): um projeto com "🌐 Aplicação:", "📦 Backend:" e "📦 Frontend:", cada um com seu link, tinha o mesmo formato. O cargo é a linha antes do link; se ela for só o rótulo ("Candidatura:"), é o item numerado do bloco ("1️⃣ Cargo", parágrafos acima) ou a primeira linha do parágrafo. Linhas só com caracteres invisíveis (o "⠀" braille que os autores usam como linha em branco) contam como em branco. Cada vaga cujo texto na lista (cargo e linhas até o link, sem os links) passa no filtro de palavras-chave vai para a fila `scraper-lookup`, e o [scraper](../scraper/README.md#posts-com-várias-vagas) abre o link dela.
3. **Idioma:** detectado no texto (biblioteca `franc`, sem IA). Posts fora de `allowedLanguages` (padrão: só `pt`) são descartados antes da extração. Um post num alfabeto que nenhum idioma aceito usa (árabe, persa, chinês…) cai mesmo com poucas palavras, assim como um post com as letras que só o vietnamita usa (ơ, ư, ạ, ộ…). Itens curtos de lista ("1. Backend Engineer", "• React") não contam: são cargos e tecnologias, quase sempre em inglês. O scraper já faz a mesma checagem antes de enviar. Aqui, o texto em alfabeto latino curto demais para o `franc` ("We're Hiring! Support Developer", o post automático de "novo cargo"), ou curto com um idioma aceito pontuando quase igual ao primeiro (espanhol e português), tem o idioma perguntado ao modelo, numa chamada curta só para isso (`post-language.ts`). Dentro do prompt de extração o modelo de 4B errava o idioma, e sozinho ele acerta até textos que misturam os dois idiomas. Quando ele responde o código de três letras ("eng" em vez de "en"), o código é convertido; antes, virava "idioma desconhecido" e o post seguia. Lista vazia aceita todos.
4. **Extração:** o Ollama (`OLLAMA_MODEL`) classifica o post e devolve cargo, empresa, local, modalidade, regime de contratação, conhecimentos pedidos (tecnologias, softwares, idiomas, certificações e registros como CRM, COREN e OAB, sem as competências comportamentais), e-mail e links. Respostas como "unknown" e "não especificado" viram vazias, a empresa só fica se estiver escrita no post fora dos links e e-mails (o modelo às vezes a tira do domínio), e a modalidade só fica se estiver escrita ("remoto", "home office", "híbrido", "presencial"…; o modelo às vezes a deduz do cargo). Num post com várias vagas, ele extrai a mais próxima do cargo-alvo do [perfil](../../shared/README.md#configurações-em-tempo-de-execução) ou, sem perfil, a primeira. Só vira vaga o post classificado como `job_opening`. Cada campo que a IA citou sem estar escrito no post (cargo, empresa, modalidade, regime, tecnologias ou link) vira um check da extração (`extractionChecks`), mostrado no site e no Discord como "⚠ 2/6"; a partir de `reviewChecksPercent` dos checks (padrão 60% = 4 de 6), a vaga pede para conferir o post original e reportar. Esse aviso é calculado ao anunciar a vaga (vai no evento `job-published`) e, no site, com o limite em vigor. Não há porcentagem de confiança: o modelo de 4B dava praticamente 0% ou 100% para a classificação que escolhia, e o número não separava os casos duvidosos.
5. **Relevância:** a busca do LinkedIn traz vagas de outras áreas. A vaga precisa citar no cargo ou nos conhecimentos ao menos uma palavra de `requiredKeywords` e nenhuma de `excludedKeywords`. A comparação é por palavra inteira ("java" não pega "javascript") e ignora caixa, acentos, ".js" e a marca de gênero dos cargos ("Vue.js" = "vue", "Técnico(a)" = "técnico"). O hífen vale junto e separado: "Front-end" casa com "frontend", e "COREN-SP" com "coren". Listas vazias desligam o filtro.
6. **Salvar e anunciar:** vagas sem cargo ou sem o link do post no LinkedIn são descartadas (`job-validation.ts`). As outras são salvas com upsert por `postId` (índice único), então a mesma vaga nunca é salva duas vezes. Cada vaga nova vai para o evento `job-published` (exchange fanout): o bot liga a fila `discord` e o site, a `web`. Outro canal (Telegram…) ligaria a própria fila e receberia todas as vagas. Se nenhum canal estiver ligado, a publicação falha e o post volta pelo retry; na nova tentativa a vaga já salva é só anunciada, sem chamar a IA de novo.

O limite dos checks, os idiomas e as palavras-chave ficam nas [configurações](../../shared/README.md#configurações-em-tempo-de-execução) e são editados pelo site. `REVIEW_CHECKS_PERCENT`, `JOB_LANGUAGES`, `JOB_REQUIRED_KEYWORDS` e `JOB_EXCLUDED_KEYWORDS` só preenchem esses valores quando eles ainda não existem no banco.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `job-extraction.ts` | chamada ao modelo e montagem da vaga |
| `extraction-prompt.ts`, `extraction-output.ts` | prompt e schema enviados ao modelo |
| `model-response.ts` | leitura e validação da resposta |
| `extraction-checks.ts` | checks da extração: campos que a IA citou sem estarem no post |
| `multi-job-post.ts` | divide posts que listam várias vagas |
| `post-language.ts` | idioma do post: o detector de `@shared/language` e, em texto curto, o modelo |
| `job-relevance.ts` | filtro de palavras-chave |
| `job-store.ts` | salva a vaga e publica o evento `job-published` |
| `job-validation.ts` | campos obrigatórios da vaga |
| `extraction-eval.ts`, `eval-extraction.ts` | `bun eval:extraction`: acerto por campo nas vagas corrigidas pelo site |
| `feedback-fixtures.ts`, `export-feedback-fixtures.ts` | `bun eval:export-fixtures`: correções sem dados pessoais em `fixtures/extraction-cases.json` |
| `check-pushed-fixtures.ts` | hook de pre-push: bloqueia o envio de fixtures ainda não reescritas à mão |
| `migrate-job-fields.ts`, `legacy-job-links.ts` | `bun db:migrate-jobs`: atualiza as vagas salvas para o formato atual dos campos (pode rodar mais de uma vez) |

## Avaliar a extração

Cada vaga salva guarda o modelo (`extractionModel`) e a versão do prompt (`promptVersion`, um hash do prompt e do formato pedidos ao modelo, que muda sozinho a cada edição). O cargo-alvo do perfil fica fora do hash: ele entra no prompt como dado, como o post, e trocá-lo não cria uma versão nova. Quando uma vaga é corrigida pelo site, a correção vai para a coleção `extraction_feedback` com o texto do post, a saída da IA, os valores certos, o modelo e a versão do prompt.

`bun eval:extraction` roda o prompt e o modelo atuais sobre esses casos (a correção mais recente de cada post), com as mesmas regras do post-processing (idioma, classificação e regras do texto), e mostra o acerto por campo ao lado do acerto da extração original. Exemplo de saída:

```
campo               original       atual  casos
é vaga?             83% (10)   92% (11)     12
title               100% (9)   100% (9)      9
company              33% (3)    78% (7)      9
...
```

- `--model gemma3:12b`: compara outro modelo (precisa estar baixado no Ollama);
- `--fixtures`: usa os casos versionados em `fixtures/extraction-cases.json`, sem MongoDB;
- `--limit 50`: só os casos mais recentes;
- `--verbose`: mostra o que errou em cada caso.

O cargo-alvo usado em cada caso é o do próprio caso (`targetRole`, nas fixtures de posts com várias vagas) ou, sem ele, o do perfil salvo. Com `--fixtures` não há perfil: os casos sem `targetRole` rodam como numa instalação sem perfil, extraindo a primeira vaga. A primeira linha da saída mostra o cargo-alvo do perfil.

Cada caso tem uma área (`area`: `dev`, `marketing`, `saude`, `juridico`, `rh`, `vendas`, `administrativo`...). As correções do site entram como `dev`, que é o que o scraper busca. As fixtures de dev com campos são vagas reais do banco reescritas à mão. Quando há casos de dev e de outras áreas, a tabela geral vem seguida de uma tabela para dev e outra para as outras áreas: uma mudança no prompt pode melhorar um grupo e piorar o outro. As fixtures de outras áreas são posts reais reescritos à mão. Nelas, `necessaryKnowledge` traz o que o post pede de conhecimento técnico (ferramentas, softwares, idiomas, registros como COREN e OAB, áreas do conhecimento), sem as competências comportamentais.

Para comparar duas versões do prompt, rode antes e depois da mudança. Precisa do Ollama e fica fora do CI. Mesmo com `temperature: 0`, a resposta do Ollama pode mudar um pouco entre rodadas: uma diferença de um caso não basta para concluir nada.

`bun eval:export-fixtures` exporta as correções para `fixtures/extraction-cases.json` sem dados pessoais: e-mails viram `contatoN@exemplo.com` (no texto e nos campos), o nome de quem postou vira "Autor do post", e perfis e links curtos (`lnkd.in`) do LinkedIn, telefones, links e ids do post saem. Isso não basta: o texto continua o do post, e um trecho dele numa busca acha quem postou. Por isso cada caso exportado sai com `anonymized: false`. Antes do commit, reescreva o texto à mão (troque frases, empresa, faculdade, números e a história, mantendo o que confunde a IA), ajuste a saída da IA se ela citar algo trocado e marque `anonymized: true`. Depois rode `bun eval:extraction --fixtures` com o prompt antigo para confirmar que o caso reescrito ainda pega o erro. Um caso com `anonymized: true` não é substituído quando o export roda de novo. Um teste confere que todas as fixtures versionadas têm `anonymized: true` e nenhum e-mail, perfil, link curto ou telefone. O hook de pre-push (`check-pushed-fixtures.ts`) faz a mesma conferência em cada commit enviado que mexe no arquivo e bloqueia o push se algum falhar.

A fila `storage`, do antigo serviço que salvava as vagas, ainda é consumida aqui para não perder as mensagens que estavam nela. O consumo sai na próxima versão.

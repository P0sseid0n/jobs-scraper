# 🧠 post-processing

Transforma cada post da fila `post-processing` numa vaga estruturada, com um modelo local do Ollama, salva a vaga no MongoDB e a anuncia para os canais.

[← voltar ao README principal](../../../README.md)

## O caminho de um post

1. **Já visto:** posts que estão em `seen_posts` são ignorados. Cada post é processado uma única vez, seja vaga ou não.
2. **Várias vagas:** posts de agregadores são divididos por regra, sem IA. Cada vaga cujo cargo passa no filtro de palavras-chave vai para a fila `scraper-lookup`, e o [scraper](../scraper/README.md#posts-com-várias-vagas) abre o link dela.
3. **Idioma:** detectado no texto (biblioteca `franc`, sem IA). Posts fora de `allowedLanguages` (padrão: só `pt`) são descartados antes de chamar a IA. Lista vazia aceita todos; posts curtos demais para detectar seguem normalmente.
4. **Extração:** o Ollama (`OLLAMA_MODEL`) devolve cargo, empresa, local, modalidade, regime de contratação, tecnologias, e-mail, links e a confiança de que o post é uma vaga. Abaixo de `minJobConfidence`, o post é descartado.
5. **Relevância:** a busca do LinkedIn traz vagas de outras áreas. A vaga precisa citar no cargo ou nas tecnologias ao menos uma palavra de `requiredKeywords` e nenhuma de `excludedKeywords`. A comparação é por palavra inteira ("java" não pega "javascript") e ignora caixa, acentos, hífen e ".js" ("Vue.js" = "vue"). Listas vazias desligam o filtro.
6. **Salvar e anunciar:** vagas sem cargo ou sem o link do post no LinkedIn são descartadas (`job-validation.ts`). As outras são salvas com upsert por `postId` (índice único), então a mesma vaga nunca é salva duas vezes. Cada vaga nova vai para o evento `job-published` (exchange fanout): o bot liga a fila `discord` e o site, a `web`. Outro canal (Telegram…) ligaria a própria fila e receberia todas as vagas. Se nenhum canal estiver ligado, a publicação falha e o post volta pelo retry; na nova tentativa a vaga já salva é só anunciada, sem chamar a IA de novo.

Confiança, idiomas e palavras-chave ficam nas [configurações](../../shared/README.md#configurações-em-tempo-de-execução) e são editados pelo site. `MIN_JOB_CONFIDENCE`, `JOB_LANGUAGES`, `JOB_REQUIRED_KEYWORDS` e `JOB_EXCLUDED_KEYWORDS` só preenchem esses valores na primeira execução.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `job-extraction.ts` | chamada ao modelo e montagem da vaga |
| `extraction-prompt.ts`, `extraction-output.ts` | prompt e schema enviados ao modelo |
| `model-response.ts` | leitura e validação da resposta |
| `multi-job-post.ts` | divide posts que listam várias vagas |
| `post-language.ts` | detecção do idioma |
| `job-relevance.ts` | filtro de palavras-chave |
| `job-store.ts` | salva a vaga e publica o evento `job-published` |
| `job-validation.ts` | campos obrigatórios da vaga |
| `migrate-job-fields.ts`, `legacy-job-links.ts` | `bun db:migrate-jobs`: atualiza as vagas salvas para o formato atual dos campos (pode rodar mais de uma vez) |

A fila `storage`, do antigo serviço que salvava as vagas, ainda é consumida aqui para não perder as mensagens que estavam nela. O consumo sai na próxima versão.

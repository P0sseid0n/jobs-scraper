# 🧩 shared

Código usado por mais de um serviço, importado pelo barrel de cada módulo (`@shared/messaging`, `@shared/contracts`…).

[← voltar ao README principal](../../README.md)

| Módulo | O que tem |
| --- | --- |
| `service/` | `startService()`: logger, `.env`, MongoDB e RabbitMQ prontos em uma chamada |
| `config/` | carregamento e validação do `.env` (zod) e as variáveis de infraestrutura |
| `contracts/` | formato das mensagens das filas |
| `database/` | conexão com o MongoDB e os modelos (`Job`, `SeenPost`, `Settings`, `ScraperRun`, `ExtractionFeedback`) |
| `messaging/` | cliente RabbitMQ, nomes das filas e política de retry e DLQ |
| `settings/` | configurações editáveis em tempo de execução e as credenciais das contas |
| `language/` | detecção do idioma do post (`franc`, sem IA; o alfabeto decide mesmo em texto curto), usada pelo scraper e pelo post-processing |
| `templates/` | textos compartilhados pelos canais (modelo de mensagem de candidatura) |
| `logging/`, `lifecycle/` | logger e encerramento gracioso |
| `health/` | heartbeat dos serviços e o script do healthcheck do Docker |

## Filas, retries e DLQ

Cada fila tem o nome do serviço que a consome. Para cada fila `X` existem também:

- `X.retry`: mensagens que falharam por erro transitório esperam ali (backoff exponencial a partir de `QUEUE_RETRY_DELAY_MS`) e depois voltam para `X`.
- `X.dlq`: mensagens com formato inválido ou que falharam mais de `QUEUE_MAX_RETRIES` vezes. Inspecione pelo painel do RabbitMQ.

As mensagens são persistentes e validadas com os schemas de `contracts/`.

## Configurações em tempo de execução

O perfil profissional, os termos de busca, o filtro de data, o limite de posts, o intervalo, a pausa das coletas, o limite dos checks da extração, os idiomas aceitos e as palavras-chave ficam na coleção `settings` do MongoDB, um documento por serviço (`scraper`, `post-processing`, `profile`). O site edita esses valores; outras fontes também podem.

- **O `.env` vem primeiro:** todas essas opções têm variável no `.env` (`settingsEnv`, em `settings/settings-env.ts`). Ao subir, todo serviço com banco lê essas variáveis antes de qualquer outra coisa e grava os documentos que ainda não existem (`seedSettings`, chamada pelo `startService`). Assim, não importa qual serviço sobe primeiro, nem se o site é aberto antes do scraper rodar.
- Depois, valem os do banco, editáveis pelo site: mudar o `.env` não altera documentos já salvos. Para voltar a usar o `.env`, apague o documento (ex.: pelo mongo-express); até ele ser recriado, as leituras já usam os valores do `.env`.
- Valor do `.env` que os schemas recusam (ex.: `SCRAPER_MAX_POSTS=500`) impede o serviço de subir, com a mensagem do campo.
- Os termos de busca, as palavras-chave e o perfil nascem vazios no `.env.example`: o onboarding do site preenche. Preenchidos no `.env`, aparecem já completos no onboarding, ainda editáveis; com `SKIP_ONBOARDING=true` (site), o onboarding não abre.
- Leitura e gravação com `loadSettings`/`updateSettings` (`settings/`), que validam tudo com os schemas de `contracts/` (`ScraperSettingsSchema`, `PostProcessingSettingsSchema`, `ProfileSettingsSchema`).
- O documento `profile` guarda o perfil profissional (área, cargo-alvo, senioridade e idiomas): `PROFILE_AREA`, `PROFILE_TARGET_ROLE`, `PROFILE_SENIORITY` e `PROFILE_LANGUAGES` no `.env`, ou pelo site. `isProfileComplete` diz se já tem o mínimo; enquanto não tem, os serviços seguem supondo vagas de desenvolvimento. A exceção é o post-processing: num post com várias vagas, ele extrai a mais próxima do cargo-alvo ou, sem cargo-alvo, a primeira.

## Credenciais

As contas do LinkedIn (`LINKEDIN_EMAIL`, `LINKEDIN_PASSWORD`, `LINKEDIN_LI_AT`), do Discord (`DISCORD_TOKEN`, `DISCORD_CHANNEL_ID`) e do GitHub (`GITHUB_USERNAME`, `GITHUB_TOKEN`) podem vir do `.env` ou do site (Configurações › Contas). O site grava no documento `credentials` da coleção `settings`, um grupo por conta (`linkedin`, `discord`, `github`), validado por `CredentialsSchema` (`contracts/settings.ts`).

- **Ordem de leitura, por grupo: banco, depois `.env`.** O grupo salvo pelo site vale por inteiro; sem ele, vale o do `.env`. Apagar o grupo pelo site volta a usar o do `.env`.
- **O `.env` é lido ao subir, como as configurações:** todo serviço com banco lê as credenciais do `.env` (`credentialsEnv`, em `settings/credentials-env.ts`) antes de qualquer outra coisa e as guarda em memória (`setEnvCredentials`, chamada pelo `startService`). Diferente das configurações, elas **não são copiadas para o banco**: só vai para o banco o que é salvo pelo site, e o site mostra de onde vem cada conta. Mudar o `.env` vale para os grupos que o site não salvou (ao reiniciar o serviço).
- Um grupo do `.env` só existe se alguma variável dele estiver preenchida, e aí precisa estar completo (ex.: `LINKEDIN_EMAIL` sem `LINKEDIN_PASSWORD` impede o serviço de subir, com o nome da variável).
- `loadCredentials(grupo)` lê o grupo em uso a cada chamada: o scraper a cada coleta, o cv-updater a cada currículo e o bot do Discord a cada 30 s (reconecta quando muda). Assim, o que é salvo pelo site vale sem reiniciar nada.
- **Segredos** (`SECRET_FIELDS`: a senha e o `li_at` do LinkedIn, o token do Discord e o do GitHub) nunca saem do servidor: a API (`credentialStatus`) só diz se estão preenchidos. Também nunca vão para os logs: nenhum código os loga, as mensagens de erro de validação trazem só o campo, e o logger oculta (`redact`) campos chamados `password`, `token`, `liAt` ou `credentials`.
- O site só escuta em `127.0.0.1`: guardar no MongoDB local tem o mesmo risco que no `.env`.

## Healthcheck

Cada serviço da aplicação tem um healthcheck no Docker: ele aparece como `unhealthy` no `docker compose ps` quando fica sem conexão com o RabbitMQ (ou com o MongoDB, se usa) por mais de 45 segundos. O Docker Compose só marca o estado; não reinicia o container sozinho.

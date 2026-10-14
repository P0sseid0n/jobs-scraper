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
| `settings/` | configurações editáveis em tempo de execução |
| `language/` | detecção do idioma do post (`franc`, sem IA), usada pelo scraper e pelo post-processing |
| `templates/` | textos compartilhados pelos canais (modelo de mensagem de candidatura) |
| `logging/`, `lifecycle/` | logger e encerramento gracioso |
| `health/` | heartbeat dos serviços e o script do healthcheck do Docker |

## Filas, retries e DLQ

Cada fila tem o nome do serviço que a consome. Para cada fila `X` existem também:

- `X.retry`: mensagens que falharam por erro transitório esperam ali (backoff exponencial a partir de `QUEUE_RETRY_DELAY_MS`) e depois voltam para `X`.
- `X.dlq`: mensagens com formato inválido ou que falharam mais de `QUEUE_MAX_RETRIES` vezes. Inspecione pelo painel do RabbitMQ.

As mensagens são persistentes e validadas com os schemas de `contracts/`.

## Configurações em tempo de execução

Os termos de busca, o filtro de data, o limite de posts, o intervalo, a pausa das coletas, a confiança mínima da IA, os idiomas aceitos e as palavras-chave ficam na coleção `settings` do MongoDB, um documento por serviço. O site edita esses valores; outras fontes também podem.

- Os valores do `.env` (`SEARCH_KEYWORDS`, `SCRAPER_DATE_POSTED`, `SCRAPER_MAX_POSTS`, `SCRAPER_INTERVAL_MINUTES`, `MIN_JOB_CONFIDENCE`, `JOB_LANGUAGES`, `JOB_REQUIRED_KEYWORDS`, `JOB_EXCLUDED_KEYWORDS`) só preenchem o documento na primeira execução. Depois, valem os do banco. Para voltar a usar o `.env`, apague o documento (ex.: pelo mongo-express).
- Leitura e gravação com `loadSettings`/`updateSettings` (`settings/`), que validam tudo com os schemas de `contracts/` (`ScraperSettingsSchema`, `PostProcessingSettingsSchema`).

## Healthcheck

Cada serviço da aplicação tem um healthcheck no Docker: ele aparece como `unhealthy` no `docker compose ps` quando fica sem conexão com o RabbitMQ (ou com o MongoDB, se usa) por mais de 45 segundos. O Docker Compose só marca o estado; não reinicia o container sozinho.

# Jobs Scraper 🚀💼

Pipeline que coleta postagens de vagas no LinkedIn, estrutura os dados com IA local (Ollama), salva no MongoDB e publica as vagas em um canal do Discord. Os serviços se comunicam por filas do RabbitMQ.

## 🗺️ Visão geral

```
scraper ──► post_processing ──► post-processing ──► storage ──► storage ──► send-discord-message ──► discord-bot
(Puppeteer)     (fila)             (Ollama)          (fila)    (MongoDB)          (fila)              (Discord)
```

1. **Scraper** (`src/services/scraper`): usa Puppeteer para buscar posts no LinkedIn. Cada post recebe um `postId` (hash do texto normalizado) e é enviado para a fila `post_processing`.
2. **Pós-processamento** (`src/services/post-processing`): ignora posts já vistos, usa um modelo do Ollama para extrair os dados da vaga e envia o resultado para a fila `storage`.
3. **Armazenamento** (`src/services/storage`): salva a vaga no MongoDB (sem duplicar, por causa do índice único em `postId`) e envia para a fila `send-discord-message`.
4. **Bot do Discord** (`src/services/discord-bot`): publica a vaga no canal configurado.

### Filas, retries e DLQ

Para cada fila `X` existem também:

- `X.retry`: mensagens que falharam por erro transitório esperam ali (backoff exponencial a partir de `QUEUE_RETRY_DELAY_MS`) e depois voltam para `X`.
- `X.dlq`: mensagens com formato inválido ou que falharam mais de `QUEUE_MAX_RETRIES` vezes. Inspecione pelo painel do RabbitMQ.

As mensagens são persistentes e validadas com os schemas de `src/types/messages.ts`.

## 🛠️ Tecnologias

- **Bun** + **TypeScript**
- **Puppeteer** (scraping)
- **RabbitMQ** (mensageria)
- **MongoDB** + Mongoose (armazenamento)
- **Ollama** (IA local)
- **Discord.js** (bot)
- **Zod** (validação de configuração e mensagens), **Pino** (logs)
- **Docker Compose** (infraestrutura e serviços)

## 🏃‍♂️ Como rodar localmente

Pré-requisitos: [Bun](https://bun.sh) 1.4+ e Docker.

1. **Clone o repositório e instale as dependências:**

   ```bash
   git clone https://github.com/P0sseid0n/jobs-scraper.git
   cd jobs-scraper
   bun install
   ```

2. **Configure o `.env`:**

   ```bash
   cp .env.example .env
   ```

   Preencha as credenciais (LinkedIn, Discord) e troque as senhas da infraestrutura. Todas as variáveis estão documentadas no `.env.example`. Cada serviço valida as suas variáveis na inicialização e encerra com uma mensagem clara se faltar alguma.

3. **Suba a infraestrutura** (RabbitMQ, MongoDB, mongo-express e Ollama):

   ```bash
   docker compose up -d
   # com GPU NVIDIA:
   docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
   ```

   O serviço `ollama-init` baixa automaticamente o modelo definido em `OLLAMA_MODEL` (padrão `gemma3:4b`). A primeira vez pode demorar. Acompanhe com `docker compose logs -f ollama-init`.

4. **Inicie os serviços em modo desenvolvimento:**

   ```bash
   bun dev            # scraper + post-processing + storage + discord-bot
   bun dev:scraped    # tudo menos o scraper (só processa o que já está nas filas)
   ```

### Rodando tudo em containers

```bash
docker compose --profile app up -d --build
```

O scraper roda uma coleta e termina. Para coletar de novo: `docker compose --profile app run --rm scraper`, que pode ser agendado com cron ou com o Agendador de Tarefas.

### Painéis

Todas as portas ficam publicadas apenas em `127.0.0.1`.

- RabbitMQ: http://localhost:15672 (`RABBITMQ_USER` / `RABBITMQ_PASSWORD`)
- mongo-express: http://localhost:8081 (`MONGO_EXPRESS_USER` / `MONGO_EXPRESS_PASSWORD`)

## 🧰 Scripts

| Script | Descrição |
| --- | --- |
| `bun dev` | Todos os serviços com `--watch` |
| `bun start:<scraper\|processing\|storage\|bot>` | Um serviço, sem `--watch` |
| `bun run typecheck` | Checagem de tipos (`tsc --noEmit`) |
| `bun run lint` / `bun run lint:fix` | Lint e formatação com Biome |
| `bun test` | Testes |

O CI (GitHub Actions) roda `typecheck`, `lint` e `test` em todo push e PR.

## 📁 Estrutura

```
src/
  config.ts                 # schemas das variáveis de ambiente (zod)
  services/
    scraper/                # scraper do LinkedIn
    post-processing/        # extração com IA
    storage/                # persistência no MongoDB
    discord-bot/            # publicação no Discord
  types/messages.ts         # contratos das mensagens das filas
  utils/                    # fila (RabbitMQ), banco, logger, shutdown, hash
tests/                      # testes (bun test)
```

## 🔄 Migrando de uma versão anterior

- **Filas:** as filas agora são declaradas com dead-letter. Se elas já existirem no RabbitMQ com a configuração antiga, o serviço encerra com um erro avisando. Apague as filas `post_processing`, `storage` e `send-discord-message` pelo painel (aba *Queues* → *Delete*) e rode de novo.
- **Credenciais:** o Mongo e o RabbitMQ só criam o usuário quando o volume é criado. Para trocar as credenciais antigas (`user`/`user`), recrie os volumes com `docker compose down -v`. Isso **apaga os dados**.

## ⚠️ Observações importantes

- **NUNCA** suba o `.env` ou o `linkedin_cookies.json` para o repositório.
- Fazer scraping do LinkedIn vai contra os Termos de Uso da plataforma e pode levar ao bloqueio da conta. Use uma conta dedicada, mantenha `SCRAPER_MAX_POSTS` baixo, use um `SCRAPER_SCROLL_DELAY_MS` generoso e espace as execuções.
- Os logs em nível `info` registram apenas IDs e metadados. O conteúdo dos posts e as respostas da IA só aparecem com `LOG_LEVEL=debug`.

## 📄 Licença

Este projeto está licenciado sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

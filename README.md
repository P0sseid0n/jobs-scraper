# Jobs Scraper

Este projeto é um scraper completo para coleta, processamento, armazenamento e divulgação de vagas de emprego extraídas do LinkedIn, utilizando Node.js, TypeScript, Puppeteer, RabbitMQ, MongoDB, Discord e IA generativa.

## Visão Geral

O fluxo do projeto é dividido em quatro etapas principais:

1. **Scraper** (`scraper/`):

   -  Utiliza Puppeteer para automatizar a busca e extração de postagens de vagas no LinkedIn.
   -  As vagas extraídas são enviadas para uma fila RabbitMQ (`post_processing`).

2. **Pós-processamento** (`post-processing/`):

   -  Recebe as vagas da fila e utiliza um modelo de IA (via Ollama) para estruturar e validar os dados.
   -  Os dados processados são enviados para a próxima fila (`storage`).

3. **Armazenamento** (`storage/`):

   -  Recebe os dados estruturados e armazena no MongoDB.
   -  Após salvar, envia para a fila de envio ao Discord (`send-discord-message`).

4. **Bot do Discord** (`discord-bot/`):
   -  Recebe as vagas e publica em um canal do Discord, com formatação amigável e botão para contato.

## Tecnologias Utilizadas

-  **Node.js** + **TypeScript**
-  **Puppeteer** (scraping)
-  **RabbitMQ** (mensageria)
-  **MongoDB** (armazenamento)
-  **Ollama** (IA generativa)
-  **Discord.js** (bot)
-  **Docker Compose** (infraestrutura local)

## Como rodar localmente

1. **Clone o repositório:**

```bash
git clone <url-do-repo>
cd Jobs
```

2. **Configure o arquivo `.env`:**

Crie um arquivo `.env` na raiz com as seguintes variáveis:

```
LINKEDIN_EMAIL=seu_email
LINKEDIN_PASSWORD=sua_senha
DISCORD_TOKEN=seu_token
DISCORD_CHANNEL_ID=id_do_canal
```

> **Nunca suba o arquivo `.env` para o GitHub!**

3. **Suba os serviços com Docker Compose:**

```bash
docker-compose up -d
```

4. **Instale as dependências:**

```bash
pnpm install
```

5. **Inicie todos os serviços em modo desenvolvimento:**

```bash
pnpm dev
```

## Estrutura dos diretórios

-  `scraper/` — Scraper do LinkedIn
-  `post-processing/` — Pós-processamento com IA
-  `storage/` — Armazenamento no MongoDB
-  `discord-bot/` — Bot do Discord
-  `types/` — Tipos TypeScript compartilhados

## Observações Importantes

-  **NUNCA** suba arquivos `.env` ou credenciais para o repositório.
-  As credenciais de banco e serviços estão em variáveis de ambiente e no `docker-compose.yml` (apenas para uso local).
-  O projeto utiliza filas para desacoplar as etapas e facilitar a escalabilidade.

## Licença

Este projeto está licenciado sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

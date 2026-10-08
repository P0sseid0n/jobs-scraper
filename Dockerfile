FROM oven/bun:1.4.2 AS base
WORKDIR /app
ENV NODE_ENV=production \
	PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src

# Serviços que não precisam de navegador (post-processing, storage, discord-bot)
FROM base AS app
USER bun

# Scraper: precisa do Chromium do sistema (o download do Puppeteer foi desativado acima)
FROM base AS scraper
RUN apt-get update \
	&& apt-get install -y --no-install-recommends chromium fonts-liberation \
	&& rm -rf /var/lib/apt/lists/* \
	&& mkdir -p data/scraper \
	&& chown -R bun:bun data
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
USER bun
CMD ["bun", "src/services/scraper/index.ts"]

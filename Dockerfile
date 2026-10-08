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

# cv-updater: compila o currículo em LaTeX com o Tectonic (binário estático)
FROM base AS cv-updater
ARG TECTONIC_VERSION=0.17.0
ADD https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz /tmp/tectonic.tar.gz
RUN tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic \
	&& rm /tmp/tectonic.tar.gz \
	&& mkdir -p data/cv/generated data/cache /home/bun/.cache/Tectonic \
	&& chown -R bun:bun data /home/bun/.cache
USER bun
CMD ["bun", "src/services/cv-updater/index.ts"]

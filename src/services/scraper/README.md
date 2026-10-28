# 🕷️ scraper

Busca posts de vagas no LinkedIn com o Puppeteer e envia cada um para a fila `post-processing`. O `postId` de cada post é o URN dele no LinkedIn; posts sem URN são pulados, porque sem ele não há link. Na mesma coleta, um hash do texto evita mandar duas vezes o mesmo post. Junto com o texto vai o link do cartão anexado ao post (pré-visualização de um site), sem o aviso de link externo do LinkedIn (`/safety/go`): em reposts de sites de vagas o texto vem cortado e é esse link que leva à vaga.

**Imagens do post:** muitos posts põem a vaga numa arte ("detalhes na imagem 👇"). As imagens do conteúdo (`media.licdn.com/dms/image/.../feedshare-shrink_<tamanho>/...`; avatares e logos ficam de fora) vão junto no `RawPost`, em base64: as URLs do LinkedIn são assinadas e expiram, então são baixadas na coleta. São no máximo 2 por post, de até 1,5 MB cada (`POST_IMAGE_LIMITS`), no tamanho mais legível disponível (`feedshare-shrink_800`/`_1280` em vez da prévia `_160`, `linkedin/post-images.ts`). O download vem do CDN de imagens, não das páginas do LinkedIn, e só acontece para os posts enviados à fila (os já vistos e os de outro idioma não baixam nada). Uma imagem que não baixar fica de fora sem impedir o post.

[← voltar ao README principal](../../../README.md)

## Coletas

- Cada coleta busca cada termo ativo das configurações (`settings`, editáveis pelo site). O mínimo de vagas é dividido entre os termos; o que um termo não completar passa para os seguintes, e com o mínimo completo os termos que faltam são pulados.
- **Ordem dos termos:** os que trouxeram mais vagas nas últimas 10 coletas (as das listas de vagas contam pelo post da lista) são buscados primeiro, então os que menos rendem é que ficam sem busca quando o mínimo se completa cedo. Termos sem histórico (novos ou que nunca chegaram a buscar) vão na frente, para mostrarem o que trazem; os empates seguem a ordem das configurações. O histórico guarda a ordem usada (`plannedTerms`).
- **Ampliação do período:** se as buscas acabarem sem completar o mínimo, a coleta refaz a busca dos termos com o período seguinte, mais amplo (24h → semana → mês → qualquer data), até completar ou chegar em "qualquer data". Os posts já vistos são pulados sem ir para a IA, então ampliar custa só a rolagem. Um termo que falhou de verdade não é buscado de novo; um que veio vazio, sim. O período configurado é o ponto de partida: com "qualquer data", não há o que ampliar. Cada termo guarda no histórico o período da última busca (`datePosted`), mostrado no cartão do termo.
- **Intervalo esticado:** a coleta guarda quantas vagas faltaram para o mínimo (`missingJobs`). Cada coleta seguida (das mais recentes) que terminou abaixo do mínimo dobra o intervalo até a próxima coleta automática, até 4 vezes: coletar logo depois de uma busca esgotada só acharia posts já vistos e aumenta o risco de bloqueio. Uma coleta que completa o mínimo volta ao intervalo normal; as com falha não contam. O site mostra o intervalo esticado na tela de Coletas.
- **Sem termos:** o `.env.example` e as configurações nascem sem termos de busca (o `.env` ou o onboarding do site preenchem). Sem nenhum termo ativo, o scraper não coleta: fica em espera, registra o motivo no log e volta a coletar quando um termo for ativado. A tela de Coletas mostra o que falta.
- **Sem conta do LinkedIn:** o scraper sobe mesmo assim e fica em espera do mesmo jeito: sem conta no site nem no `.env`, não coleta, registra o motivo no log, e a tela de Coletas pede para conectar a conta. Ela é relida antes de cada coleta, então salvar a conta pelo site já inicia as coletas, sem reiniciar.
- **Primeira coleta:** numa instalação nova (nenhuma coleta no histórico nem vaga salva), a agenda não começa sozinha quando os termos e a conta ficam prontos, no meio do onboarding: espera o "fazer a primeira coleta" da revisão (ou o "coletar agora"), com o currículo e o resto já configurados. Depois dela, segue o intervalo. Com `SKIP_ONBOARDING=true` (configuração pelo `.env`), a primeira coleta começa sozinha; a coleta única (`SCRAPER_INTERVAL_MINUTES=0`) também não espera.
- **Falha no login:** a coleta para e o histórico guarda o motivo (`loginFailure`: verificação não resolvida a tempo, captcha, e-mail ou senha recusados, sem conta, ou outro), para o site explicar sem os detalhes técnicos da mensagem.
- **O que conta no mínimo:** só os posts que viraram vaga salva. Com posts na fila suficientes para completar o mínimo, a busca espera o destino deles (`seen_posts`), e cada um que não vira vaga (descartado ou lista de vagas) abre lugar para mais um post. Se a IA não terminar nenhum post em 10 minutos (post-processing parado), os que faltam contam como vagas e o termo para. Posts já processados em coletas anteriores e posts em um idioma fora dos aceitos (`allowedLanguages` do post-processing) são pulados sem ir para a IA, e a busca continua rolando até completar o mínimo. Ela só para antes no fim dos resultados ou depois de 15 rolagens seguidas sem nenhum post enviado, para não rolar sem fim (cada rolagem espera os posts carregarem, então um termo assim leva alguns minutos). O histórico mostra quando a coleta terminou abaixo do mínimo.
- **Coleta periódica ou única:** com um intervalo (o `.env.example` traz `SCRAPER_INTERVAL_MINUTES=240`), o scraper fica rodando, coleta na agenda (o intervalo das configurações, editável pelo site), atende o "coletar agora" e relê as configurações a cada 30 segundos, sem reiniciar. Com `SCRAPER_INTERVAL_MINUTES=0` (ou sem a variável), ele coleta uma vez e encerra (sem termos de busca ativos ou sem conta do LinkedIn, antes espera a configuração ser salva pelo site, relendo a cada 30 segundos); no Docker, o container para e o "coletar agora" fica na fila até ele subir de novo.
- **Coletar agora:** `bun scraper:run`, ou o botão no site, publica uma mensagem `ScraperCommand` na fila `scraper`. Funciona mesmo com as coletas pausadas.
- **Histórico:** cada coleta fica em `scraper_runs` por 90 dias, com o status e os posts enviados por termo.

## Posts com várias vagas

O post-processing divide os posts de agregadores ("📄 Cargo" + "🔗 Candidate-se: https://lnkd.in/...") e manda cada vaga relevante para a fila `scraper-lookup`. O scraper abre o link de cada uma no navegador logado, uma por vez, com pausa (`SCRAPER_LOOKUP_DELAY_MS`) e nunca durante uma coleta. O texto da página volta para a fila `post-processing` como um post comum, com `sourcePostId` apontando para o post original. Se a página não abrir, for um redirecionamento, uma verificação ("not a robot") ou o convite de um grupo (WhatsApp, Discord, Telegram), vão só as linhas do post sobre a vaga: o menu do app virava a descrição da vaga.

Quando a coleta completa o mínimo de vagas, as listas dela não são abertas: saem de `seen_posts` (e ficam em `deferredLists` no histórico), para aparecerem de novo numa próxima busca, e os pedidos de vaga delas já na fila são ignorados.

## Login e verificação

A sessão fica salva em `data/scraper/linkedin-cookies.json` (no Docker, no volume `scraper_data`), então o login só é refeito quando ela expira. O site também pede um teste do login (onboarding e Configurações › Contas) pela fila `scraper-login-test`: o scraper abre o feed e faz o login se precisar. Com `HEADLESS=auto` (padrão), o navegador roda sem janela. Se o LinkedIn pedir uma verificação, ela abre numa modal do site, em qualquer tela (cada passo do login fica na coleção `linkedin_login`, com o prazo da espera em `expiresAt`):

- **QR code:** aparece no site e no terminal (ou em `docker compose logs -f scraper`) para escanear com o app do LinkedIn.
- **Código** (e-mail, SMS ou app autenticador): digite no site ou envie de outro terminal com `bun scraper:verify 123456`. Se estiver errado, envie outro.
- **Aprovação no app:** aprove no celular; o scraper espera até 3 minutos.
- **Captcha ou verificação desconhecida:** onde há tela, o scraper abre a janela do navegador, refaz o login para você resolver e volta a rodar sem janela. Sem tela (Docker), salva um print em `data/scraper/login-verification.png` e a coleta falha.

`HEADLESS=true` nunca abre janela; `HEADLESS=false` roda sempre com janela. Se o login falhar, a coleta inteira para, em vez de tentar logar de novo em cada termo.

## Variáveis

`LINKEDIN_EMAIL`, `LINKEDIN_PASSWORD` e `LINKEDIN_LI_AT` (ou a conta salva em Configurações › Contas, que vale no lugar delas e é relida a cada coleta; ver [credenciais](../../shared/README.md#credenciais)), `LINKEDIN_COOKIES_FILE`, `HEADLESS`, `BROWSER_NO_SANDBOX`, `SCRAPER_SCROLL_DELAY_MS` e `SCRAPER_LOOKUP_DELAY_MS`. `SEARCH_KEYWORDS`, `SCRAPER_DATE_POSTED`, `SCRAPER_MIN_JOBS`, `SCRAPER_INTERVAL_MINUTES` e `SCRAPER_PAUSED` só preenchem as configurações que ainda não existem (ver [shared](../../shared/README.md#configurações-em-tempo-de-execução)); `SCRAPER_INTERVAL_MINUTES` também decide se o scraper roda uma vez (0) ou fica rodando. Todas estão documentadas no `.env.example`.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `scrape-run.ts` | uma coleta: busca cada termo, lê os posts e publica os novos |
| `scheduler.ts` | agenda das coletas e "coletar agora" (fila `scraper`) |
| `run-history.ts` | histórico das coletas (`scraper_runs`) |
| `browser-session.ts` | navegador (stealth) e cookies da sessão |
| `login.ts`, `verification.ts` | login e identificação da verificação pedida |
| `feed-reader.ts` | leitura dos posts e paginação |
| `linkedin/post-images.ts`, `post-images.ts` | quais imagens do card são do post, em que tamanho, e o download delas |
| `job-lookup.ts` | abre os links da fila `scraper-lookup` |
| `linkedin/` | URLs, seletores, URN do post, cookies e limpeza de texto |

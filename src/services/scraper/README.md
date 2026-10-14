# 🕷️ scraper

Busca posts de vagas no LinkedIn com o Puppeteer e envia cada um para a fila `post-processing`. O `postId` de cada post é o URN dele no LinkedIn; posts sem URN são pulados, porque sem ele não há link. Na mesma coleta, um hash do texto evita mandar duas vezes o mesmo post. Junto com o texto vai o link do cartão anexado ao post (pré-visualização de um site), sem o aviso de link externo do LinkedIn (`/safety/go`): em reposts de sites de vagas o texto vem cortado e é esse link que leva à vaga.

[← voltar ao README principal](../../../README.md)

## Coletas

- Cada coleta busca cada termo ativo das configurações (`settings`, editáveis pelo site). O limite de posts é dividido entre os termos.
- **O que conta no limite:** só os posts enviados para a IA. Posts já processados em coletas anteriores e posts em um idioma fora dos aceitos (`allowedLanguages` do post-processing) são pulados, e a busca continua rolando até completar o limite. Ela só para antes no fim dos resultados ou depois de 15 rolagens seguidas sem nenhum post enviado, para não rolar sem fim (cada rolagem espera os posts carregarem, então um termo assim leva alguns minutos).
- **Coleta única ou periódica:** com `SCRAPER_INTERVAL_MINUTES=0` (padrão), o scraper coleta uma vez e encerra. Com um intervalo (ex.: `180`), ele fica rodando, coleta na agenda e relê as configurações a cada 30 segundos, sem reiniciar.
- **Coletar agora:** `bun scraper:run`, ou o botão no site, publica uma mensagem `ScraperCommand` na fila `scraper`. Funciona mesmo com as coletas pausadas.
- **Histórico:** cada coleta fica em `scraper_runs` por 90 dias, com o status e os posts enviados por termo.

## Posts com várias vagas

O post-processing divide os posts de agregadores ("📄 Cargo" + "🔗 Candidate-se: https://lnkd.in/...") e manda cada vaga relevante para a fila `scraper-lookup`. O scraper abre o link de cada uma no navegador logado, uma por vez, com pausa (`SCRAPER_LOOKUP_DELAY_MS`) e nunca durante uma coleta. O texto da página volta para a fila `post-processing` como um post comum, com `sourcePostId` apontando para o post original.

## Login e verificação

A sessão fica salva em `data/scraper/linkedin-cookies.json` (no Docker, no volume `scraper_data`), então o login só é refeito quando ela expira. Com `HEADLESS=auto` (padrão), o navegador roda sem janela. Se o LinkedIn pedir uma verificação:

- **QR code:** aparece no terminal (ou em `docker compose logs -f scraper`) para escanear com o app do LinkedIn.
- **Código** (e-mail, SMS ou app autenticador): envie de outro terminal com `bun scraper:verify 123456`. Se estiver errado, envie outro.
- **Aprovação no app:** aprove no celular; o scraper espera até 3 minutos.
- **Captcha ou verificação desconhecida:** onde há tela, o scraper abre a janela do navegador, refaz o login para você resolver e volta a rodar sem janela. Sem tela (Docker), salva um print em `data/scraper/login-verification.png` e a coleta falha.

`HEADLESS=true` nunca abre janela; `HEADLESS=false` roda sempre com janela. Se o login falhar, a coleta inteira para, em vez de tentar logar de novo em cada termo.

## Variáveis

`LINKEDIN_EMAIL`, `LINKEDIN_PASSWORD`, `LINKEDIN_LI_AT`, `LINKEDIN_COOKIES_FILE`, `HEADLESS`, `BROWSER_NO_SANDBOX`, `SCRAPER_SCROLL_DELAY_MS` e `SCRAPER_LOOKUP_DELAY_MS`. `SEARCH_KEYWORDS`, `SCRAPER_DATE_POSTED`, `SCRAPER_MAX_POSTS` e `SCRAPER_INTERVAL_MINUTES` só preenchem as configurações na primeira execução. Todas estão documentadas no `.env.example`.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `scrape-run.ts` | uma coleta: busca cada termo, lê os posts e publica os novos |
| `scheduler.ts` | agenda das coletas e "coletar agora" (fila `scraper`) |
| `run-history.ts` | histórico das coletas (`scraper_runs`) |
| `browser-session.ts` | navegador (stealth) e cookies da sessão |
| `login.ts`, `verification.ts` | login e identificação da verificação pedida |
| `feed-reader.ts` | leitura dos posts e paginação |
| `job-lookup.ts` | abre os links da fila `scraper-lookup` |
| `linkedin/` | URLs, seletores, URN do post, cookies e limpeza de texto |

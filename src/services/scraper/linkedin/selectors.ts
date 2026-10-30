/**
 * Seletores centralizados. Cada um tem alternativas (separadas por vírgula) para sobreviver a pequenas
 * mudanças no HTML do LinkedIn. Se a coleta parar de encontrar posts, comece revisando aqui.
 */
export const SELECTORS = {
	/** Card de um post: layout atual (2026, sem classes estáveis) e o antigo, com `data-urn`. */
	post: '[role="listitem"][componentkey*="update-card"], [data-urn^="urn:li:activity:"], [data-urn^="urn:li:ugcPost:"], [data-urn^="urn:li:share:"]',
	postText:
		'[data-testid="expandable-text-box"], .update-components-text, .update-components-update-v2__commentary, .feed-shared-update-v2__description',
	/** Elementos cujo id/href contém o ID do post (ver `resolvePostUrn`). */
	postIdSources: '[id^="translatable-commentary-"], a[href*="/feed/update/urn"], a[href*="UpdateUrn=urn"], a[href*="urn%3Ali%3A"]',
	/** Ações do post (comentários) no layout atual: a `componentkey` começa com o URN codificado (`urnFromComponentKey`). */
	postKeySources: '[componentkey*="-replaceableCommentTools"], [componentkey*="-commentsSectionAnchorRef"]',
	/** Link do perfil do autor; o nome é o primeiro link com texto. */
	authorLink: 'a[href*="/in/"], a[href*="/company/"]',
	loadMoreButton: 'button.scaffold-finite-scroll__load-button',
	/**
	 * Aviso de busca sem resultados. Sem classe estável, é reconhecido pelo texto (português ou inglês); ainda não
	 * confirmado numa busca real: se não bater, a busca vazia aparece como "nenhum post reconhecido".
	 */
	noResultsText: /nenhum resultado|não encontramos resultados|no results found|no matching results/i,
	/**
	 * Botão do post que o LinkedIn traduziu sozinho para o idioma da conta. Sem classe nem atributo estável, é
	 * reconhecido pelo texto ("Exibir original" confirmado numa busca real; os em inglês ainda não).
	 */
	showOriginalText: /^(?:exibir|ver|mostrar|see|show|view) original$/i,
	/** Página de uma vaga (/jobs/view): o topo (cargo, empresa, local) e a descrição. Sem eles, lê o `<main>` inteiro. */
	jobTopCard:
		'.job-details-jobs-unified-top-card__container--two-pane, .jobs-unified-top-card, .job-details-jobs-unified-top-card__job-title, .top-card-layout',
	jobDescription:
		'#job-details, .jobs-description__content, .jobs-box__html-content, .description__text, .show-more-less-html__markup',
	/** Aviso do encurtador (lnkd.in) antes de um site fora do LinkedIn: o link para continuar. */
	shortLinkTarget: 'a[data-tracking-control-name="external_url_click"], a[data-tracking-control-name*="external"]',
	// A página de login atual (React) não tem id/name estáveis e renderiza o formulário duas vezes
	// (uma cópia oculta): por isso usamos `autocomplete`/`type` e sempre o elemento visível.
	loginUsername: '#username, input[name="session_key"], input[autocomplete~="username"]',
	loginPassword: '#password, input[name="session_password"], input[type="password"]',
	// Verificação do login (/checkpoint). Ainda não confirmados numa verificação real: se não forem reconhecidos,
	// o scraper abre a janela ou salva um screenshot da página (ver `login.ts`), que ajuda a ajustar aqui.
	/** Campo do código enviado por e-mail, SMS ou app autenticador. */
	verificationCodeInput:
		'input[name="pin"], input[autocomplete="one-time-code"], input[id*="verification_pin"], input[id*="pin_input"]',
	captchaFrame: 'iframe[src*="captcha"], iframe[src*="arkoselabs"], iframe[title*="captcha" i], #captcha-internal',
} as const

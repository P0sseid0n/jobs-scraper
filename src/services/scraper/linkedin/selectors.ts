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
	/** Link do perfil do autor; o nome é o primeiro link com texto. */
	authorLink: 'a[href*="/in/"], a[href*="/company/"]',
	loadMoreButton: 'button.scaffold-finite-scroll__load-button',
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

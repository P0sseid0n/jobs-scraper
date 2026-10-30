import { TimeoutError, type Page } from 'puppeteer'

import type { CardImage } from './linkedin/post-images'
import { SELECTORS } from './linkedin/selectors'

export type ScrapedPost = {
	/** Valores (data-urn, ids, hrefs) de onde o URN do post é extraído com `resolvePostUrn`. */
	urnCandidates: string[]

	text: string
	author: string | null
	/** O link do autor é de uma página de empresa (`/company/`), não de uma pessoa (`/in/`). */
	authorIsCompany: boolean

	/** Links do card fora do texto (o cartão anexado, entre outros); `externalLink` escolhe o que vale. */
	cardLinks: string[]

	/** As `<img>` do card; `postImageUrls` separa as do conteúdo (fora avatares e logos). */
	images: CardImage[]
}

const SCRAPED_ATTRIBUTE = 'data-jobs-scraped'
const TRANSLATED_ATTRIBUTE = 'data-jobs-translated'

/** Quanto esperar o texto original dos posts traduzidos; o que não voltar a tempo é lido traduzido. */
const ORIGINAL_TEXT_TIMEOUT_MS = 5_000

/**
 * Lê os posts ainda não coletados e os marca no DOM, para a paginação não depender da posição deles.
 * O callback roda no navegador: só pode usar os próprios argumentos.
 */
export async function collectNewPosts(page: Page): Promise<ScrapedPost[]> {
	await showOriginalTexts(page)

	return page.evaluate(
		(selectors, scrapedAttribute) => {
			const results: {
				urnCandidates: string[]
				text: string
				author: string | null
				authorIsCompany: boolean
				cardLinks: string[]
				images: { src: string; srcset: string }[]
			}[] = []

			// Posts compartilhados contêm o post original dentro: fica só com o card mais externo
			let containers = Array.from(document.querySelectorAll<HTMLElement>(selectors.post))
			containers = containers.filter(el => !el.parentElement?.closest(selectors.post))

			// Fallback: se o LinkedIn mudar o card de novo, ainda coletamos o texto (sem link)
			if (containers.length === 0) containers = Array.from(document.querySelectorAll<HTMLElement>(selectors.postText))

			for (const container of containers) {
				if (container.hasAttribute(scrapedAttribute)) continue

				// Compartilhamento com comentário: o post original vem dentro do card, depois do comentário de quem
				// compartilhou. A vaga é a do original (texto, autor e id); antes, o id saía dele e o texto e o autor, do
				// comentário, e a vaga ficava com o nome de quem só compartilhou
				const textElements = Array.from(container.querySelectorAll<HTMLElement>(selectors.postText))
				let source: HTMLElement = container
				if (textElements.length > 1) {
					let nested = textElements[textElements.length - 1]!
					while (nested.parentElement && !nested.parentElement.contains(textElements[0]!)) nested = nested.parentElement
					if (nested.querySelector(selectors.authorLink)) source = nested
				}

				const textElement = container.matches(selectors.postText)
					? container
					: source.querySelector<HTMLElement>(selectors.postText)
				const text = textElement?.innerText ?? ''

				// Card ainda carregando: tenta de novo na próxima rolagem
				if (!text.trim()) continue

				container.setAttribute(scrapedAttribute, '1')

				// Os do post original primeiro: `resolvePostUrn` fica com o primeiro reconhecido
				const urnCandidates = [...new Set([source, container])]
					.flatMap(element => [
						element.getAttribute('data-urn') ?? '',
						...Array.from(element.querySelectorAll(selectors.postIdSources)).map(
							el => el.getAttribute('id') ?? el.getAttribute('href') ?? '',
						),
						...Array.from(element.querySelectorAll(selectors.postKeySources)).map(el => el.getAttribute('componentkey') ?? ''),
					])
					.filter(Boolean)

				const authorLink = Array.from(source.querySelectorAll<HTMLAnchorElement>(selectors.authorLink))
					.map(link => ({ name: link.innerText.trim().split('\n')[0]?.trim(), href: link.href }))
					.find(link => link.name)
				const author = authorLink?.name

				// Os links do texto a IA já lê; os de fora dele incluem o do cartão anexado (pré-visualização de um site)
				const cardLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'))
					.filter(link => !textElement?.contains(link))
					.map(link => link.href)

				// Imagens ainda não carregadas (lazy) têm a URL em `data-delayed-url` no layout antigo
				const images = Array.from(container.querySelectorAll<HTMLImageElement>('img')).map(img => ({
					src: img.currentSrc || img.src || img.getAttribute('data-delayed-url') || '',
					srcset: img.getAttribute('srcset') ?? '',
				}))

				results.push({
					urnCandidates,
					text,
					author: author || null,
					authorIsCompany: !!authorLink?.href.includes('/company/'),
					cardLinks,
					images,
				})
			}

			return results
		},
		SELECTORS,
		SCRAPED_ATTRIBUTE,
	)
}

/**
 * Volta ao texto original os posts ainda não coletados que o LinkedIn traduziu sozinho para o idioma da conta
 * ("Exibir original"). Traduzido, o post em inglês passava pelo filtro de idioma como português e a vaga era salva
 * com o texto da tradução. O original carrega depois do clique; o botão muda antes, então a espera olha os textos do
 * card, guardados nele (`TRANSLATED_ATTRIBUTE`) antes do clique. O card que não voltar a tempo é lido traduzido.
 */
async function showOriginalTexts(page: Page) {
	const pattern = { source: SELECTORS.showOriginalText.source, flags: SELECTORS.showOriginalText.flags }

	const clicked = await page.evaluate(
		(selectors, scrapedAttribute, translatedAttribute, pattern) => {
			const regex = new RegExp(pattern.source, pattern.flags)
			let count = 0

			for (const card of document.querySelectorAll(`:is(${selectors.post}):not([${scrapedAttribute}])`)) {
				const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button')).filter(button =>
					regex.test(button.innerText.trim()),
				)
				if (buttons.length === 0) continue

				// Todos os textos: no compartilhamento com comentário, o traduzido pode ser só o do post original
				const texts = Array.from(card.querySelectorAll<HTMLElement>(selectors.postText), element => element.innerText)
				card.setAttribute(translatedAttribute, texts.join('\n'))
				for (const button of buttons) button.click()
				count++
			}

			return count
		},
		SELECTORS,
		SCRAPED_ATTRIBUTE,
		TRANSLATED_ATTRIBUTE,
		pattern,
	)
	if (clicked === 0) return

	await page
		.waitForFunction(
			(selectors, translatedAttribute) =>
				Array.from(document.querySelectorAll(`[${translatedAttribute}]`)).every(
					card =>
						Array.from(card.querySelectorAll<HTMLElement>(selectors.postText), element => element.innerText).join('\n') !==
						card.getAttribute(translatedAttribute),
				),
			{ timeout: ORIGINAL_TEXT_TIMEOUT_MS },
			SELECTORS,
			TRANSLATED_ATTRIBUTE,
		)
		.catch((error: unknown) => {
			if (!(error instanceof TimeoutError)) throw error
		})

	await page.evaluate(
		translatedAttribute => {
			for (const card of document.querySelectorAll(`[${translatedAttribute}]`)) card.removeAttribute(translatedAttribute)
		},
		TRANSLATED_ATTRIBUTE,
	)
}

/**
 * Rola até o fim, clica em "carregar mais" (se houver) e espera novos posts.
 * @returns `false` se nada novo carregar em `timeoutMs` (fim dos resultados).
 */
export async function loadMorePosts(page: Page, timeoutMs: number): Promise<boolean> {
	const before = await countPosts(page)

	await scrollToLastPost(page)

	const loadMoreButton = await page.$(SELECTORS.loadMoreButton)
	if (loadMoreButton) await loadMoreButton.click().catch(() => {})

	try {
		await page.waitForFunction(
			(selectors, previous) => document.querySelectorAll(`${selectors.post}, ${selectors.postText}`).length > previous,
			{ timeout: timeoutMs },
			SELECTORS,
			before,
		)
		return true
	} catch {
		return false
	}
}

/** Leva o último post à tela para disparar o carregamento lazy (a busca rola dentro do `<main>`, não da janela). */
function scrollToLastPost(page: Page) {
	return page.evaluate(selectors => {
		const posts = document.querySelectorAll(`${selectors.post}, ${selectors.postText}`)

		posts[posts.length - 1]?.scrollIntoView({ block: 'end' })
		window.scrollTo(0, document.body.scrollHeight)
	}, SELECTORS)
}

function countPosts(page: Page) {
	return page.evaluate(selectors => document.querySelectorAll(`${selectors.post}, ${selectors.postText}`).length, SELECTORS)
}

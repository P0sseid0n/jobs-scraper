import type { Page } from 'puppeteer'

import { SELECTORS } from './linkedin/selectors'

export type ScrapedPost = {
	/** Valores (data-urn, ids, hrefs) de onde o URN do post é extraído com `resolvePostUrn`. */
	urnCandidates: string[]

	text: string
	author: string | null
}

const SCRAPED_ATTRIBUTE = 'data-jobs-scraped'

/**
 * Lê os posts ainda não coletados e os marca no DOM, para a paginação não depender da posição deles.
 * O callback roda no navegador: só pode usar os próprios argumentos.
 */
export function collectNewPosts(page: Page): Promise<ScrapedPost[]> {
	return page.evaluate(
		(selectors, scrapedAttribute) => {
			const results: { urnCandidates: string[]; text: string; author: string | null }[] = []

			// Posts compartilhados contêm o post original dentro: fica só com o card mais externo
			let containers = Array.from(document.querySelectorAll<HTMLElement>(selectors.post))
			containers = containers.filter(el => !el.parentElement?.closest(selectors.post))

			// Fallback: se o LinkedIn mudar o card de novo, ainda coletamos o texto (sem link)
			if (containers.length === 0) containers = Array.from(document.querySelectorAll<HTMLElement>(selectors.postText))

			for (const container of containers) {
				if (container.hasAttribute(scrapedAttribute)) continue

				const textElement = container.matches(selectors.postText)
					? container
					: container.querySelector<HTMLElement>(selectors.postText)
				const text = textElement?.innerText ?? ''

				// Card ainda carregando: tenta de novo na próxima rolagem
				if (!text.trim()) continue

				container.setAttribute(scrapedAttribute, '1')

				const urnCandidates = [
					container.getAttribute('data-urn') ?? '',
					...Array.from(container.querySelectorAll(selectors.postIdSources)).map(
						el => el.getAttribute('id') ?? el.getAttribute('href') ?? '',
					),
				].filter(Boolean)

				const author = Array.from(container.querySelectorAll<HTMLElement>(selectors.authorLink))
					.map(link => link.innerText.trim().split('\n')[0]?.trim())
					.find(Boolean)

				results.push({ urnCandidates, text, author: author || null })
			}

			return results
		},
		SELECTORS,
		SCRAPED_ATTRIBUTE,
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

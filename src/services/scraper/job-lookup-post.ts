import type { JobLookup, RawPost } from '@shared/contracts'

import { cleanPostText } from './linkedin/post-text'
import { canonicalJobUrl } from './linkedin/urls'

/** Texto da página da vaga e onde ela terminou de carregar (depois dos redirecionamentos). */
export type ListingPage = { url: string; text: string }

// O suficiente para cargo, empresa e requisitos; o resto da página costuma ser rodapé e vagas sugeridas
const MAX_PAGE_TEXT = 6_000
// Menos que isso não é a página de uma vaga
const MIN_PAGE_TEXT = 200

/**
 * Páginas de redirecionamento ("Redirecionando em 3…") e de verificação ("check you are not a robot"): a IA tomaria
 * o rodapé do site (ex.: o nome do agregador) como dados da vaga.
 */
const NOT_A_JOB_PAGE =
	/redirecionando|você será (levado|redirecionad)|redirecting|being redirected|not a robot|não (é|sou) um robô|captcha|verify you are human/i

/**
 * Monta o post que o post-processing vai ler: o cargo e o link da lista e o texto da página. Se a página não abriu
 * (ou é só um redirecionamento ou uma verificação), usa só as linhas do post sobre a vaga.
 */
export function lookupToRawPost(lookup: JobLookup, page: ListingPage | null): RawPost {
	const pageText = page ? cleanPostText(page.text).slice(0, MAX_PAGE_TEXT) : ''
	const body = isJobPageText(pageText) ? pageText : lookup.text

	return {
		postId: lookup.postId,
		text: [`Vaga: ${lookup.title}`, `Link: ${lookup.link}`, '', body].join('\n'),
		url: lookup.sourcePostUrl,
		// A vaga no LinkedIn com o endereço limpo; fora dele, o link curto do post (o destino pode ter rastreio)
		jobLink: (page && canonicalJobUrl(page.url)) ?? lookup.link,
		author: lookup.author,
		postedAt: lookup.postedAt,
		scrapedAt: new Date().toISOString(),
		sourcePostId: lookup.sourcePostId,
		attachedLink: null,
		// A página da vaga já traz a descrição em texto
		images: [],
	}
}

function isJobPageText(text: string) {
	return text.length >= MIN_PAGE_TEXT && !NOT_A_JOB_PAGE.test(text.slice(0, 500))
}

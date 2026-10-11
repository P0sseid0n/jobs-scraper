/** Campos de link de uma vaga salva antes da divisão entre o post e a candidatura. */
type LegacyJob = Partial<Record<'postId' | 'link' | 'sourcePostUrl' | 'postLink' | 'applyLink', unknown>> & Record<string, unknown>

const LINKEDIN_POST = /^https:\/\/www\.linkedin\.com\/feed\/update\//

/**
 * Divide o `link` antigo: era o post no LinkedIn quando o scraper achava o id do post e, sem ele, o link de
 * candidatura escrito no texto. Sem o link do post, ele é montado pelo `postId` quando este é um URN.
 */
export function legacyLinkFields(job: LegacyJob): { postLink: string | null; applyLink: string | null } {
	const link = stringOrNull(job.link)
	const isPostLink = link !== null && LINKEDIN_POST.test(link)
	const postId = stringOrNull(job.postId)

	return {
		postLink:
			stringOrNull(job.postLink) ??
			stringOrNull(job.sourcePostUrl) ??
			(isPostLink ? link : null) ??
			(postId?.startsWith('urn:li:') ? `https://www.linkedin.com/feed/update/${postId}/` : null),
		applyLink: stringOrNull(job.applyLink) ?? (isPostLink ? null : link),
	}
}

function stringOrNull(value: unknown) {
	return typeof value === 'string' && value ? value : null
}

import type { TokenLogprob } from 'ollama'

/**
 * Calcula a confiança (0-100) de que o post é uma vaga pela probabilidade que o modelo deu ao `postType` que gerou,
 * em vez de pedir um número ao modelo (modelos pequenos respondiam quase sempre o mesmo valor, ex.: 95).
 * A probabilidade do valor é o produto das probabilidades dos tokens que o formam. Quando o valor não é
 * `job_opening`, a chance de ser vaga é no máximo o que sobrou (`1 - p`).
 * @returns A confiança, ou `null` se não houver logprobs ou `postType` na resposta.
 */
export function jobConfidenceFromLogprobs(logprobs: TokenLogprob[] | undefined): number | null {
	if (!logprobs?.length) return null

	let text = ''
	const tokens = logprobs.map(({ token, logprob }) => {
		const start = text.length
		text += token
		return { start, end: text.length, logprob }
	})

	const match = /"postType"\s*:\s*"([^"]*)"/.exec(text)
	if (!match?.[1]) return null

	const valueEnd = match.index + match[0].length - 1
	const valueStart = valueEnd - match[1].length
	const logprob = tokens
		.filter(token => token.start < valueEnd && token.end > valueStart)
		.reduce((sum, token) => sum + token.logprob, 0)

	const probability = Math.exp(logprob)
	const jobProbability = match[1] === 'job_opening' ? probability : 1 - probability

	return Math.round(Math.min(Math.max(jobProbability, 0), 1) * 100)
}

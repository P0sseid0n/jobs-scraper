import { describe, expect, test } from 'bun:test'

import { jobConfidenceFromLogprobs } from './job-confidence'

/** Monta os logprobs de uma resposta a partir de pares [token, probabilidade]. */
function logprobs(...tokens: [string, number][]) {
	return tokens.map(([token, probability]) => ({ token, logprob: Math.log(probability) }))
}

describe('jobConfidenceFromLogprobs', () => {
	test('multiplica as probabilidades dos tokens do postType', () => {
		const response = logprobs(['{"', 1], ['postType', 1], ['":', 1], [' "', 1], ['job', 0.9], ['_opening', 0.8], ['",', 1])
		expect(jobConfidenceFromLogprobs(response)).toBe(72)
	})

	test('varia com a certeza do modelo', () => {
		const sure = logprobs(['{"postType": "', 1], ['job_opening', 0.99], ['", "title": null}', 1])
		const unsure = logprobs(['{"postType": "', 1], ['job_opening', 0.55], ['", "title": null}', 1])
		expect(jobConfidenceFromLogprobs(sure)).toBe(99)
		expect(jobConfidenceFromLogprobs(unsure)).toBe(55)
	})

	test('token que junta aspas e valor conta para o valor', () => {
		expect(jobConfidenceFromLogprobs(logprobs(['{"postType":', 1], [' "job', 0.7], ['_opening"', 1], ['}', 1]))).toBe(70)
	})

	test('ignora tokens dos outros campos', () => {
		const response = logprobs(['{"postType": "', 1], ['job_opening', 0.9], ['", "title": "', 1], ['Dev', 0.1], ['"}', 1])
		expect(jobConfidenceFromLogprobs(response)).toBe(90)
	})

	test('quando não é vaga, usa o que sobra da probabilidade', () => {
		expect(jobConfidenceFromLogprobs(logprobs(['{"postType": "', 1], ['job', 0.95], ['_seeker', 0.7], ['"}', 1]))).toBe(34)
		expect(jobConfidenceFromLogprobs(logprobs(['{"postType": "', 1], ['other', 0.98], ['"}', 1]))).toBe(2)
	})

	test('null sem logprobs ou sem postType', () => {
		expect(jobConfidenceFromLogprobs(undefined)).toBeNull()
		expect(jobConfidenceFromLogprobs([])).toBeNull()
		expect(jobConfidenceFromLogprobs(logprobs(['{"title": "Dev"}', 1]))).toBeNull()
	})
})

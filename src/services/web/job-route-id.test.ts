import { describe, expect, test } from 'bun:test'

import { isJobRouteId, jobRouteId, postIdCandidates } from './job-route-id'

const HASH = '85ed197bede636b1a8422b27f252a7c153c57461e2b0ff3122dd9f22958c35b6'

describe('jobRouteId', () => {
	test('tira o prefixo do LinkedIn', () => {
		expect(jobRouteId('urn:li:activity:7515393090820456448')).toBe('7515393090820456448')
		expect(jobRouteId('urn:li:ugcPost:7513342929290252288')).toBe('7513342929290252288')
		expect(jobRouteId('urn:li:groupPost:123-456')).toBe('123-456')
	})

	test('hash de vaga de lista fica igual', () => {
		expect(jobRouteId(HASH)).toBe(HASH)
	})
})

describe('isJobRouteId', () => {
	test('aceita o id curto e o postId inteiro (links antigos)', () => {
		expect(isJobRouteId('urn:li:activity:1', '1')).toBe(true)
		expect(isJobRouteId('urn:li:activity:1', 'urn:li:activity:1')).toBe(true)
		expect(isJobRouteId('urn:li:activity:1', '2')).toBe(false)
	})
})

describe('postIdCandidates', () => {
	test('id curto vira cada tipo de URN', () => {
		expect(postIdCandidates('1')).toEqual([
			'1',
			'urn:li:activity:1',
			'urn:li:ugcPost:1',
			'urn:li:share:1',
			'urn:li:groupPost:1',
		])
	})

	test('postId inteiro é buscado como está', () => {
		expect(postIdCandidates('urn:li:share:1')).toEqual(['urn:li:share:1'])
	})
})

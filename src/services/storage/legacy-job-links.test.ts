import { describe, expect, test } from 'bun:test'

import { legacyLinkFields } from './legacy-job-links'

const POST = 'https://www.linkedin.com/feed/update/urn:li:share:1/'

describe('legacyLinkFields', () => {
	test('o link do post no LinkedIn vira o postLink', () => {
		expect(legacyLinkFields({ postId: 'urn:li:share:1', link: POST })).toEqual({ postLink: POST, applyLink: null })
	})

	test('outro link é o de candidatura; sem URN, o post fica sem link', () => {
		expect(legacyLinkFields({ postId: 'hash', link: 'https://lnkd.in/abc' })).toEqual({
			postLink: null,
			applyLink: 'https://lnkd.in/abc',
		})
	})

	test('com URN, o link do post é montado mesmo quando o link salvo era o de candidatura', () => {
		expect(legacyLinkFields({ postId: 'urn:li:share:1', link: 'https://tally.so/r/x' })).toEqual({
			postLink: POST,
			applyLink: 'https://tally.so/r/x',
		})
	})

	test('vaga de um post com várias: o post de origem vira o postLink', () => {
		expect(legacyLinkFields({ postId: 'hash', link: 'https://lnkd.in/abc', sourcePostUrl: POST })).toEqual({
			postLink: POST,
			applyLink: 'https://lnkd.in/abc',
		})
	})

	test('rodar de novo não muda uma vaga já migrada', () => {
		expect(legacyLinkFields({ postId: 'hash', postLink: POST, applyLink: 'https://lnkd.in/abc' })).toEqual({
			postLink: POST,
			applyLink: 'https://lnkd.in/abc',
		})
	})
})

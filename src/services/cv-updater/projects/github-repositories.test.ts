import { describe, expect, test } from 'bun:test'

import { cleanReadme } from './github-repositories'

describe('repositórios do GitHub', () => {
	test('limpa o README', () => {
		expect(cleanReadme('# Título\n![badge](x.svg) Texto com [link](http://a) e <b>html</b>.')).toBe('Título Texto com link e html.')
	})
})

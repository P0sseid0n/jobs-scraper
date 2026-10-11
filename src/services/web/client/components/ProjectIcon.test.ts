import { expect, test } from 'bun:test'

import { projectIconSvg } from './ProjectIcon'

test('o favicon é o mesmo desenho de antes (fundo escuro e cursor verde-limão)', () => {
	expect(projectIconSvg()).toBe(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#141613"/><rect x="8" y="20" width="16" height="4" rx="1" fill="#c8f542"/></svg>',
	)
})

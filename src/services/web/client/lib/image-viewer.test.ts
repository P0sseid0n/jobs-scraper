import { describe, expect, test } from 'bun:test'

import { stepImage, swipeStep } from './image-viewer'

describe('stepImage', () => {
	test('avança e volta dando a volta nas pontas', () => {
		expect(stepImage(0, 1, 2)).toBe(1)
		expect(stepImage(1, 1, 2)).toBe(0)
		expect(stepImage(0, -1, 2)).toBe(1)
		expect(stepImage(0, 1, 1)).toBe(0)
	})
})

describe('swipeStep', () => {
	test('deslizar para a esquerda avança e para a direita volta', () => {
		expect(swipeStep(-80, 10)).toBe(1)
		expect(swipeStep(80, -10)).toBe(-1)
	})

	test('gesto curto ou vertical não troca de imagem', () => {
		expect(swipeStep(-20, 0)).toBe(0)
		expect(swipeStep(-60, 120)).toBe(0)
	})
})

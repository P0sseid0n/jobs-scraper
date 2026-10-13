import { expect, test } from 'bun:test'

import { cx } from './cx'

test('ignora os valores falsos', () => {
	expect(cx('card', false, null, undefined, 'job-card')).toBe('card job-card')
})

test('em conflito entre classes do Tailwind, vence a última', () => {
	expect(cx('inline-flex px-3.5 text-[13px]', 'hidden max-md:inline-flex')).toBe('px-3.5 text-[13px] hidden max-md:inline-flex')
	expect(cx('disabled:opacity-60', 'disabled:opacity-100')).toBe('disabled:opacity-100')
})

test('reconhece a escala de raios do projeto', () => {
	expect(cx('rounded-pill', 'rounded-[50%]')).toBe('rounded-[50%]')
})

test('mantém as classes próprias do styles.css', () => {
	expect(cx('pill', 'pill-row', 'grow')).toBe('pill pill-row grow')
})

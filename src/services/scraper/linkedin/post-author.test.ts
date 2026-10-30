import { describe, expect, test } from 'bun:test'

import { authorHeadline } from './post-author'

describe('authorHeadline', () => {
	test('acha o subtítulo entre o nome, o grau de conexão e a data do post (cabeçalho real, 2026)', () => {
		const lines = ['Ana S.', '', ' ', ' • 3º e +', '', 'Responsável  por Sistemas no Grupo ABC | MBA em Gestão de TI', '', 'há 4 h ']

		expect(authorHeadline(lines, 'Ana S.')).toBe('Responsável por Sistemas no Grupo ABC | MBA em Gestão de TI')
	})

	test('a página de uma empresa não tem subtítulo: os seguidores e a data ficam de fora', () => {
		expect(authorHeadline(['Next Commit', '', '11 seguidores', '', 'há 11 min '], 'Next Commit')).toBeNull()
		expect(authorHeadline(['Acme', 'Promovido'], 'Acme')).toBeNull()
	})

	test('no layout antigo o nome se repete no link, junto com o subtítulo', () => {
		const lines = ['Ana Souza', 'Ana Souza', '• 2nd', 'Tech Recruiter at Acme', '1 d • Editado •']

		expect(authorHeadline(lines, 'Ana Souza')).toBe('Tech Recruiter at Acme')
	})
})

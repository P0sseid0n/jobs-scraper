import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, mock, test } from 'bun:test'

import { setEnvCredentials } from '@shared/settings'

// A coleção `settings` em memória: o perfil, a busca e as credenciais passam pelos stores e schemas de verdade
const stored = new Map<string, { values: Record<string, unknown> }>()

mock.module('../../../shared/database/settings.model', () => ({
	Settings: {
		findById: (id: string) => ({ lean: async () => stored.get(id) ?? null }),
		updateOne: async ({ _id }: { _id: string }, document: { values: Record<string, unknown> }) => {
			stored.set(_id, document)
		},
	},
}))

const { setupStatus } = await import('./setup')
const { updateSettings } = await import('@shared/settings')

const noActiveCv = async () => null

afterEach(() => {
	stored.clear()
	setEnvCredentials({})
})

describe('/api/setup', () => {
	test('num banco vazio, nada está configurado e o onboarding abre', async () => {
		const status = await (await setupStatus({ skipOnboarding: false, cvTexFile: 'nao-existe.tex', findActiveCv: noActiveCv })).json()

		expect(status).toEqual({
			skipOnboarding: false,
			steps: { profile: false, linkedin: false, cv: false, discord: false, github: false },
			ready: false,
		})
	})

	test('o perfil só conta com área, cargo-alvo e um termo de busca ativo', async () => {
		await updateSettings('profile', { area: 'Enfermagem', targetRole: 'Enfermeiro' })
		await updateSettings('scraper', { searchTerms: [{ term: 'Enfermeiro', enabled: false }] })

		const options = { skipOnboarding: false, cvTexFile: 'nao-existe.tex', findActiveCv: noActiveCv }
		expect((await (await setupStatus(options)).json()).steps.profile).toBe(false)

		await updateSettings('scraper', { searchTerms: [{ term: 'Enfermeiro' }] })
		expect((await (await setupStatus(options)).json()).steps.profile).toBe(true)
	})

	test('pronto com perfil, LinkedIn (do .env também vale) e currículo; Discord e GitHub são opcionais', async () => {
		await updateSettings('profile', { area: 'Enfermagem', targetRole: 'Enfermeiro' })
		await updateSettings('scraper', { searchTerms: [{ term: 'Enfermeiro' }] })
		setEnvCredentials({ linkedin: { email: 'eu@exemplo.com', password: 'segredo' } })

		const status = await (
			await setupStatus({ skipOnboarding: true, cvTexFile: 'nao-existe.tex', findActiveCv: async () => ({ versionId: 'v1' }) })
		).json()

		expect(status).toEqual({
			skipOnboarding: true,
			steps: { profile: true, linkedin: true, cv: true, discord: false, github: false },
			ready: true,
		})
	})

	test('o currículo também conta pelo arquivo CV_TEX_FILE, mas não por uma pasta com o mesmo nome', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'setup-'))
		try {
			const file = path.join(dir, 'cv.tex')
			expect((await (await setupStatus({ skipOnboarding: false, cvTexFile: dir, findActiveCv: noActiveCv })).json()).steps.cv).toBe(
				false,
			)

			await writeFile(file, '\\section*{Experiência}')
			expect(
				(await (await setupStatus({ skipOnboarding: false, cvTexFile: file, findActiveCv: noActiveCv })).json()).steps.cv,
			).toBe(true)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})

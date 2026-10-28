import { stat } from 'node:fs/promises'
import type { Ollama } from 'ollama'

import { activeSearchTerms, isProfileComplete } from '@shared/contracts'
import { findActiveCvBase } from '@shared/database'
import type { Logger } from '@shared/logging'
import { readCredentialsStatus, readSettings } from '@shared/settings'

import { REQUIRED_SETUP_STEPS, type SetupStatus } from '../api-types'
import { HttpError } from './http'
import { suggestSearchSettings } from './search-suggestions'

type SetupOptions = {
	/** `SKIP_ONBOARDING` do `.env`. */
	skipOnboarding: boolean
	/** O `.tex` que o cv-updater usa quando nenhuma versão foi ativada pelo site (`CV_TEX_FILE`). */
	cvTexFile: string
	findActiveCv?: () => Promise<unknown>
}

/**
 * `GET /api/setup`: o que já está configurado (pelo site ou pelo `.env`) em cada passo do onboarding, e se o mínimo
 * para começar (perfil com termos de busca, LinkedIn e currículo) está pronto. Os campos de cada passo vêm das rotas
 * deles (`/api/settings/:key`, `/api/credentials`, `/api/cv-base`).
 */
export async function setupStatus({ skipOnboarding, cvTexFile, findActiveCv = findActiveCvBase }: SetupOptions) {
	const [profile, scraper, credentials, activeCv, cvFile] = await Promise.all([
		readSettings('profile'),
		readSettings('scraper'),
		readCredentialsStatus(),
		findActiveCv(),
		isFile(cvTexFile),
	])

	const steps: SetupStatus['steps'] = {
		profile: isProfileComplete(profile) && activeSearchTerms(scraper).length > 0,
		linkedin: credentials.linkedin.source !== null,
		cv: !!activeCv || cvFile,
		discord: credentials.discord.source !== null,
		github: credentials.github.source !== null,
		email: credentials.smtp.source !== null,
	}

	return Response.json({
		skipOnboarding,
		steps,
		ready: REQUIRED_SETUP_STEPS.every(step => steps[step]),
	} satisfies SetupStatus)
}

/**
 * `POST /api/setup/suggestions`: termos de busca e palavras-chave sugeridos pela IA para o perfil salvo, para a pessoa
 * revisar no onboarding (nada é salvo aqui). Se a IA falhar, sugere só o cargo-alvo (`fromAi: false`).
 */
export async function searchSuggestions(ai: { ollama: Ollama; model: string }, logger: Logger) {
	const profile = await readSettings('profile')
	if (!profile.area || !profile.targetRole) throw new HttpError(409, 'Salve a área e o cargo-alvo antes de pedir sugestões')

	return Response.json(await suggestSearchSettings(ai, { ...profile, area: profile.area, targetRole: profile.targetRole }, logger))
}

/** No Docker, um arquivo montado que não existia vira uma pasta vazia: só um arquivo de verdade conta. */
async function isFile(path: string) {
	try {
		return (await stat(path)).isFile()
	} catch {
		return false
	}
}

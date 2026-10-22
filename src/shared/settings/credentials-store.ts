import {
	CREDENTIAL_GROUPS,
	CREDENTIAL_SCHEMAS,
	credentialStatus,
	SECRET_FIELDS,
	type CredentialGroup,
	type Credentials,
	type CredentialsOf,
	type CredentialSource,
	type CredentialsStatus,
} from '../contracts/settings'
import { Settings } from '../database/settings.model'

const DOCUMENT_ID = 'credentials'

/** As credenciais do `.env` (guardadas por `setEnvCredentials`), usadas em cada grupo que o site não salvou. */
let envCredentials: Credentials = {}

export type LoadedCredentials<G extends CredentialGroup> = { value: CredentialsOf<G>; source: CredentialSource }

/** Guarda as credenciais do `.env` em memória (não vão para o banco). Chamada por `startService` ao subir. */
export function setEnvCredentials(credentials: Credentials) {
	envCredentials = credentials
}

/**
 * Lê as credenciais em uso de um grupo: as salvas pelo site; sem elas, as do `.env`; sem nenhuma, `null`.
 * Relida a cada uso, para valer o que foi salvo pelo site sem reiniciar o serviço.
 * @throws {Error} Se o grupo salvo no banco for inválido (a mensagem não traz os valores).
 */
export async function loadCredentials<G extends CredentialGroup>(group: G): Promise<LoadedCredentials<G> | null> {
	return resolveCredentials(group, await readStored())
}

/** O estado de todos os grupos, sem os segredos (ver `credentialStatus`). */
export async function readCredentialsStatus(): Promise<CredentialsStatus> {
	const stored = await readStored()

	return Object.fromEntries(
		CREDENTIAL_GROUPS.map(group => [group, credentialStatus(group, resolveCredentials(group, stored))]),
	) as CredentialsStatus
}

/**
 * Junta a alteração às credenciais em uso do grupo e valida o resultado inteiro. Campo ausente mantém o valor atual
 * (o site não conhece os segredos salvos); segredo opcional vazio (`""`) é apagado.
 * @throws {ZodError} Se o resultado for inválido.
 */
export async function mergeCredentials<G extends CredentialGroup>(group: G, patch: Record<string, unknown>) {
	const current = await loadCredentials(group)
	const secrets: readonly string[] = SECRET_FIELDS[group]
	const merged: Record<string, unknown> = { ...current?.value }

	for (const [field, value] of Object.entries(patch)) {
		if (value === undefined) continue
		if (value === '' && secrets.includes(field)) delete merged[field]
		else merged[field] = value
	}

	return CREDENTIAL_SCHEMAS[group].parse(merged) as CredentialsOf<G>
}

/**
 * Salva o grupo no banco (ver `mergeCredentials`); a partir daí ele vale no lugar do `.env`.
 * @throws {ZodError} Se o resultado for inválido; nesse caso nada é salvo.
 */
export async function saveCredentials<G extends CredentialGroup>(group: G, patch: Record<string, unknown>) {
	const value = await mergeCredentials(group, patch)
	const stored = await readStored()

	await Settings.updateOne({ _id: DOCUMENT_ID }, { values: { ...stored, [group]: value }, updatedAt: new Date() }, { upsert: true })
}

/** Apaga o grupo salvo pelo site; a partir daí vale o do `.env`, se houver. */
export async function deleteCredentials(group: CredentialGroup) {
	const { [group]: _removed, ...rest } = await readStored()

	await Settings.updateOne({ _id: DOCUMENT_ID }, { values: rest, updatedAt: new Date() }, { upsert: true })
}

async function readStored(): Promise<Record<string, unknown>> {
	const document = await Settings.findById(DOCUMENT_ID).lean()

	return document?.values ?? {}
}

function resolveCredentials<G extends CredentialGroup>(group: G, stored: Record<string, unknown>): LoadedCredentials<G> | null {
	if (stored[group] !== undefined) {
		const result = CREDENTIAL_SCHEMAS[group].safeParse(stored[group])
		if (!result.success) {
			const fields = result.error.issues.map(issue => issue.path.join('.')).join(', ')
			throw new Error(`Credenciais "${group}" inválidas no MongoDB (coleção settings, campos: ${fields}); salve de novo pelo site`)
		}

		return { value: result.data as CredentialsOf<G>, source: 'database' }
	}

	const fromEnv = envCredentials[group]
	return fromEnv ? { value: fromEnv as CredentialsOf<G>, source: 'env' } : null
}

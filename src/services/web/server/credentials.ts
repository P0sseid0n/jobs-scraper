import { z } from 'zod'

import { CREDENTIAL_GROUPS, type CredentialGroup } from '@shared/contracts'
import { deleteCredentials, mergeCredentials, readCredentialsStatus, saveCredentials } from '@shared/settings'

import { checkDiscord, checkGithub, checkSmtp } from './credential-checks'
import { HttpError } from './http'

const CredentialGroupSchema = z.enum(CREDENTIAL_GROUPS as [CredentialGroup, ...CredentialGroup[]])

type GroupRequest = Request & { params: { group: string } }

/** `GET /api/credentials`: de onde vem cada grupo e os campos públicos; dos segredos, só se estão preenchidos. */
export async function getCredentials() {
	return Response.json(await readCredentialsStatus())
}

/**
 * `PUT /api/credentials/:group`: salva o grupo no banco, juntando os campos enviados aos em uso (ver `mergeCredentials`).
 * Inválido → 400 com o erro de cada campo, nada é salvo. Devolve o estado de todos os grupos, sem os segredos.
 */
export async function putCredentials(req: GroupRequest) {
	await saveCredentials(parseGroup(req.params.group), await readPatch(req))

	return Response.json(await readCredentialsStatus())
}

/** `DELETE /api/credentials/:group`: apaga o grupo salvo pelo site; volta a valer o do `.env`, se houver. */
export async function removeCredentials(req: GroupRequest) {
	await deleteCredentials(parseGroup(req.params.group))

	return Response.json(await readCredentialsStatus())
}

/**
 * `POST /api/credentials/:group/test`: testa o Discord, o GitHub ou o SMTP com os campos enviados (sobre os em uso), sem salvar.
 * O LinkedIn não tem teste: um login a mais aumenta o risco de bloqueio da conta.
 */
export async function testCredentials(req: GroupRequest) {
	const group = parseGroup(req.params.group)
	if (group === 'linkedin') throw new HttpError(404, 'A conta do LinkedIn não tem teste: ela é usada na próxima coleta')

	const patch = await readPatch(req)
	if (group === 'discord') return Response.json(await checkDiscord(await mergeCredentials('discord', patch)))
	if (group === 'smtp') return Response.json(await checkSmtp(await mergeCredentials('smtp', patch)))

	return Response.json(await checkGithub(await mergeCredentials('github', patch)))
}

function parseGroup(value: string) {
	const group = CredentialGroupSchema.safeParse(value)
	if (!group.success) throw new HttpError(404, `Credenciais "${value}" não existem`)

	return group.data
}

/** Os campos enviados; corpo vazio vale como nenhum campo (ex.: testar as credenciais em uso). */
async function readPatch(req: Request) {
	const text = await req.text()
	if (!text.trim()) return {}

	let patch: unknown
	try {
		patch = JSON.parse(text)
	} catch {
		throw new HttpError(400, 'Corpo da requisição não é um JSON válido')
	}

	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, 'Envie um objeto com os campos a alterar')
	if (Object.values(patch).some(value => value !== undefined && typeof value !== 'string')) {
		throw new HttpError(400, 'Os campos das credenciais são texto')
	}

	return patch as Record<string, string>
}

import { AsyncLocalStorage } from 'node:async_hooks'
import { ZodError } from 'zod'

import { isDatabaseUnavailableError } from '@shared/database'
import { getSystemLocale, resolveLocale, setLocaleSource, t, type Locale } from '@shared/i18n'
import type { Logger } from '@shared/logging'

import type { ApiError } from '../api-types'

/** Erro com status HTTP e mensagem para mostrar na interface. */
export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message)
	}
}

/** Converte os erros do zod em `{ "campo.caminho": "mensagem" }` (a primeira mensagem de cada campo). */
export function fieldErrors(error: ZodError) {
	const fields: Record<string, string> = {}

	for (const issue of error.issues) {
		const path = issue.path.join('.') || '_'
		fields[path] ??= issue.message
	}

	return fields
}

const requestLocale = new AsyncLocalStorage<Locale>()
// Fora de uma requisição (os eventos das filas, os prazos dos pedidos), vale o idioma do sistema
setLocaleSource(() => requestLocale.getStore() ?? getSystemLocale())

/**
 * O idioma da requisição: o escolhido no site vem no `Accept-Language` (ver `request`, em `client/api.ts`). As
 * mensagens de erro e de validação saem nele.
 */
export function localeOf(req: Request) {
	const header = req.headers.get('Accept-Language') ?? ''
	return resolveLocale(
		header
			.split(',')
			.map(part => part.split(';')[0]!.trim())
			.filter(Boolean),
	)
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * O site não tem login: uma página de outro site aberta no mesmo navegador poderia disparar um POST sem corpo
 * ("coletar agora", "gerar currículo"). Requisições que alteram algo só são aceitas sem `Origin` ou da mesma origem.
 */
export function isCrossSiteWrite(req: Request) {
	if (SAFE_METHODS.has(req.method)) return false

	const origin = req.headers.get('Origin')
	return origin !== null && origin !== new URL(req.url).origin
}

/**
 * Envolve um handler: escritas vindas de outro site viram 403, erros de validação viram 400 com os campos,
 * `HttpError` vira o status dele, o MongoDB fora do ar vira 503 e o resto vira 500.
 */
export function handler<R extends Request>(logger: Logger, fn: (req: R) => Promise<Response> | Response) {
	return (req: R) => requestLocale.run(localeOf(req), () => handle(req))

	async function handle(req: R) {
		try {
			if (isCrossSiteWrite(req)) throw new HttpError(403, t().api.crossOrigin)

			return await fn(req)
		} catch (error) {
			if (error instanceof ZodError) {
				return Response.json({ error: t().api.invalidFields, fields: fieldErrors(error) } satisfies ApiError, {
					status: 400,
				})
			}
			if (error instanceof HttpError) {
				return Response.json({ error: error.message } satisfies ApiError, { status: error.status })
			}
			if (isDatabaseUnavailableError(error)) {
				logger.warn({ err: error, url: req.url, method: req.method }, 'MongoDB fora do ar')
				return Response.json({ error: t().api.databaseDown } satisfies ApiError, { status: 503 })
			}

			logger.error({ err: error, url: req.url, method: req.method }, 'Erro na API')
			return Response.json({ error: t().api.internal } satisfies ApiError, { status: 500 })
		}
	}
}

/** Lê o corpo JSON da requisição; corpo inválido vira 400. */
export async function readJson(req: Request): Promise<unknown> {
	try {
		return await req.json()
	} catch {
		throw new HttpError(400, t().api.invalidJson)
	}
}

/** Os parâmetros da query string como objeto (o último valor de cada chave). */
export function queryParams(req: Request) {
	return Object.fromEntries(new URL(req.url).searchParams)
}

/** Cursor de paginação opaco: data + id do último item da página (ordem: mais recentes primeiro). */
export type Cursor = { at: Date; id: string }

export function encodeCursor(cursor: Cursor) {
	return Buffer.from(JSON.stringify({ at: cursor.at.toISOString(), id: cursor.id })).toString('base64url')
}

/** @throws {HttpError} Se o cursor não veio desta API. */
export function decodeCursor(value: string): Cursor {
	try {
		const { at, id } = JSON.parse(Buffer.from(value, 'base64url').toString()) as { at: unknown; id: unknown }
		const date = new Date(String(at))

		if (Number.isNaN(date.getTime()) || typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) throw new Error()
		return { at: date, id }
	} catch {
		throw new HttpError(400, t().api.invalidCursor)
	}
}

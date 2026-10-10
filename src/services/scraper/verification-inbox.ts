/**
 * Recebe o código de verificação do login (fila `scraper-verification`) e o entrega ao login em andamento.
 * Só aceita códigos enquanto o login está esperando um; fora disso, o código é ignorado.
 */
let accepting = false
let latestCode: string | undefined

/** Passa a aceitar códigos (descarta qualquer um recebido antes). */
export function openVerificationInbox() {
	accepting = true
	latestCode = undefined
}

export function closeVerificationInbox() {
	accepting = false
	latestCode = undefined
}

/** @returns `false` se nenhum login está esperando um código. */
export function submitVerificationCode(code: string) {
	if (!accepting) return false

	latestCode = code
	return true
}

/** Retira o último código recebido, se houver. */
export function takeVerificationCode() {
	const code = latestCode
	latestCode = undefined

	return code
}

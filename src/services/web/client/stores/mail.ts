import { useEffect, useMemo } from 'react'

import type { WebMail, WebMailDraft, WebMailSetup } from '../../api-types'
import { api } from '../api'
import { createStore, useStore } from '../lib/store'
import { onLive } from './live'

const setup = createStore<WebMailSetup | null>(null)

/** As candidaturas por e-mail conhecidas, por `mailId` (as da API e as que chegam pelo stream). */
const mails = createStore(new Map<string, WebMail>())

/** Um envio terminado não volta a "enviando": o resultado pelo stream pode chegar antes da resposta do pedido. */
function upsert(mail: WebMail) {
	mails.set(current => {
		const known = current.get(mail.mailId)
		if (known && known.status !== 'sending' && mail.status === 'sending') return current

		return new Map(current).set(mail.mailId, mail)
	})
}

// Enviada, falhou ou pedida em outra aba
onLive('mail', upsert)

/**
 * Se o envio por e-mail está ligado; `null` enquanto carrega. Busca de novo a cada vez que um detalhe abre: a conta
 * pode ter sido salva em Configurações há pouco.
 */
export function useMailSetup() {
	useEffect(() => {
		api.mailSetup().then(
			next => setup.set(next),
			// Sem a resposta, os botões de envio não aparecem e o resto funciona igual
			() => setup.set(current => current ?? { enabled: false, from: null }),
		)
	}, [])

	return useStore(setup)
}

/** As candidaturas por e-mail da vaga, da mais recente à mais antiga; atualizadas pelo stream. */
export function useJobMails(postId: string) {
	useEffect(() => {
		api.jobMails(postId).then(
			list => mails.set(current => new Map([...current, ...list.map(mail => [mail.mailId, mail] as const)])),
			() => {},
		)
	}, [postId])

	const all = useStore(mails)
	return useMemo(
		() => [...all.values()].filter(mail => mail.postId === postId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
		[all, postId],
	)
}

/** Envia a candidatura (depois da confirmação na prévia); o envio registrado já aparece como "enviando". */
export async function sendApplication(postId: string, draft: WebMailDraft) {
	const mail = await api.sendMail(postId, draft)
	upsert(mail)

	return mail
}

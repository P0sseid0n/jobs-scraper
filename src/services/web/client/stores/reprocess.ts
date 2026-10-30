import type { WebJob, WebReprocessResult } from '../../api-types'
import { api, RequestError } from '../api'
import { REPORTABLE_FIELDS } from '../components/ReportJobDialog'
import { createStore, useStore } from '../lib/store'
import { replaceJob } from './jobs'
import { onLive } from './live'
import { notify } from './toast'

/** Os pedidos de "processar de novo" desta aba ainda sem resultado: o id do pedido de cada vaga. */
const pending = createStore(new Map<string, string>())

onLive('reprocess', result => {
	// A vaga atualizada vale em todas as abas; o aviso, só na que pediu
	if (result.job) replaceJob(result.job)
	if (pending.get().get(result.postId) !== result.reprocessId) return

	pending.set(current => {
		const next = new Map(current)
		next.delete(result.postId)
		return next
	})
	notifyResult(result)
})

/** Se a vaga está sendo processada de novo a pedido desta aba. */
export function useReprocessing(postId: string) {
	return useStore(pending).has(postId)
}

/** Pede para a vaga ser lida e extraída outra vez; o aviso vem quando o resultado chegar pelo stream. */
export async function reprocessJob(job: Pick<WebJob, 'postId'>) {
	try {
		const { reprocessId } = await api.reprocessJob(job.postId)
		pending.set(current => new Map(current).set(job.postId, reprocessId))
		notify('Vaga enviada para ser processada de novo: o aviso vem quando terminar')
	} catch (error) {
		notify(error instanceof RequestError ? error.message : 'Não consegui pedir para processar a vaga de novo', 'error')
	}
}

function notifyResult({ status, reason, keptFields }: WebReprocessResult) {
	if (status === 'updated') {
		const kept = keptFields.map(field => REPORTABLE_FIELDS[field])
		notify(kept.length > 0 ? `Vaga processada de novo; ficaram as suas correções em ${kept.join(', ')}` : 'Vaga processada de novo')
	} else if (status === 'discarded') {
		notify(`A vaga ficou como estava: a nova extração a descartaria (${reason})`, 'error')
	} else notify(`Não deu para processar a vaga de novo: ${reason}`, 'error')
}

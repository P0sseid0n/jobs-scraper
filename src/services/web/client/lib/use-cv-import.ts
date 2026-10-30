import { useEffect, useRef, useState } from 'react'

import { CV_IMPORT_PDF_MAX_BYTES, type CvForm } from '@shared/contracts'

import type { WebCvImport } from '../../api-types'
import { api, RequestError } from '../api'
import { onLive } from '../stores/live'
import { notify } from '../stores/toast'

// O resultado chega pelo stream; a consulta cobre o evento perdido (conexão caída, ou a resposta antes do id chegar)
const POLL_MS = 4_000

/** "2,5 MB" */
const megabytes = (bytes: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`

/**
 * Importa o currículo de um PDF: envia o arquivo, espera o cv-updater ler e entrega o formulário preenchido em
 * `onImported`, com o nome do arquivo (o nome da pessoa pode vir vazio: ela completa ao revisar). A falha vira um aviso.
 */
export function useCvImport(onImported: (form: CvForm, fileName: string) => void) {
	const [pending, setPending] = useState<{ importId: string | null; fileName: string } | null>(null)
	const callback = useRef(onImported)
	callback.current = onImported

	const importId = pending?.importId ?? null
	const fileName = pending?.fileName ?? ''

	useEffect(() => {
		if (!importId) return
		// O stream e a consulta podem trazer o mesmo resultado: só o primeiro vale
		let done = false

		function finish(result: WebCvImport) {
			if (done || result.importId !== importId || result.status === 'pending') return
			done = true

			setPending(null)
			if (result.form) callback.current(result.form, fileName)
			else notify(`Não consegui importar o PDF: ${result.error}`, 'error')
		}

		const stop = onLive('cvImport', finish)
		const timer = setInterval(async () => {
			try {
				finish(await api.cvImport(importId))
			} catch (error) {
				// O site reiniciou e perdeu a importação: não adianta esperar
				if (error instanceof RequestError && error.status === 404 && !done) {
					done = true
					setPending(null)
					notify(`Não consegui importar o PDF: ${error.message}`, 'error')
				}
			}
		}, POLL_MS)

		return () => {
			done = true
			stop()
			clearInterval(timer)
		}
	}, [importId])

	async function start(file: File) {
		if (file.size > CV_IMPORT_PDF_MAX_BYTES) {
			notify(`O PDF tem ${megabytes(file.size)}; o limite é ${megabytes(CV_IMPORT_PDF_MAX_BYTES)}.`, 'error')
			return
		}

		setPending({ importId: null, fileName: file.name })
		try {
			const started = await api.importCvPdf(file)
			setPending({ importId: started.importId, fileName: file.name })
		} catch (error) {
			setPending(null)
			notify(`Não consegui enviar o PDF: ${(error as Error).message}`, 'error')
		}
	}

	return { importing: pending !== null, start }
}

/** Quantos PDFs são desenhados ao mesmo tempo (a lista pode ter dezenas de currículos). */
const MAX_CONCURRENT = 2

/** Miniaturas já desenhadas (ou sendo), por PDF e largura: voltar à tela não baixa o PDF de novo. */
const cache = new Map<string, Promise<string>>()

let running = 0
const waiting: (() => void)[] = []

async function slot() {
	if (running >= MAX_CONCURRENT) await new Promise<void>(resolve => waiting.push(resolve))
	running++
}

function release() {
	running--
	waiting.shift()?.()
}

/**
 * A primeira página do PDF como imagem (URL de um blob) com `width` pixels de largura. O pdf.js só é carregado na
 * primeira miniatura; o worker dele vem de `/pdf.worker.mjs` (rota do servidor).
 */
export function pdfThumbnail(url: string, width: number) {
	const key = `${url} ${width}`
	let thumbnail = cache.get(key)

	if (!thumbnail) {
		thumbnail = render(url, width)
		cache.set(key, thumbnail)
		// Falhou (rede, PDF apagado): a próxima vez tenta de novo
		thumbnail.catch(() => cache.delete(key))
	}

	return thumbnail
}

async function render(url: string, width: number) {
	await slot()

	try {
		const pdfjs = await import('pdfjs-dist')
		pdfjs.GlobalWorkerOptions.workerSrc ||= '/pdf.worker.mjs'

		const loading = pdfjs.getDocument({ url })
		try {
			const pdf = await loading.promise
			const page = await pdf.getPage(1)
			const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
			const canvas = document.createElement('canvas')
			canvas.width = Math.ceil(viewport.width)
			canvas.height = Math.ceil(viewport.height)

			await page.render({ canvas, viewport }).promise

			const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
			if (!blob) throw new Error('Não consegui gerar a miniatura do PDF')

			return URL.createObjectURL(blob)
		} finally {
			await loading.destroy()
		}
	} finally {
		release()
	}
}

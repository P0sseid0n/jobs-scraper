import { describe, expect, test } from 'bun:test'

import { CV_IMPORT_PDF_MAX_BYTES, type CvFormDraft } from '@shared/contracts'
import { createLogger } from '@shared/logging'
import type { QueueClient } from '@shared/messaging'

import { CV_IMPORT_TIMEOUT_ERROR, CvImports, requestCvImport } from './cv-import'
import { CV_TIMEOUT_MS } from './cv-request.model'
import { HttpError } from './http'

const form: CvFormDraft = {
	contact: { name: '', headline: '', location: '', email: '', phone: '', links: [] },
	sections: [{ kind: 'education', title: '', entries: [{ course: 'Enfermagem', institution: 'USP', period: '' }] }],
}

describe('CvImports', () => {
	test('guarda o formulário lido; o nome pode vir vazio', () => {
		const imports = new CvImports()
		const importId = imports.start()

		expect(imports.get(importId)).toEqual({ importId, status: 'pending', form: null, error: null })
		expect(imports.finish({ importId, context: {}, form, error: null })).toEqual({ importId, status: 'done', form, error: null })
		expect(imports.get(importId)?.form).toEqual(form)
	})

	test('a falha guarda o motivo', () => {
		const imports = new CvImports()
		const importId = imports.start()
		const error = 'O PDF não tem texto selecionável (parece escaneado ou uma imagem).'

		expect(imports.finish({ importId, context: {}, form: null, error })).toMatchObject({ status: 'failed', form: null, error })
	})

	test('sem resposta no prazo, aparece como falha; bem depois, some', () => {
		const imports = new CvImports()
		const now = Date.now()
		const importId = imports.start(now)

		expect(imports.get(importId, now + CV_TIMEOUT_MS + 1)).toMatchObject({ status: 'failed', error: CV_IMPORT_TIMEOUT_ERROR })
		expect(imports.get(importId, now + 2 * CV_TIMEOUT_MS + 1)).toBeNull()
	})

	test('resposta de uma importação desconhecida é ignorada', () => {
		expect(new CvImports().finish({ importId: 'x', context: {}, form, error: null })).toBeNull()
	})
})

describe('requestCvImport', () => {
	const logger = createLogger('test')

	function deps() {
		const published: { queue: string; message: { importId: string; pdf: string; replyTo: { queue: string } } }[] = []
		const queue = { publish: async (name: string, message: never) => void published.push({ queue: name, message }) }
		return { imports: new CvImports(), queue: queue as unknown as QueueClient, logger, published }
	}

	const post = (body: BodyInit, headers: Record<string, string> = {}) =>
		new Request('http://localhost/api/cv-base/imports', { method: 'POST', body, headers })

	test('manda o PDF em base64 ao cv-updater e responde com a importação pendente', async () => {
		const { published, ...rest } = deps()
		const response = await requestCvImport(post(new Uint8Array([37, 80, 68, 70])), rest)
		const body = (await response.json()) as { importId: string; status: string }

		expect(response.status).toBe(202)
		expect(body.status).toBe('pending')
		expect(published).toEqual([
			{
				queue: 'cv-updater-import',
				message: expect.objectContaining({
					importId: body.importId,
					pdf: 'JVBERg==',
					replyTo: { queue: 'web-cv-import', context: {} },
				}),
			},
		])
	})

	test('recusa o corpo vazio e o PDF acima do limite, sem mandar ao cv-updater', async () => {
		const { published, ...rest } = deps()

		await expect(requestCvImport(post(new Uint8Array()), rest)).rejects.toThrow(new HttpError(400, 'Envie o PDF do currículo'))
		await expect(requestCvImport(post(new Uint8Array(CV_IMPORT_PDF_MAX_BYTES + 1)), rest)).rejects.toThrow(
			new HttpError(413, 'O PDF passa de 5 MB'),
		)
		expect(published).toEqual([])
	})
})

import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { extractPdfText, PdfImportError } from './pdf-text'

const asset = async (name: string) => new Uint8Array(await Bun.file(path.join(import.meta.dir, '../assets', name)).arrayBuffer())

/** Um PDF válido de uma página sem nada escrito, como o de um currículo escaneado (a imagem não tem texto). */
function blankPdf() {
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
	]
	let pdf = '%PDF-1.4\n'
	const offsets = objects.map((object, index) => {
		const offset = pdf.length
		pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
		return offset
	})
	const xref = pdf.length
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
	pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

	return new TextEncoder().encode(pdf)
}

describe('extractPdfText', () => {
	test('extrai o texto com as quebras de linha e os links clicáveis, sem os mailto:', async () => {
		const { text, links, pages } = await extractPdfText(await asset('cv.neutral.example.pdf'))

		expect(pages).toBe(1)
		expect(text).toContain('Maria Souza\nEnfermeira | COREN-SP 000.000')
		expect(text).toContain('• Suporte Básico de Vida (BLS) - 2022')
		expect(links).toEqual(['https://linkedin.com/in/maria'])
	})

	test('recusa o arquivo que não é PDF', async () => {
		const promise = extractPdfText(new TextEncoder().encode('Fulano da Silva, desenvolvedor'))
		await expect(promise).rejects.toThrow(new PdfImportError('O arquivo enviado não é um PDF.'))
	})

	test('recusa o PDF corrompido', async () => {
		const pdf = await asset('cv.example.pdf')
		await expect(extractPdfText(pdf.slice(0, 2000))).rejects.toThrow(/corrompido/)
	})

	test('recusa o PDF sem texto selecionável (escaneado)', async () => {
		await expect(extractPdfText(blankPdf())).rejects.toThrow(/não tem texto selecionável/)
	})
})

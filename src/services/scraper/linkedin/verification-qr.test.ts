import { describe, expect, test } from 'bun:test'
import { PNG } from 'pngjs'
import QRCode from 'qrcode'

import { decodeQrFromPng, renderQrForTerminal } from './verification-qr'

const CONTENT = 'https://www.linkedin.com/checkpoint/qr/abc123'

describe('decodeQrFromPng', () => {
	test('lê o conteúdo de um QR code na imagem', async () => {
		const png = await QRCode.toBuffer(CONTENT, { margin: 4, scale: 6 })

		expect(decodeQrFromPng(png)).toBe(CONTENT)
	})

	test('devolve null quando a imagem não tem QR code', () => {
		const blank = new PNG({ width: 200, height: 200 })
		blank.data.fill(255)

		expect(decodeQrFromPng(PNG.sync.write(blank))).toBeNull()
	})
})

describe('renderQrForTerminal', () => {
	test('desenha o QR code com caracteres de bloco', async () => {
		const rendered = await renderQrForTerminal(CONTENT)

		expect(rendered.split('\n').length).toBeGreaterThan(10)
		expect(rendered).toMatch(/[█▀▄]/)
	})
})

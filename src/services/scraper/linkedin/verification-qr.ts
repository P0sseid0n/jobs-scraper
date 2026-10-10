import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import QRCode from 'qrcode'

/**
 * Procura um QR code num screenshot (PNG) e devolve o conteúdo dele, ou `null` se não houver.
 * Ler da imagem não depende de seletores: funciona com qualquer layout da página de verificação.
 */
export function decodeQrFromPng(png: Uint8Array): string | null {
	const image = PNG.sync.read(Buffer.from(png))
	const pixels = new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.length)

	return jsQR(pixels, image.width, image.height)?.data || null
}

/** Desenha o QR code com caracteres de bloco, para ser escaneado direto do terminal (ou dos logs do Docker). */
export function renderQrForTerminal(content: string): Promise<string> {
	return QRCode.toString(content, { type: 'terminal', small: true })
}

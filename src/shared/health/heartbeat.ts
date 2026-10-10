import { stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** Arquivo que o serviço atualiza enquanto está saudável; o healthcheck do Docker confere a idade dele. */
export const HEARTBEAT_FILE = path.join(tmpdir(), 'jobs-scraper-heartbeat')

export const HEARTBEAT_INTERVAL_MS = 10_000

/** Sem atualização por esse tempo (algumas batidas perdidas), o serviço é considerado travado ou desconectado. */
export const HEARTBEAT_MAX_AGE_MS = 45_000

/**
 * Atualiza o heartbeat a cada `HEARTBEAT_INTERVAL_MS`, mas só quando `isHealthy()` é verdadeiro
 * (ex.: conectado ao RabbitMQ e ao MongoDB). Se o serviço perder a conexão ou o event loop travar, o arquivo envelhece.
 * @returns Função que para o heartbeat.
 */
export function startHeartbeat(isHealthy: () => boolean) {
	const beat = () => {
		if (isHealthy()) writeFile(HEARTBEAT_FILE, String(Date.now())).catch(() => {})
	}

	beat()
	const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS)
	timer.unref()

	return () => clearInterval(timer)
}

export function isHeartbeatFresh(modifiedAtMs: number, nowMs = Date.now()) {
	return nowMs - modifiedAtMs <= HEARTBEAT_MAX_AGE_MS
}

/** Lê o heartbeat; arquivo ausente (serviço ainda subindo ou nunca saudável) conta como não saudável. */
export async function checkHeartbeat() {
	try {
		const { mtimeMs } = await stat(HEARTBEAT_FILE)
		return isHeartbeatFresh(mtimeMs)
	} catch {
		return false
	}
}

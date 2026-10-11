import { describe, expect, test } from 'bun:test'

import { BrowserLock } from './browser-lock'

describe('BrowserLock', () => {
	test('roda uma tarefa por vez, na ordem, mesmo quando uma falha', async () => {
		const lock = new BrowserLock()
		const events: string[] = []

		const slow = lock.run(async () => {
			events.push('a:start')
			await Bun.sleep(20)
			events.push('a:end')
		})
		const failing = lock.run(async () => {
			events.push('b')
			throw new Error('falhou')
		})
		const last = lock.run(async () => {
			events.push('c')
			return 'ok'
		})

		await slow
		await expect(failing).rejects.toThrow('falhou')
		expect(await last).toBe('ok')
		expect(events).toEqual(['a:start', 'a:end', 'b', 'c'])
	})
})

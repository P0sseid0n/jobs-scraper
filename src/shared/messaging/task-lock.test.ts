import { describe, expect, test } from 'bun:test'

import { TaskLock } from './task-lock'

describe('TaskLock', () => {
	test('roda uma tarefa por vez, na ordem, mesmo quando uma falha', async () => {
		const lock = new TaskLock()
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

	test('a tarefa de prioridade passa à frente das comuns que esperam, sem interromper a que roda', async () => {
		const lock = new TaskLock()
		const events: string[] = []
		const task = (name: string) => async () => {
			events.push(name)
			await Bun.sleep(5)
		}

		await Promise.all([
			lock.run(task('rodando')),
			lock.run(task('comum 1')),
			lock.run(task('comum 2')),
			lock.run(task('prioridade 1'), { priority: true }),
			lock.run(task('prioridade 2'), { priority: true }),
		])

		expect(events).toEqual(['rodando', 'prioridade 1', 'prioridade 2', 'comum 1', 'comum 2'])
	})
})

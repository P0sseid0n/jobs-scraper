import { afterEach, expect, test } from 'bun:test'

import { EventHub, formatEvent } from './event-hub'

let hub: EventHub | undefined

afterEach(() => hub?.close())

test('formato SSE', () => {
	expect(formatEvent('cv', { a: 1 })).toBe('event: cv\ndata: {"a":1}\n\n')
})

test('repassa os eventos para quem está conectado e esquece quem desconectou', async () => {
	hub = new EventHub()
	const controller = new AbortController()
	const response = hub.subscribe(controller.signal)
	const reader = response.body!.getReader()
	const decoder = new TextDecoder()

	expect(response.headers.get('Content-Type')).toBe('text/event-stream')
	expect(decoder.decode((await reader.read()).value)).toBe('retry: 3000\n\n')

	hub.broadcast('cv', {
		requestId: 'r1',
		postId: 'p1',
		jobTitle: 'Dev',
		company: null,
		status: 'pending',
		fileName: null,
		error: null,
		changes: null,
		base: null,
		requestedAt: '2026-10-10T12:00:00.000Z',
		finishedAt: null,
	})
	expect(decoder.decode((await reader.read()).value)).toStartWith('event: cv\ndata: {"requestId":"r1"')
	expect(hub.size).toBe(1)

	controller.abort()
	expect(hub.size).toBe(0)
})

test('repassa o início e o fim das coletas como scraperRun', async () => {
	hub = new EventHub()
	const reader = hub.subscribe().body!.getReader()
	const decoder = new TextDecoder()
	await reader.read()

	const started = { runId: 'r1', phase: 'started', status: 'running', trigger: 'manual' } as const
	const finished = { runId: 'r1', phase: 'finished', status: 'failed', trigger: 'manual' } as const

	hub.broadcast('scraperRun', started)
	expect(decoder.decode((await reader.read()).value)).toBe(formatEvent('scraperRun', started))

	hub.broadcast('scraperRun', finished)
	expect(decoder.decode((await reader.read()).value)).toBe(formatEvent('scraperRun', finished))
})

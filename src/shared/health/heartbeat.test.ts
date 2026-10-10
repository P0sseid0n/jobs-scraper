import { describe, expect, test } from 'bun:test'

import { HEARTBEAT_MAX_AGE_MS, isHeartbeatFresh } from './heartbeat'

describe('isHeartbeatFresh', () => {
	const now = 1_000_000

	test('heartbeat recente é saudável', () => {
		expect(isHeartbeatFresh(now - 5_000, now)).toBe(true)
		expect(isHeartbeatFresh(now - HEARTBEAT_MAX_AGE_MS, now)).toBe(true)
	})

	test('heartbeat antigo não é saudável', () => {
		expect(isHeartbeatFresh(now - HEARTBEAT_MAX_AGE_MS - 1, now)).toBe(false)
	})
})

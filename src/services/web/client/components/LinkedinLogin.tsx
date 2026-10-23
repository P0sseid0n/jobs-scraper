import { useEffect, useState, type FormEvent } from 'react'

import type { LinkedinLoginState } from '../../api-types'
import { api } from '../api'
import { cx } from '../lib/cx'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { FieldHelp, FieldLabel } from './ui/Field'
import { Input } from './ui/Input'
import { Notice } from './ui/Notice'

const POLL_MS = 2_000
/** Sem o scraper pegar o pedido nesse tempo, provavelmente ele não está rodando. */
const STALLED_MS = 30_000
/** Um login de uma coleta que terminou há mais que isso não é mostrado: não tem a ver com o que a pessoa está fazendo. */
const RECENT_MS = 10 * 60_000

const ACTIVE = new Set<LinkedinLoginState['status']>(['pending', 'running', 'verification'])

/**
 * O teste do login do LinkedIn: pede ao scraper, acompanha o andamento a cada 2 s e entrega o código de verificação.
 * Também mostra uma verificação pedida no login de uma coleta, para ser resolvida pelo site.
 */
export function useLinkedinLogin() {
	const [state, setState] = useState<LinkedinLoginState | null>(null)
	const [startedAt, setStartedAt] = useState<number | null>(null)
	const [starting, setStarting] = useState(false)

	const active = starting || (!!state && ACTIVE.has(state.status))

	useEffect(() => {
		let alive = true
		const load = () =>
			api.linkedinLogin().then(
				value => alive && setState(value),
				() => {},
			)

		void load()
		// Parado, lê uma vez; em andamento, a cada 2 s
		const timer = active ? setInterval(load, POLL_MS) : undefined
		return () => {
			alive = false
			clearInterval(timer)
		}
	}, [active])

	async function start() {
		setStarting(true)
		setStartedAt(Date.now())
		try {
			setState(await api.testLinkedinLogin())
		} catch (error) {
			notify(`Não consegui pedir o teste: ${(error as Error).message}`, 'error')
		} finally {
			setStarting(false)
		}
	}

	const updatedAt = state ? Date.parse(state.updatedAt) : 0
	const visible =
		!!state && (ACTIVE.has(state.status) || (startedAt !== null && updatedAt >= startedAt) || Date.now() - updatedAt < RECENT_MS)
	const stalled = state?.status === 'pending' && !!state.requestedAt && Date.now() - Date.parse(state.requestedAt) > STALLED_MS

	return { state: visible ? state : null, active, stalled, start }
}

/** O andamento do login: esperando, entrando, a verificação pedida (QR, código, app), o sucesso ou a falha. */
export function LinkedinLoginStatus({ login }: { login: ReturnType<typeof useLinkedinLogin> }) {
	const { state, stalled } = login
	if (!state) return null

	if (state.status === 'pending' || state.status === 'running') {
		return (
			<div className="flex flex-col gap-2 animate-panel-in motion-reduce:animate-none" role="status">
				<p className="flex items-center gap-2 text-sm">
					<Icon name="spinner" />
					{state.status === 'pending' ? 'Esperando o scraper começar o teste…' : 'Entrando no LinkedIn…'}
				</p>
				{state.message && <FieldHelp>{state.message}</FieldHelp>}
				{stalled && (
					<Notice tone="warn" icon="alert">
						<p className="text-sm">
							O scraper ainda não pegou o pedido. Ele está rodando? Confira se o <code className="font-mono">bun dev</code> (ou
							o <code className="font-mono">docker compose --profile app up</code>) está ligado. O teste começa sozinho quando
							ele subir.
						</p>
					</Notice>
				)}
			</div>
		)
	}

	if (state.status === 'verification') return <Verification state={state} />

	return (
		<p
			role="status"
			className={cx(
				'flex items-start gap-2 text-sm animate-panel-in motion-reduce:animate-none',
				state.status === 'success' ? 'text-ok' : 'text-danger',
			)}
		>
			<Icon name={state.status === 'success' ? 'check' : 'alert'} className="mt-0.5" />
			<span>
				{state.status === 'success'
					? 'Tudo certo: conseguimos entrar no LinkedIn com a sua conta.'
					: 'Não deu para entrar no LinkedIn.'}
				{state.message && state.status === 'failed' && <span className="block text-muted">{state.message}</span>}
			</span>
		</p>
	)
}

/** A verificação pedida pelo LinkedIn, para resolver aqui mesmo. */
function Verification({ state }: { state: LinkedinLoginState }) {
	const [code, setCode] = useState('')
	const [sending, setSending] = useState(false)

	async function send(event: FormEvent) {
		event.preventDefault()
		setSending(true)
		try {
			await api.sendVerificationCode(code.trim())
			setCode('')
		} catch (error) {
			notify(`Não consegui enviar o código: ${(error as Error).message}`, 'error')
		} finally {
			setSending(false)
		}
	}

	return (
		<div className="flex flex-col gap-3 rounded-md bg-lime-soft p-4 animate-pop-in motion-reduce:animate-none" role="status">
			<p className="font-semibold">O LinkedIn quer confirmar que é você</p>

			{state.challenge === 'qr' && state.qrSvg && (
				<div className="flex flex-wrap items-center gap-4">
					{/* O SVG vem do servidor, desenhado pela biblioteca `qrcode` a partir do QR da página */}
					<div
						className="size-44 shrink-0 rounded-sm bg-white p-2 *:size-full"
						role="img"
						aria-label="QR code da verificação do LinkedIn"
						dangerouslySetInnerHTML={{ __html: state.qrSvg }}
					/>
					<FieldHelp className="max-w-70 text-ink">
						Abra o app do LinkedIn no celular, toque na lupa ou no ícone de QR code e aponte a câmera para este código.
					</FieldHelp>
				</div>
			)}

			{state.challenge === 'code' && (
				<form className="flex flex-col gap-1.5" onSubmit={send}>
					<FieldLabel htmlFor="linkedin-code">código que chegou no seu e-mail ou celular</FieldLabel>
					<div className="flex flex-wrap items-center gap-2.5">
						<Input
							id="linkedin-code"
							className="max-w-48 font-mono tracking-widest"
							inputMode="numeric"
							autoComplete="one-time-code"
							maxLength={10}
							value={code}
							onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
						/>
						<Button variant="lime" type="submit" disabled={code.length < 4 || sending}>
							{sending ? 'enviando…' : 'enviar código'}
						</Button>
					</div>
					{state.message && <FieldHelp>{state.message}</FieldHelp>}
				</form>
			)}

			{state.challenge === 'app-approval' && (
				<FieldHelp className="text-ink">
					Chegou um aviso no app do LinkedIn no seu celular. Abra e toque em “Sim, sou eu”. A gente continua sozinho depois.
				</FieldHelp>
			)}
		</div>
	)
}

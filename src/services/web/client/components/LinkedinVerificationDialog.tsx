import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { LinkedinLoginState } from '../../api-types'
import { api } from '../api'
import { cx } from '../lib/cx'
import {
	dismissLinkedinVerification,
	refreshLinkedinVerification,
	useLinkedinVerification,
	verificationKey,
	watchLinkedinVerification,
} from '../stores/linkedin-verification'
import { notify } from '../stores/toast'
import { DrawnCheck, Icon } from './Icon'
import { Button } from './ui/Button'
import { Dialog, DialogTitle } from './ui/Dialog'
import { FieldHelp, FieldLabel } from './ui/Field'
import { Input } from './ui/Input'
import { META } from './ui/text'

/**
 * A verificação pedida pelo LinkedIn, numa modal em qualquer tela (inclusive no onboarding): vem de um teste do login
 * ou de uma coleta que começou sozinha, e o scraper só espera alguns minutos. Fechada, só abre de novo numa verificação
 * nova; o passo do LinkedIn e Configurações › Contas têm o botão para reabrir.
 */
export function LinkedinVerificationDialog() {
	const { login, dismissed } = useLinkedinVerification()

	useEffect(() => watchLinkedinVerification(), [])

	const key = verificationKey(login)
	if (!login || !key || key === dismissed) return null

	// A chave remonta a modal numa verificação nova (código digitado, "já aprovei" e o showModal começam do zero)
	return <VerificationDialog key={key} login={login} />
}

function VerificationDialog({ login }: { login: LinkedinLoginState }) {
	const ref = useRef<HTMLDialogElement>(null)
	const remaining = useRemaining(login.expiresAt)

	// Depois do da modal (que abre e foca o primeiro botão, o fechar): no código, o foco vai para o campo
	useEffect(() => {
		ref.current?.querySelector('input')?.focus()
	}, [])

	return (
		<Dialog ref={ref} onClose={dismissLinkedinVerification}>
			<div className="flex flex-col gap-3 px-5 pt-4 pb-5">
				<DialogTitle closable>O LinkedIn quer confirmar que é você</DialogTitle>
				<p className="text-sm text-muted">
					{login.requestedAt
						? 'Para terminar o teste do login, confirme o acesso.'
						: 'A coleta de vagas precisa entrar na sua conta. Confirme o acesso para ela continuar.'}
				</p>

				{login.challenge === 'app-approval' && <AppApproval />}
				{login.challenge === 'code' && <CodeForm message={login.message} />}
				{login.challenge === 'qr' && login.qrSvg && <QrCode svg={login.qrSvg} />}

				{remaining !== null && (
					<div className="flex flex-col gap-2">
						<p className={cx(META, 'flex items-center gap-2')} role="timer">
							<Icon name="spinner" size={14} />
							{remaining > 0
								? `esperando a confirmação · faltam ${formatClock(remaining)}`
								: 'o tempo acabou: o LinkedIn não confirmou o acesso'}
						</p>
						<TimeBar remaining={remaining} />
					</div>
				)}
			</div>
		</Dialog>
	)
}

/** Aprovação no app do celular: o scraper percebe sozinho; "já aprovei" só confere na hora. */
function AppApproval() {
	const [checking, setChecking] = useState(false)
	const [checked, setChecked] = useState(false)

	async function check() {
		setChecking(true)
		await refreshLinkedinVerification()
		setChecking(false)
		setChecked(true)
	}

	return (
		<div className="flex flex-col gap-3 rounded-md bg-lime-soft p-4">
			<ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
				<li>Abra o app do LinkedIn no celular: chegou um aviso de acesso.</li>
				<li>Toque em “Sim, sou eu”.</li>
				<li>Pronto: a gente percebe sozinho e esta janela fecha.</li>
			</ol>
			<div className="flex flex-wrap items-center gap-2.5">
				<Button variant="lime" onClick={check} disabled={checking}>
					{checking ? 'conferindo…' : 'já aprovei'}
				</Button>
				{checked && !checking && (
					<FieldHelp className="text-ink">O LinkedIn ainda não avisou. Depois de aprovar, leva alguns segundos.</FieldHelp>
				)}
			</div>
		</div>
	)
}

/** O tempo que sobra para confirmar, numa barra que esvazia (e fica laranja no último quinto). */
function TimeBar({ remaining }: { remaining: number }) {
	// O prazo todo é o que faltava quando a modal abriu: o scraper não diz quando a verificação começou
	const [total] = useState(remaining)
	const fraction = total > 0 ? remaining / total : 0

	return (
		<div className="h-1 overflow-hidden rounded-pill bg-line" aria-hidden="true">
			<div
				className={cx(
					'h-full rounded-pill transition-all duration-1000 ease-linear motion-reduce:transition-none',
					fraction > 0.2 ? 'bg-lime-accent' : 'bg-warn',
				)}
				style={{ width: `${fraction * 100}%` }}
			/>
		</div>
	)
}

/**
 * Código que o LinkedIn mandou por e-mail, SMS ou app autenticador. O código que não deu para enviar faz o campo
 * tremer; o enviado ganha um check.
 */
function CodeForm({ message }: { message: string | null }) {
	const [code, setCode] = useState('')
	const [sending, setSending] = useState(false)
	const [shaking, setShaking] = useState(false)
	const [sent, setSent] = useState(false)

	async function send(event: FormEvent) {
		event.preventDefault()
		setSending(true)
		setSent(false)
		try {
			await api.sendVerificationCode(code.trim())
			setCode('')
			setSent(true)
		} catch (error) {
			setShaking(true)
			notify(`Não consegui enviar o código: ${(error as Error).message}`, 'error')
		} finally {
			setSending(false)
		}
	}

	return (
		<form className="flex flex-col gap-1.5 rounded-md bg-lime-soft p-4" onSubmit={send}>
			<FieldLabel htmlFor="linkedin-code">código que chegou no seu e-mail ou celular</FieldLabel>
			<div className="flex flex-wrap items-center gap-2.5">
				<Input
					id="linkedin-code"
					className={cx('max-w-48 font-mono tracking-widest', shaking && 'animate-shake motion-reduce:animate-none')}
					onAnimationEnd={() => setShaking(false)}
					inputMode="numeric"
					autoComplete="one-time-code"

					maxLength={10}
					value={code}
					onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
				/>
				<Button variant="lime" type="submit" disabled={code.length < 4 || sending}>
					{sending ? 'enviando…' : 'enviar código'}
				</Button>
				{sent && !code && (
					<span className="flex items-center gap-1.5 text-sm text-ok animate-pop-in motion-reduce:animate-none" role="status">
						<DrawnCheck />
						enviado
					</span>
				)}
			</div>
			{message && <FieldHelp>{message}</FieldHelp>}
		</form>
	)
}

function QrCode({ svg }: { svg: string }) {
	return (
		<div className="flex flex-wrap items-center gap-4 rounded-md bg-lime-soft p-4">
			{/* O SVG vem do servidor, desenhado pela biblioteca `qrcode` a partir do QR da página */}
			<div
				className="size-44 shrink-0 rounded-sm bg-white p-2 *:size-full"
				role="img"
				aria-label="QR code da verificação do LinkedIn"
				dangerouslySetInnerHTML={{ __html: svg }}
			/>
			<FieldHelp className="max-w-60 text-ink">
				Abra o app do LinkedIn no celular, toque na lupa ou no ícone de QR code e aponte a câmera para este código.
			</FieldHelp>
		</div>
	)
}

/** Milissegundos até o prazo da verificação, atualizados a cada segundo; `null` sem prazo. */
function useRemaining(expiresAt: string | null) {
	const [now, setNow] = useState(Date.now())

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1_000)
		return () => clearInterval(timer)
	}, [])

	return expiresAt ? Math.max(0, Date.parse(expiresAt) - now) : null
}

function formatClock(ms: number) {
	const seconds = Math.ceil(ms / 1_000)
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

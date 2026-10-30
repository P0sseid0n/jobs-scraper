import QRCode from 'qrcode'
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react'

import type { ShareCard } from '@shared/templates'

import tokens from '../../design-system/tokens.json'
import { cx } from '../lib/cx'
import { WORK_MODES } from '../lib/format'
import { Logo } from './Logo'

export type ShareCardTheme = 'light' | 'dark'

/** Post (4:5, o do feed) ou story (9:16, o do status e dos stories). */
export type ShareCardFormat = 'post' | 'story'

/** O tamanho do PNG em cada formato, em pixels: o card é desenhado nele e a imagem sai 1:1. */
export const SHARE_CARD_SIZES: Record<ShareCardFormat, { width: number; height: number }> = {
	post: { width: 1080, height: 1350 },
	story: { width: 1080, height: 1920 },
}

type Token = (typeof tokens.color.tokens)[number]

/** O valor do token no tema; uma referência a outro token (`{color-lime-text}`) vira a variável dele. */
function tokenValue(value: Token['value'], theme: ShareCardTheme) {
	const raw = typeof value === 'string' ? value : value[theme]
	return raw.replace(/^\{(.+)\}$/, 'var(--$1)')
}

/**
 * As cores do tema escolhido como variáveis no próprio card: as classes de cor (`bg-bg`, `text-muted`) leem delas, e o
 * card sai no tema da modal, não no do site (o escuro do site só vale no `<html>`).
 */
function themeVars(theme: ShareCardTheme) {
	return Object.fromEntries(tokens.color.tokens.map(token => [`--${token.name}`, tokenValue(token.value, theme)])) as CSSProperties
}

/** O QR code fica sempre escuro sobre o branco do tema claro: no escuro, invertido, nem toda câmera lê. */
const QR_INK = tokenValue(tokens.color.tokens.find(token => token.name === 'color-ink')!.value, 'light')
const QR_PAPER = tokenValue(tokens.color.tokens.find(token => token.name === 'color-surface')!.value, 'light')

/** O cargo diminui conforme o tamanho, para caber sem estourar o card; o mais longo ainda é cortado em 5 linhas. */
function titleSize(title: string) {
	if (title.length <= 24) return 'text-8xl'
	if (title.length <= 48) return 'text-7xl'
	if (title.length <= 80) return 'text-6xl'
	return 'text-5xl'
}

/** Só o domínio do link, embaixo da legenda do QR: quem lê sabe para onde vai antes de apontar a câmera. */
function linkHost(link: string) {
	return new URL(link).hostname.replace(/^www\./, '')
}

const BADGE = 'inline-flex items-center gap-4 rounded-pill border-2 px-7 py-3 font-mono text-3xl whitespace-nowrap'

type ShareJobCardProps = { card: ShareCard; theme: ShareCardTheme; format: ShareCardFormat; ref?: Ref<HTMLDivElement> }

/**
 * A imagem da vaga, no tamanho do PNG: só desenha os dados de `jobShareCard`, nas cores do tema e na fonte do site. Fica
 * fora da tela; a modal mostra o PNG gerado a partir dele.
 */
export function ShareJobCard({ card, theme, format, ref }: ShareJobCardProps) {
	const { width, height } = SHARE_CARD_SIZES[format]
	const details = card.contractTypes || card.workMode || card.location

	return (
		<div
			ref={ref}
			className={cx(
				'flex flex-col bg-bg font-sans text-ink antialiased',
				// No story, o topo e a base ficam livres para o que o app põe por cima (nome, barra de resposta)
				format === 'story' ? 'gap-16 px-22 py-60' : 'gap-12 p-22',
			)}
			style={{ ...themeVars(theme), width, height }}
		>
			<div className="flex items-center justify-between gap-10">
				<div className="flex items-center gap-6">
					<span className="rounded-pill bg-lime px-7 py-3 font-mono text-3xl font-medium text-lime-ink">vaga</span>
					{card.postedAt && <span className="font-mono text-2xl text-muted">{card.postedAt}</span>}
				</div>
				<Logo size="xl" className="text-muted" />
			</div>

			{/*
			 * O meio ocupa o que sobra. Com descrição, ela fica com o espaço livre; sem ela, os dados descem para o centro em
			 * vez de deixar um buraco
			 */}
			<div className={cx('flex min-h-0 grow flex-col gap-12', !card.description && 'justify-center')}>
				<div className="flex flex-col gap-6">
					<ClampedText
						text={card.title}
						lines={5}
						className={cx('leading-tight font-bold tracking-tight', titleSize(card.title))}
					/>
					{card.company && <ClampedText text={card.company} lines={2} className="text-5xl leading-tight text-muted" />}
				</div>

				{details && (
					<div className="flex flex-wrap gap-4">
						{card.contractTypes && <span className={cx(BADGE, 'border-line')}>{card.contractTypes}</span>}
						{card.workMode && (
							<span className={BADGE} style={{ borderColor: WORK_MODES[card.workMode.value].color }}>
								<span className="size-4 rounded-full" style={{ background: WORK_MODES[card.workMode.value].color }} />
								{card.workMode.label}
							</span>
						)}
						{card.location && <span className={cx(BADGE, 'max-w-full truncate border-line')}>{card.location}</span>}
					</div>
				)}

				{card.description && (
					<ClampedText text={card.description} className="min-h-0 grow basis-0 text-3xl leading-normal text-muted" />
				)}

				{card.skills.length > 0 && (
					<div className="flex flex-col gap-5">
						<span className="font-mono text-2xl text-muted">tecnologias</span>
						<div className="flex flex-wrap gap-4">
							{card.skills.map(skill => (
								<span key={skill} className="max-w-full truncate rounded-pill bg-surface-2 px-7 py-3 font-mono text-3xl">
									{skill}
								</span>
							))}
							{card.moreSkills > 0 && (
								<span className="rounded-pill px-4 py-3 font-mono text-3xl text-muted">+{card.moreSkills}</span>
							)}
						</div>
					</div>
				)}
			</div>

			{card.qr && (
				<div className="flex min-w-0 items-center gap-9 self-start rounded-lg border-2 border-line bg-surface p-7">
					<QrCode link={card.qr.link} />
					<div className="flex min-w-0 flex-col gap-2">
						<span className="text-4xl font-semibold">{card.qr.caption}</span>
						<span className="truncate font-mono text-2xl text-muted">{linkHost(card.qr.link)}</span>
					</div>
				</div>
			)}
		</div>
	)
}

/**
 * Texto cortado no fim de uma palavra, com "…", para caber em `lines` linhas ou, sem `lines`, na altura do próprio
 * elemento (a descrição, que fica com o espaço que sobra no card). O corte é medido aqui, não com `line-clamp`: o PNG
 * perde o `line-clamp` na cópia, e o texto sairia inteiro, estourando o card. Sem lugar para 2 linhas, o texto some.
 */
function ClampedText({ text, lines, className }: { text: string; lines?: number; className?: string }) {
	const ref = useRef<HTMLParagraphElement>(null)
	const [shown, setShown] = useState(text)

	useLayoutEffect(() => {
		const element = ref.current
		if (!element?.parentElement) return
		const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight)
		const max = lines ? lines * lineHeight : element.clientHeight
		if (max < 2 * lineHeight) return setShown('')

		// Uma cópia invisível, na mesma largura, para medir cada tentativa sem mexer no texto que o React desenha
		const probe = element.cloneNode() as HTMLElement
		Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', height: 'auto', width: `${element.clientWidth}px` })
		element.parentElement.append(probe)
		const fits = (candidate: string) => {
			probe.textContent = candidate
			return probe.scrollHeight <= max + 1
		}

		let result = text
		if (!fits(text)) {
			// Busca binária no número de palavras: o maior começo do texto que cabe com o "…"
			const words = text.split(/(?<=\s)/)
			let [low, high] = [0, words.length - 1]
			while (low < high) {
				const middle = Math.ceil((low + high) / 2)
				if (fits(ellipsis(words.slice(0, middle).join('')))) low = middle
				else high = middle - 1
			}
			result = low > 0 ? ellipsis(words.slice(0, low).join('')) : ''
		}
		probe.remove()
		setShown(result)
	})

	return (
		<p ref={ref} className={cx('m-0 overflow-hidden whitespace-pre-line wrap-break-word', className)}>
			{shown}
		</p>
	)
}

/** O começo do texto com "…", sem pontuação nem espaço antes dele. */
function ellipsis(start: string) {
	return `${start.replace(/[\s.,;:!?-]+$/, '')}…`
}

/** O QR code em SVG, desenhado aqui (sem pedir ao servidor), com a margem branca que a câmera precisa para achá-lo. */
function QrCode({ link }: { link: string }) {
	const { size, path } = useMemo(() => {
		const { modules } = QRCode.create(link, { errorCorrectionLevel: 'M' })
		let d = ''
		for (let y = 0; y < modules.size; y++) {
			for (let x = 0; x < modules.size; x++) if (modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`
		}
		return { size: modules.size, path: d }
	}, [link])

	return (
		<svg
			viewBox={`-2 -2 ${size + 4} ${size + 4}`}
			className="size-60 shrink-0 rounded-sm"
			shapeRendering="crispEdges"
			style={{ background: QR_PAPER }}
			aria-hidden="true"
		>
			<path d={path} fill={QR_INK} />
		</svg>
	)
}

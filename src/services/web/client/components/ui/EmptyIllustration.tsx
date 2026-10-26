import type { ReactNode } from 'react'

/**
 * Desenhos de traço dos estados vazios, num quadro de 120×88: o traço na cor do texto apagado e um detalhe em lime.
 * `search`: busca sem resultado; `jobs`: nenhuma vaga ainda; `cv`: nenhum currículo; `runs`: nenhuma coleta;
 * `lost`: página que não existe; `error`: não deu para carregar.
 */
export type EmptyIllustrationName = 'search' | 'jobs' | 'cv' | 'runs' | 'lost' | 'error'

/** Uma folha com linhas de texto, o elemento comum dos desenhos (vaga, post, currículo). */
function Sheet({ x, y, w = 44, h = 56, lines = 3 }: { x: number; y: number; w?: number; h?: number; lines?: number }) {
	return (
		<g>
			<rect x={x} y={y} width={w} height={h} rx={6} className="fill-surface" />
			{Array.from({ length: lines }, (_, index) => (
				<line key={index} x1={x + 8} x2={x + w - (index === lines - 1 ? 18 : 8)} y1={y + 14 + index * 9} y2={y + 14 + index * 9} />
			))}
		</g>
	)
}

const DRAWINGS: Record<EmptyIllustrationName, ReactNode> = {
	// Lupa sobre uma pilha de vagas, sem achar nada
	search: (
		<>
			<Sheet x={22} y={18} />
			<Sheet x={36} y={10} />
			<circle cx={78} cy={52} r={16} className="fill-lime-soft stroke-lime-accent" />
			<line x1={90} y1={64} x2={102} y2={76} className="stroke-lime-accent" strokeWidth={4} />
			<line x1={72} y1={52} x2={84} y2={52} className="stroke-lime-accent" />
		</>
	),
	// Uma caixa de entrada vazia esperando as vagas chegarem
	jobs: (
		<>
			<path d="M18 50 L30 22 H90 L102 50 V74 H18 Z" className="fill-surface" />
			<path d="M18 50 H42 L48 60 H72 L78 50 H102" />
			<circle cx={60} cy={12} r={5} className="fill-lime stroke-lime-accent" />
			<line x1={60} y1={20} x2={60} y2={36} strokeDasharray="3 4" />
		</>
	),
	// Um currículo em branco com o selo lime de "ajustado"
	cv: (
		<>
			<Sheet x={36} y={10} w={48} h={66} lines={4} />
			<circle cx={84} cy={64} r={13} className="fill-lime-soft stroke-lime-accent" />
			<path d="M78 64 l4 4 l8 -8" className="stroke-lime-accent" />
		</>
	),
	// O relógio da próxima coleta, com os posts esperando
	runs: (
		<>
			<Sheet x={14} y={24} w={36} h={46} />
			<circle cx={78} cy={46} r={26} className="fill-surface" />
			<path d="M78 30 V46 L90 54" className="stroke-lime-accent" strokeWidth={3} />
			<circle cx={78} cy={46} r={3} className="fill-lime stroke-lime-accent" />
		</>
	),
	// Uma placa de caminho com a seta para lugar nenhum
	lost: (
		<>
			<line x1={60} y1={30} x2={60} y2={80} />
			<path d="M30 16 H84 L94 26 L84 36 H30 Z" className="fill-lime-soft stroke-lime-accent" />
			<line x1={40} y1={26} x2={74} y2={26} className="stroke-lime-accent" />
			<line x1={44} y1={80} x2={76} y2={80} />
		</>
	),
	// Uma folha rasgada: algo não chegou
	error: (
		<>
			<path d="M34 10 H86 V44 L78 40 L70 46 L62 40 L54 46 L46 40 L34 44 Z" className="fill-surface" />
			<path d="M34 52 L46 48 L54 54 L62 48 L70 54 L78 48 L86 52 V78 H34 Z" className="fill-surface" />
			<line x1={42} y1={22} x2={78} y2={22} />
			<line x1={42} y1={31} x2={66} y2={31} />
			<circle cx={60} cy={65} r={6} className="fill-danger-bg stroke-danger" />
		</>
	),
}

/** O desenho de um estado vazio (decorativo: o título ao lado diz o que aconteceu). */
export function EmptyIllustration({ name }: { name: EmptyIllustrationName }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 120 88"
			className="mb-2 h-22 w-30 fill-none stroke-line-strong text-muted"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{DRAWINGS[name]}
		</svg>
	)
}

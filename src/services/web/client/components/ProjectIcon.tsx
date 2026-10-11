import { defineComponent } from 'vue'

// O desenho do ícone (viewBox 32×32): o fundo e o "cursor" do `jobs/scraper_`. Fonte única do header e do favicon.
const BACKGROUND = { width: 32, height: 32, rx: 8 }
const CURSOR = { x: 8, y: 20, width: 16, height: 4, rx: 1 }

// Cores fixas, iguais nos dois temas (no escuro, a borda do CSS separa o ícone do fundo)
const INK = '#141613'
const LIME = '#c8f542'

/** O ícone como arquivo SVG. */
export function projectIconSvg() {
	const rect = (attrs: Record<string, number | string>) =>
		`<rect ${Object.entries(attrs)
			.map(([name, value]) => `${name}="${value}"`)
			.join(' ')}/>`

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${rect({ ...BACKGROUND, fill: INK })}${rect({ ...CURSOR, fill: LIME })}</svg>`
}

/** Usa o ícone como favicon (o `index.html` não repete o desenho). */
export function setFavicon() {
	const link = document.createElement('link')
	link.rel = 'icon'
	link.type = 'image/svg+xml'
	link.href = `data:image/svg+xml,${encodeURIComponent(projectIconSvg())}`

	document.head.append(link)
}

/** O ícone do projeto, decorativo (o texto ao lado dá o nome). */
export const ProjectIcon = defineComponent({
	name: 'ProjectIcon',
	props: { size: { type: Number, default: 22 } },
	setup(props) {
		return () => (
			<svg class="project-icon" width={props.size} height={props.size} viewBox="0 0 32 32" aria-hidden="true">
				<rect {...BACKGROUND} fill={INK} />
				<rect {...CURSOR} fill={LIME} />
			</svg>
		)
	},
})

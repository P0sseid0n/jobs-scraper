import { defineComponent, type PropType } from 'vue'

/** Ícones de traço (24×24, stroke = currentColor). */
const PATHS = {
	search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-3.5-3.5',
	mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 7l9 6 9-6',
	external: 'M14 4h6v6 M20 4L10 14 M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
	file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5',
	copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
	check: 'M5 12l5 5 9-10',
	close: 'M6 6l12 12 M18 6L6 18',
	download: 'M12 4v12 M6 11l6 6 6-6 M5 20h14',
	moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
	sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
	back: 'M15 18l-6-6 6-6',
	alert: 'M12 3L2 20h20L12 3z M12 10v4 M12 17h.01',
	refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5',
	briefcase: 'M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
	settings:
		'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9L7 7 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1',
	filter: 'M4 6h16 M7 12h10 M10 18h4',
	trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
	plus: 'M12 5v14 M5 12h14',
	spinner: 'M21 12a9 9 0 1 1-6.2-8.6',
} as const

export type IconName = keyof typeof PATHS

export const Icon = defineComponent({
	name: 'Icon',
	props: {
		name: { type: String as PropType<IconName>, required: true },
		size: { type: Number, default: 16 },
	},
	setup(props) {
		return () => (
			<svg
				class={['icon', props.name === 'spinner' && 'spin']}
				width={props.size}
				height={props.size}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d={PATHS[props.name]} />
			</svg>
		)
	},
})

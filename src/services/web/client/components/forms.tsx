import { defineComponent, ref, type PropType } from 'vue'

import { Icon } from './Icon'

/** Interruptor liga/desliga (checkbox nativo, acessível pelo teclado). */
export const Switch = defineComponent({
	name: 'Switch',
	props: {
		checked: { type: Boolean, required: true },
		label: { type: String, required: true },
		id: { type: String },
		disabled: { type: Boolean, default: false },
		onChange: { type: Function as PropType<(value: boolean) => void>, required: true },
	},
	setup(props) {
		return () => (
			<input
				type="checkbox"
				role="switch"
				id={props.id}
				class="switch"
				aria-checked={props.checked}
				aria-label={props.label}
				checked={props.checked}
				disabled={props.disabled}
				onChange={(event: Event) => props.onChange((event.target as HTMLInputElement).checked)}
			/>
		)
	},
})

/** Campo de chips: digite e Enter (ou vírgula) para adicionar; Backspace no campo vazio remove o último. */
export const KeywordInput = defineComponent({
	name: 'KeywordInput',
	props: {
		id: { type: String, required: true },
		modelValue: { type: Array as PropType<string[]>, required: true },
		max: { type: Number, required: true },
		maxLength: { type: Number, default: 50 },
		invalid: { type: Boolean, default: false },
		describedBy: { type: String },
		'onUpdate:modelValue': { type: Function as PropType<(value: string[]) => void>, required: true },
	},
	setup(props) {
		const draft = ref('')
		const update = (value: string[]) => props['onUpdate:modelValue'](value)

		function add() {
			const words = draft.value
				.split(',')
				.map(word => word.trim().toLowerCase())
				.filter(Boolean)
			const next = [...props.modelValue]

			for (const word of words) {
				if (!next.includes(word) && next.length < props.max) next.push(word.slice(0, props.maxLength))
			}
			update(next)
			draft.value = ''
		}

		function onKeydown(event: KeyboardEvent) {
			if (event.key === 'Enter' || event.key === ',') {
				event.preventDefault()
				add()
			} else if (event.key === 'Backspace' && !draft.value && props.modelValue.length) {
				update(props.modelValue.slice(0, -1))
			}
		}

		return () => (
			<div class={['chips-input', props.invalid && 'invalid']}>
				{props.modelValue.map(word => (
					<span class="kchip mono" key={word}>
						{word}
						<button
							type="button"
							aria-label={`Remover ${word}`}
							onClick={() => update(props.modelValue.filter(item => item !== word))}
						>
							<Icon name="close" size={12} />
						</button>
					</span>
				))}
				<input
					id={props.id}
					value={draft.value}
					onInput={(event: Event) => (draft.value = (event.target as HTMLInputElement).value)}
					onKeydown={onKeydown}
					onBlur={add}
					placeholder={props.modelValue.length >= props.max ? `limite de ${props.max}` : 'digite e Enter'}
					disabled={props.modelValue.length >= props.max}
					maxlength={props.maxLength}
					aria-describedby={props.describedBy}
					aria-invalid={props.invalid}
				/>
			</div>
		)
	},
})

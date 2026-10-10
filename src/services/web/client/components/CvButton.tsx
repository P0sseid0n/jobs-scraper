import { defineComponent, ref, type PropType } from 'vue'

import type { WebJob } from '../../api-types'
import { cvPdfUrl } from '../api'
import { cvFor, requestCv } from '../stores/cv'
import { notify } from '../stores/toast'
import { Icon } from './Icon'

/** Ação de currículo da vaga, conforme o último pedido: gerar → gerando… → baixar, ou tentar de novo se falhou. */
export const CvButton = defineComponent({
	name: 'CvButton',
	props: {
		job: { type: Object as PropType<Pick<WebJob, 'postId'>>, required: true },
		size: { type: String as PropType<'sm' | 'lg'>, default: 'sm' },
	},
	setup(props) {
		const sending = ref(false)

		async function generate() {
			sending.value = true
			try {
				await requestCv(props.job)
			} catch (error) {
				notify(`Não consegui pedir o currículo: ${(error as Error).message}`, 'error')
			} finally {
				sending.value = false
			}
		}

		return () => {
			const cv = cvFor(props.job.postId)
			const cls = ['btn', props.size === 'lg' && 'btn-lg']

			if (cv?.status === 'ready') {
				return (
					<a class={[...cls, 'btn-lime']} href={cvPdfUrl(cv.requestId, true)} download={cv.fileName ?? undefined}>
						<Icon name="download" />
						baixar currículo
					</a>
				)
			}

			if (sending.value || cv?.status === 'pending') {
				return (
					<button type="button" class={[...cls, 'btn-lime']} disabled aria-live="polite">
						<Icon name="spinner" />
						gerando…
					</button>
				)
			}

			return (
				<button type="button" class={[...cls, 'btn-lime']} onClick={generate} title={cv?.error ?? undefined}>
					<Icon name={cv?.status === 'failed' ? 'refresh' : 'file'} />
					{cv?.status === 'failed' ? 'tentar de novo' : 'gerar currículo'}
				</button>
			)
		}
	},
})

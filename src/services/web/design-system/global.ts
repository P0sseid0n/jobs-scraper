// A entrada do bundle.js: os componentes de index.ts em window.JobsScraperUI
import * as ui from './index'

declare global {
	interface Window {
		JobsScraperUI: typeof ui
	}
}

window.JobsScraperUI = { ...ui }

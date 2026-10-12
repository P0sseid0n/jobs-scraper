import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { setFavicon } from './components/ProjectIcon'
import { loadCvRequests } from './stores/cv'
import { connectLive } from './stores/live'

import './stores/theme'
import './styles.css'

setFavicon()
connectLive()
void loadCvRequests()

createRoot(document.getElementById('app')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)

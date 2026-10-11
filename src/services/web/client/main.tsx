import './vue-flags'

import { createApp } from 'vue'

import { App } from './App'
import { setFavicon } from './components/ProjectIcon'
import { loadCvRequests } from './stores/cv'
import { connectLive } from './stores/live'

import './stores/theme'
import './styles.css'

setFavicon()
connectLive()
void loadCvRequests()

createApp(App).mount('#app')

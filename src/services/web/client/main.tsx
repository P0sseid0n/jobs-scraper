import './vue-flags'

import { createApp } from 'vue'

import { App } from './App'
import { loadCvRequests } from './stores/cv'
import { connectLive } from './stores/live'

import './stores/theme'
import './styles.css'

connectLive()
void loadCvRequests()

createApp(App).mount('#app')

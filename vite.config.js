import { defineConfig } from 'vite'

export default defineConfig({
  root: 'examples',
  // Les .env fra prosjektroten (ikke examples/), så VITE_MAPBOX_TOKEN plukkes opp
  envDir: '..',
  server: {
    port: 3030,
    open: true
  }
})

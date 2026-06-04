import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages 프로젝트 페이지는 https://<id>.github.io/<레포명>/ 하위에서 서빙된다.
// build 시 base 를 레포명으로 맞춰야 에셋(js/css) 경로가 맞는다. (dev 는 '/' 유지 → 프록시 정상)
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Asset-Management-Automated-Trading/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
}))

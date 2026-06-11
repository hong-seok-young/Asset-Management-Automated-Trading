import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 에셋 경로를 상대('./')로 빌드 → 어느 경로에서 서빙해도 맞는다.
//  · Render(루트 '/'): ./assets → /assets  ✅
//  · GitHub Pages(/<레포명>/ 하위): ./assets → /<레포명>/assets  ✅
// (HashRouter 라 라우팅은 # 뒤에서 처리 → 서버 경로 문제 없음. dev 는 '/' 유지 → 프록시 정상)
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
}))

import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Content-Security-Policy for production builds (desktop app and browser demo). Scripts may only
 * come from the app bundle, so injected HTML can never run code; network access is limited to
 * the AI providers and the GitHub releases API. Not applied to the dev server (Vite injects
 * inline scripts there). Styles allow inline attributes, which the editor and UI library use.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: app-image:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.openai.com https://api.groq.com https://api.github.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'hivemind-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})

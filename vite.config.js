import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/dixymediaupload/',
  server: {
    proxy: {
      '/generatePresignedUrl': {
        target: 'https://us-central1-digislidesapp.cloudfunctions.net',
        changeOrigin: true,
        secure: true,
        // function is deployed at root path /generatePresignedUrl
        rewrite: (path) => path.replace(/^\/generatePresignedUrl/, '/generatePresignedUrl'),
      },
      '/s3AuthGeneratePresignedUrl': {
        target: 'https://us-central1-digislidesapp.cloudfunctions.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/s3AuthGeneratePresignedUrl/, '/s3AuthGeneratePresignedUrl'),
      },
      '/uploadApi': {
        target: 'https://us-central1-digislidesapp.cloudfunctions.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/uploadApi/, '/uploadApi'),
      },
      '/writeAllMedia': {
        target: 'https://us-central1-digislidesapp.cloudfunctions.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/writeAllMedia/, '/writeAllMedia'),
      },
      '/readAllMedia': {
        target: 'https://us-central1-digislidesapp.cloudfunctions.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/readAllMedia/, '/readAllMedia'),
      },
      '/readAllStores': {
        target: 'https://us-central1-digislidesapp.cloudfunctions.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/readAllStores/, '/readAllStores'),
      },
      // Proxy S3 for signed GETs in dev to avoid browser CORS
      '/s3': {
        target: 'https://digisolutions-assets.s3.amazonaws.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/s3/, ''),
      },
    },
  },
})

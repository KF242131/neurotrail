import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleLiveAgentRequest } from './server/liveAgentGraph'
import { handleReportExportRequest } from './server/reportExport'

const workspaceCwd = process.env.NEUROTRAIL_WORKSPACE ?? process.cwd()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'neurotrail-agent-live',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const handled =
            (await handleReportExportRequest(req, res, workspaceCwd)) ||
            (await handleLiveAgentRequest(req, res, workspaceCwd))
          if (!handled) next()
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const handled =
            (await handleReportExportRequest(req, res, workspaceCwd)) ||
            (await handleLiveAgentRequest(req, res, workspaceCwd))
          if (!handled) next()
        })
      },
    },
    react(),
  ],
})

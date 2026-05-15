import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Portfolio } from './pages/Portfolio'
import { Detail } from './pages/Detail'
import { Settings } from './pages/Settings'
import { ToastContainer } from './components/Toast'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="detail/:symbol" element={<Detail />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
        <ToastContainer />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

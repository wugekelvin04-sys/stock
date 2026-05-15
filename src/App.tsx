import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Portfolio } from './pages/Portfolio'
import { Detail } from './pages/Detail'
import { Settings } from './pages/Settings'
import { Watchlist } from './pages/Watchlist'
import { Chat } from './pages/Chat'
import { ToastContainer } from './components/Toast'
import { ProtectedRoute } from './components/ProtectedRoute'

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
            <Route element={<ProtectedRoute />}>
              <Route path="portfolio" element={<Portfolio />} />
            </Route>
            <Route path="detail/:symbol" element={<Detail />} />
            <Route path="settings" element={<Settings />} />
            <Route path="watchlist" element={<Watchlist />} />
            <Route path="chat" element={<Chat />} />
          </Route>
        </Routes>
        <ToastContainer />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

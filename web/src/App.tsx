import { Route, Routes } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import FavoritesPage from '@/pages/FavoritesPage'
import HomePage from '@/pages/HomePage'
import PokemonDetailPage from '@/pages/PokemonDetailPage'

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/pokemon/:id" element={<PokemonDetailPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route
            path="*"
            element={
              <div className="py-24 text-center text-muted-foreground">
                Nothing here but tall grass.
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OnboardingDialog } from '@/components/OnboardingDialog'
import { signOut, useUser } from '@/lib/user'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `transition-colors hover:text-foreground ${isActive ? 'font-semibold text-foreground' : ''}`

export function Header() {
  const user = useUser()
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
        <NavLink to="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <span className="relative size-5 overflow-hidden rounded-full border-2 border-foreground bg-red-500 shadow-[inset_0_2.5px_0_rgba(255,255,255,0.45)]">
            <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background" />
          </span>
          My Pokédex
        </NavLink>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <NavLink to="/" end className={navLinkClass}>
            Browse
          </NavLink>
          <NavLink to="/favorites" className={navLinkClass}>
            Favorites
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Trainer <span className="font-medium text-foreground">{user.name}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setOnboardingOpen(true)}>
              <UserRound />
              Sign in
            </Button>
          )}
        </div>
      </div>
      <OnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen} />
    </header>
  )
}

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { setUser } from '@/lib/user'

export function OnboardingDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const mutation = useMutation({
    mutationFn: () => api.createUser(name.trim()),
    onSuccess: (user) => {
      setUser(user)
      onOpenChange(false)
      setName('')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Who's training today?</DialogTitle>
          <DialogDescription>
            Pick a name to keep your favorites. No password, no email — this
            Pokédex trusts you.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) mutation.mutate()
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ash"
            maxLength={60}
            autoFocus
          />
          {mutation.isError && (
            <p className="mt-2 text-sm text-destructive">{mutation.error.message}</p>
          )}
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Start catching'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

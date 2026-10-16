import { useSyncExternalStore } from 'react'
import type { UserView } from './types'

export interface StoredUser {
  id: string
  name: string
}

const STORAGE_KEY = 'pokedex.user'

function readStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredUser
    return parsed.id && parsed.name ? parsed : null
  } catch {
    return null
  }
}

// Tiny module store so every component sees the same user without context
// plumbing; useSyncExternalStore subscribes to it.
let current: StoredUser | null = readStoredUser()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getUser(): StoredUser | null {
  return current
}

export function setUser(user: UserView | StoredUser): void {
  current = { id: user.id, name: user.name }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  emit()
}

export function signOut(): void {
  current = null
  localStorage.removeItem(STORAGE_KEY)
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useUser(): StoredUser | null {
  return useSyncExternalStore(subscribe, getUser, getUser)
}

'use client'

import { createContext, useContext } from 'react'

const ThemeContext = createContext({ theme: 'light' as const, toggle: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: 'light', toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}

// Kept as null export so existing imports don't break
export function ThemeToggle({ className = '' }: { className?: string }) {
  return null
}

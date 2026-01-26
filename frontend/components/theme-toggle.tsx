"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

const storageKey = "kms-theme"

type Theme = "light" | "dark"

const getPreferredTheme = (): Theme => {
  if (typeof window === "undefined") {
    return "light"
  }

  const stored = window.localStorage.getItem(storageKey)
  if (stored === "light" || stored === "dark") {
    return stored
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") {
    return
  }

  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.style.colorScheme = theme
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light")

  useEffect(() => {
    const initial = getPreferredTheme()
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const handleToggle = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark"
      applyTheme(next)
      window.localStorage.setItem(storageKey, next)
      return next
    })
  }

  const isDark = theme === "dark"
  const label = isDark ? "Light mode" : "Dark mode"

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 rounded-full border-border/60 bg-background/80 shadow-sm backdrop-blur"
      onClick={handleToggle}
      aria-label={`Switch to ${label.toLowerCase()}`}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{isDark ? "Light" : "Dark"}</span>
    </Button>
  )
}

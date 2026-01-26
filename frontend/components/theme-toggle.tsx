"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

const storageKey = "kms-theme"

type Theme = "light" | "dark"
type ThemeSetting = Theme | "auto"

const getPreferredTheme = (): ThemeSetting => {
  if (typeof window === "undefined") {
    return "auto"
  }

  const stored = window.localStorage.getItem(storageKey)
  if (stored === "light" || stored === "dark" || stored === "auto") {
    return stored as ThemeSetting
  }

  return "auto"
}

const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") {
    return
  }

  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.style.colorScheme = theme
}

export function ThemeToggle() {
  const [setting, setSetting] = useState<ThemeSetting>("auto")
  const [resolvedTheme, setResolvedTheme] = useState<Theme>("light")

  useEffect(() => {
    const initial = getPreferredTheme()
    setSetting(initial)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    window.localStorage.setItem(storageKey, setting)
  }, [setting])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const resolveTheme = () =>
      setting === "auto" ? (media.matches ? "dark" : "light") : setting
    const update = (nextTheme?: Theme) => {
      const resolved = nextTheme ?? resolveTheme()
      setResolvedTheme(resolved)
      applyTheme(resolved)
    }
    update()
    if (setting !== "auto") {
      return
    }
    const handleChange = (event: MediaQueryListEvent) => {
      update(event.matches ? "dark" : "light")
    }
    if ("addEventListener" in media) {
      media.addEventListener("change", handleChange)
      return () => media.removeEventListener("change", handleChange)
    }
    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [setting])

  const handleToggle = () => {
    setSetting((current) => {
      const order: ThemeSetting[] = ["light", "dark", "auto"]
      const index = order.indexOf(current)
      return order[(index + 1) % order.length]
    })
  }

  const isDark = resolvedTheme === "dark"
  const isAuto = setting === "auto"
  const label = isAuto ? "Auto" : isDark ? "Dark mode" : "Light mode"
  const shortLabel = isAuto ? "Auto" : isDark ? "Dark" : "Light"

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 rounded-full border-border/60 bg-background/80 shadow-sm backdrop-blur"
      onClick={handleToggle}
      aria-label={`Theme: ${label.toLowerCase()}`}
    >
      {isAuto ? (
        <Monitor size={16} />
      ) : isDark ? (
        <Moon size={16} />
      ) : (
        <Sun size={16} />
      )}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel}</span>
    </Button>
  )
}

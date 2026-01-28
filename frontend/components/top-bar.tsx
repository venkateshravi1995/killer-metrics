"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  LineChart,
  LogOut,
  Search,
  Settings,
  Upload,
  User,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const navItems = [
  {
    href: "/",
    label: "Dashboards",
    icon: LayoutDashboard,
  },
  {
    href: "/metrics-search",
    label: "Metric catalog",
    icon: Search,
  },
  {
    href: "/settings/metrics-upload",
    label: "Upload metrics",
    icon: Upload,
  },
]

const pillGroupClass =
  "flex flex-wrap items-center gap-1 rounded-full border border-border/60 bg-background/80 px-1 shadow-sm backdrop-blur"

export function TopBar() {
  const pathname = usePathname()

  return (
    <header className="topbar shrink-0">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div
          className="flex items-center gap-3 animate-stagger"
          style={{ ["--delay" as string]: "40ms" }}
        >
          <span className="flex size-9 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
            <LineChart className="size-4" />
          </span>
          <div className="hidden sm:block">
            <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
              Venky's Killer Metrics
            </p>
            <span className="font-display text-base font-semibold">
              Workspace
            </span>
          </div>
        </div>

        <nav
          className={cn(pillGroupClass, "animate-stagger")}
          style={{ ["--delay" as string]: "120ms" }}
        >
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] transition",
                  isActive
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div
          className="flex items-center gap-2 animate-stagger"
          style={{ ["--delay" as string]: "200ms" }}
        >
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                className="gap-2 rounded-full shadow-sm"
                aria-label="Account menu"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-teal-400 text-[0.55rem] font-bold text-white">
                  VK
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">
                  Account
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Workspace
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/">
                    <LayoutDashboard className="size-4" />
                    Dashboards
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/metrics-upload">
                    <Upload className="size-4" />
                    Upload metrics
                    <DropdownMenuShortcut>CSV</DropdownMenuShortcut>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/metrics-search">
                    <Search className="size-4" />
                    Metric catalog
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Account
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/account/profile">
                    <User className="size-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account/settings">
                    <Settings className="size-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" asChild>
                <Link href="/auth/sign-out">
                  <LogOut className="size-4" />
                  Logout
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

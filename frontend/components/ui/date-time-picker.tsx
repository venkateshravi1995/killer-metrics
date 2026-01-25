"use client"

import * as React from "react"
import { endOfDay, format, isValid, startOfDay } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import { Button } from "./button"
import { Calendar } from "./calendar"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

type DateTimePickerProps = {
  value?: Date
  onChange: (value?: Date) => void
  placeholder?: string
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  defaultTime?: string
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }
  return { hours, minutes }
}

function clampDate(value: Date, minDate?: Date, maxDate?: Date) {
  if (minDate && value < minDate) {
    return new Date(minDate)
  }
  if (maxDate && value > maxDate) {
    return new Date(maxDate)
  }
  return value
}

function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date and time",
  disabled,
  minDate,
  maxDate,
  defaultTime = "00:00",
}: DateTimePickerProps) {
  const [time, setTime] = React.useState(() =>
    value && isValid(value) ? format(value, "HH:mm") : defaultTime
  )

  React.useEffect(() => {
    if (value && isValid(value)) {
      setTime(format(value, "HH:mm"))
      return
    }
    setTime(defaultTime)
  }, [value, defaultTime])

  const handleSelect = (date?: Date) => {
    if (!date) {
      onChange(undefined)
      return
    }
    const next = new Date(date)
    const parsed = parseTime(time)
    if (parsed) {
      next.setHours(parsed.hours, parsed.minutes, 0, 0)
    }
    onChange(clampDate(next, minDate, maxDate))
  }

  const handleTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    setTime(nextValue)
    if (!value) {
      return
    }
    const parsed = parseTime(nextValue)
    if (!parsed) {
      return
    }
    const next = new Date(value)
    next.setHours(parsed.hours, parsed.minutes, 0, 0)
    onChange(clampDate(next, minDate, maxDate))
  }

  const disabledDate = (date: Date) => {
    if (minDate && date < startOfDay(minDate)) {
      return true
    }
    if (maxDate && date > endOfDay(maxDate)) {
      return true
    }
    return false
  }

  const formatted = value && isValid(value) ? format(value, "PP p") : ""

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full min-w-0 justify-start gap-2 overflow-hidden text-left font-normal",
            !formatted && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {formatted || placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="rounded-md border border-border/60 bg-background">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleSelect}
            disabled={disabledDate}
            initialFocus
          />
          <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
            <span className="text-xs text-muted-foreground">Time</span>
            <Input
              type="time"
              step={60}
              value={time}
              onChange={handleTimeChange}
              className="h-8 w-[140px]"
            />
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(undefined)}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DateTimePicker }

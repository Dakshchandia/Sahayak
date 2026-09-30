"use client"

import * as React from "react"

// react-day-picker removed — SAHAYAK uses a custom calendar grid in
// components/checkin-calendar.tsx. This stub keeps Shadcn imports happy.

export type CalendarProps = {
  className?: string
  selected?: Date
  onSelect?: (date: Date | undefined) => void
  mode?: string
  showOutsideDays?: boolean
  [key: string]: unknown
}

function Calendar({ className }: CalendarProps) {
  return (
    <div className={className}>
      {/* Calendar stub — use CheckInCalendar for full calendar functionality */}
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }

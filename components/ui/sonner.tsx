"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      // Above the task dialog (z-101). A toast that carries an action — "Mark
      // reached" after the last task closes — is raised from inside that
      // dialog, so at any lower layer the dialog swallows the click: the
      // button is visible but cannot be pressed.
      style={
        {
          zIndex: 200,
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      // `pointer-events-auto` is needed because the toast list itself is
      // click-through: without it a toast's action button is visible but
      // unpressable whenever a dialog sits beneath it, which is exactly the
      // case for the "Mark reached" prompt raised from inside a task card.
      toastOptions={{
        classNames: {
          toast: "cn-toast pointer-events-auto",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

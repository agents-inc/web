import { Outlet } from "@tanstack/react-router"

import { NavRail } from "@/components/nav-rail"

/**
 * The three-column shell: nav rail · main · roster.
 *
 * The *page* scrolls, not the middle column — both side columns are sticky and
 * full height, which is what makes their vertical dividers read as continuous
 * rules rather than as the edges of three separate panels. `items-start` is
 * what lets them be sticky at all; stretching them would make `top-0` inert.
 *
 * The layout is desktop-only by design, with a hard `min-w` below which the
 * page scrolls horizontally rather than reflowing. Responsive behaviour under
 * 1324px is explicitly not designed yet.
 *
 * The route component supplies the remaining two columns, so Docs/Share can
 * span both where Configure fills them separately.
 */
export function RootLayout() {
  return (
    <div className="mx-auto grid max-w-[102.75rem] min-w-[82.75rem] grid-cols-[9.5rem_minmax(43.75rem,1fr)_16.25rem] items-start bg-page">
      <NavRail />
      <Outlet />
    </div>
  )
}

/** Docs, Share and Settings are deliberately undesigned — routes exist, content does not. */
function Placeholder({ title }: { title: string }) {
  return (
    <main className="col-span-2 grid h-svh place-items-center bg-column">
      <p className="font-mono text-11 font-semibold tracking-[.16em] text-muted-foreground uppercase">
        {title}
      </p>
    </main>
  )
}

export function DocsScreen() {
  return <Placeholder title="Docs" />
}

export function ShareScreen() {
  return <Placeholder title="Share" />
}

export function SettingsScreen() {
  return <Placeholder title="Settings" />
}

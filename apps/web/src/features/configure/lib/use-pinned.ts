import { useEffect, useState, type RefObject } from "react"

/**
 * Is this `position: sticky` element currently pinned at its offset?
 *
 * CSS has no selector for it, and the design needs one twice: the filter bar
 * changes shape once it reaches the page top, and a domain header draws a
 * bottom rule only while it is holding the top of the column.
 *
 * Detection reads the element's own rect against its resolved `top`. Sticky
 * clamps `rect.top` to that offset while pinned and leaves it larger before, so
 * the comparison is exact. The `bottom` guard handles the far edge: once the
 * section scrolls past, the next one pushes this header up out of its offset
 * and it is no longer holding the top.
 */
const isPinned = (element: HTMLElement) => {
  const offset = parseFloat(getComputedStyle(element).top) || 0
  const { top, bottom } = element.getBoundingClientRect()
  return top <= offset + 0.5 && bottom > offset
}

const observe = (update: () => void) => {
  update()
  window.addEventListener("scroll", update, { passive: true })
  window.addEventListener("resize", update)
  return () => {
    window.removeEventListener("scroll", update)
    window.removeEventListener("resize", update)
  }
}

/**
 * Pinned state as React state. Only for elements whose *own* markup changes —
 * a re-render is the point. Do not reach for this to style anything outside the
 * calling component; see `usePinnedAttribute`.
 */
export function usePinned(ref: RefObject<HTMLElement | null>) {
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    return observe(() => setPinned(isPinned(element)))
  }, [ref])

  return pinned
}

/**
 * Pinned state as a `data-pinned` attribute, written straight to the DOM.
 *
 * There are up to nine domain headers, each holding a grid of skill cells.
 * routing their pinned state through React state re-rendered every cell beneath
 * them on a property that only a border depends on — measured at an **88ms
 * blocking task with 240 cells on screen** (39ms at 97, none at 18), which is
 * what made the sticky transition look like it jumped rather than eased.
 *
 * Writing the attribute costs nothing and lets CSS do the styling, so the
 * scroll handler never touches the React tree. The write is guarded so an
 * unchanged value does not dirty style.
 */
export function usePinnedAttribute(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    return observe(() => {
      const pinned = isPinned(element)
      if (pinned !== (element.dataset.pinned !== undefined)) {
        if (pinned) element.dataset.pinned = ""
        else delete element.dataset.pinned
      }
    })
  }, [ref])
}

/**
 * The filter bar publishes its pinned state to the document root so the domain
 * headers can re-pin beneath it (87px → 51px) in pure CSS. A store field would
 * have put every subscriber back into the render path this exists to avoid.
 */
export const BAR_STUCK_ATTRIBUTE = "data-bar-stuck"

export function useBarStuckAttribute(stuck: boolean) {
  useEffect(() => {
    const root = document.documentElement
    if (stuck) root.setAttribute(BAR_STUCK_ATTRIBUTE, "")
    else root.removeAttribute(BAR_STUCK_ATTRIBUTE)
    return () => root.removeAttribute(BAR_STUCK_ATTRIBUTE)
  }, [stuck])
}

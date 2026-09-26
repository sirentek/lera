// Holo panel hide/show choreography. Web Animations, not CSS keyframes: the
// blanket prefers-reduced-motion rule in styles.css flattens every CSS
// animation, and RDP sessions always report `reduce` — WAAPI is untouched by it.
// Environments without Element.animate (jsdom) skip straight to the end state.

type Side = 'left' | 'right'

const LINE = 0.012

const origin = (side: Side) => (side === 'left' ? '0% 50%' : '100% 50%')

// Every filter keyframe carries the same function list so Chrome interpolates
// it instead of snapping. The bloom takes the theme's own glow colour — plain
// brightness pushes the holo red toward silver-white.
const glow = (element: HTMLElement) =>
  getComputedStyle(element).getPropertyValue('--holo-glow-1').trim() || 'rgb(255 90 60)'

const bloom = (color: string, brightness: number, blur: number) =>
  `brightness(${brightness}) drop-shadow(0 0 ${blur}px ${blur ? color : 'transparent'})`

const canAnimate = (element: HTMLElement | null): element is HTMLElement =>
  !!element && typeof element.animate === 'function'

/** Flicker, fold into a hot scan line, then streak off toward the restore tab. */
export function playHoloCollapse(element: HTMLElement | null, side: Side, onDone: () => void) {
  if (!canAnimate(element)) {
    onDone()

    return
  }

  const drift = side === 'left' ? -1 : 1
  const color = glow(element)

  const animation = element.animate(
    [
      { offset: 0, transform: 'translateX(0px) scale(1, 1)', filter: bloom(color, 1, 0), opacity: 1 },
      { offset: 0.1, transform: 'translateX(0px) scale(1.015, 1)', filter: bloom(color, 1.35, 6) },
      { offset: 0.16, transform: `translateX(${-3 * drift}px) scale(1.015, 1)`, opacity: 0.45 },
      { offset: 0.22, transform: `translateX(${2 * drift}px) scale(1, 1)`, opacity: 1, filter: bloom(color, 1.15, 4) },
      { offset: 0.3, opacity: 0.7 },
      { offset: 0.36, transform: 'translateX(0px) scale(1, 1)', opacity: 1, easing: 'cubic-bezier(0.7, 0, 0.2, 1)' },
      { offset: 0.62, transform: `translateX(0px) scale(1, ${LINE})`, filter: bloom(color, 1.5, 10), easing: 'ease-in' },
      { offset: 1, transform: `translateX(0px) scale(0, ${LINE})`, filter: bloom(color, 1.6, 14), opacity: 0.2 }
    ],
    { duration: 460, fill: 'forwards' }
  )

  element.style.transformOrigin = origin(side)
  element.style.pointerEvents = 'none'

  animation.finished
    .catch(() => undefined)
    .then(() => {
      onDone()
      // The panel is hidden by now; drop the held end frame so a later show
      // starts clean.
      animation.cancel()
      element.style.removeProperty('transform-origin')
      element.style.removeProperty('pointer-events')
    })
}

/** Reverse boot: a line shoots out of the tab's edge, unfolds, then stabilises. */
export function playHoloExpand(element: HTMLElement | null, side: Side) {
  if (!canAnimate(element)) {
    return
  }

  const color = glow(element)
  element.style.transformOrigin = origin(side)

  element
    .animate(
      [
        { offset: 0, transform: `translateX(0px) scale(0, ${LINE})`, filter: bloom(color, 1.6, 14), opacity: 0.3 },
        {
          offset: 0.3,
          transform: `translateX(0px) scale(1, ${LINE})`,
          filter: bloom(color, 1.5, 10),
          opacity: 1,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
        },
        { offset: 0.62, transform: 'translateX(0px) scale(1, 1.03)', filter: bloom(color, 1.25, 6) },
        { offset: 0.7, transform: 'translateX(0px) scale(1, 0.99)', opacity: 0.5 },
        { offset: 0.76, opacity: 1 },
        { offset: 0.84, transform: 'translateX(2px) scale(1, 1)', opacity: 0.75, filter: bloom(color, 1.15, 4) },
        { offset: 0.9, transform: 'translateX(-1px) scale(1, 1)', opacity: 1 },
        { offset: 1, transform: 'translateX(0px) scale(1, 1)', filter: bloom(color, 1, 0), opacity: 1 }
      ],
      { duration: 560 }
    )
    .finished.catch(() => undefined)
    .then(() => element.style.removeProperty('transform-origin'))
}

/** The restore tab powers on at the frame edge where the panel streaked out. */
export function playHoloTabIn(element: HTMLElement | null, side: Side) {
  if (!canAnimate(element)) {
    return
  }

  const from = side === 'left' ? 10 : -10
  const color = glow(element)

  element.animate(
    [
      { offset: 0, transform: `translateX(${from}px)`, filter: bloom(color, 1.5, 10), opacity: 0 },
      { offset: 0.35, transform: 'translateX(0px)', opacity: 1 },
      { offset: 0.5, opacity: 0.35 },
      { offset: 0.62, opacity: 1 },
      { offset: 0.74, opacity: 0.6 },
      { offset: 1, transform: 'translateX(0px)', filter: bloom(color, 1, 0), opacity: 1 }
    ],
    { duration: 340, easing: 'ease-out' }
  )
}

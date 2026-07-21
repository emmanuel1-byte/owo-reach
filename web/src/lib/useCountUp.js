import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Rolls a number to its new value instead of swapping it.
 *
 * Deliberately does NOT animate the first value it sees: counting up from zero
 * on every page load would be decoration. It animates only when the figure
 * changes while on screen — which, for the balance, means money actually moved,
 * and is exactly the moment worth noticing.
 *
 * Returns [displayValue, isAnimating] so callers can pair the roll with a
 * highlight.
 */
export function useCountUp(value, { duration = 700 } = {}) {
  const [display, setDisplay] = useState(value);
  const [animating, setAnimating] = useState(false);
  const fromRef = useRef(value);
  const frameRef = useRef(0);
  const seenRef = useRef(false);

  useEffect(() => {
    if (value === null || value === undefined) return;

    // First real value, a reduced-motion preference, or no actual change:
    // land on it directly.
    if (!seenRef.current || prefersReducedMotion() || fromRef.current === value) {
      seenRef.current = true;
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current ?? 0;
    const delta = value - from;
    const start = performance.now();
    setAnimating(true);

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic — quick to move, settling rather than braking.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
        setAnimating(false);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  return [display, animating];
}

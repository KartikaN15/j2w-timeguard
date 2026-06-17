import { useRef, useState } from "react";
import { LogIn, LogOut, ChevronsRight, ChevronsLeft, Loader2 } from "lucide-react";

type Props = {
  direction: "in" | "out";
  disabled?: boolean;
  busy?: boolean;
  onComplete: () => void;
};

// A swipe-to-confirm control. Swipe right = punch in, swipe left = punch out.
// Works with mouse + touch (pointer events).
export function SwipeToPunch({ direction, disabled, busy, onComplete }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0); // 0..1 progress
  const draggingRef = useRef(false);
  const THUMB = 56;

  const isIn = direction === "in";
  const label = busy ? "Submitting…" : isIn ? "Swipe right to Punch In" : "Swipe left to Punch Out";
  // Punch-in = green (positive), punch-out = burgundy (brand), per the design theme.
  const trackColor = isIn ? "bg-green-100 border-green-200" : "bg-[#f8e6ee] border-[#e9c2d3]";
  const thumbColor = isIn ? "bg-green-600" : "bg-[#8c2f52]";

  function maxTravel() {
    const w = trackRef.current?.clientWidth ?? 320;
    return w - THUMB - 8;
  }

  function onDown(e: React.PointerEvent) {
    if (disabled || busy) return;
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const max = maxTravel();
    // For "in": measure from left edge. For "out": measure from right edge.
    const raw = isIn ? e.clientX - rect.left - THUMB / 2 : rect.right - e.clientX - THUMB / 2;
    const clamped = Math.max(0, Math.min(max, raw));
    setPos(clamped / max);
  }

  function onUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (pos >= 0.9) {
      setPos(1);
      onComplete();
      // reset shortly after so the control is reusable
      setTimeout(() => setPos(0), 600);
    } else {
      setPos(0);
    }
  }

  const max = maxTravel();
  const translate = pos * max;

  return (
    <div
      ref={trackRef}
      className={`relative h-16 w-full select-none overflow-hidden rounded-2xl border ${trackColor} ${disabled ? "opacity-50" : ""}`}
    >
      {/* Label */}
      <div className={`absolute inset-0 flex items-center ${isIn ? "justify-end pr-6" : "justify-start pl-6"} text-sm font-semibold ${isIn ? "text-green-700" : "text-[#8c2f52]"}`}>
        <span className="flex items-center gap-1">
          {isIn ? (
            <>{label} <ChevronsRight className="h-4 w-4 animate-pulse" /></>
          ) : (
            <><ChevronsLeft className="h-4 w-4 animate-pulse" /> {label}</>
          )}
        </span>
      </div>

      {/* Thumb */}
      <button
        type="button"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        disabled={disabled || busy}
        aria-label={isIn ? "Swipe to punch in" : "Swipe to punch out"}
        className={`absolute top-1 h-[56px] w-[56px] rounded-xl ${thumbColor} text-white shadow-md grid place-items-center touch-none cursor-grab active:cursor-grabbing`}
        style={{
          [isIn ? "left" : "right"]: 4,
          transform: `translateX(${isIn ? translate : -translate}px)`,
          transition: draggingRef.current ? "none" : "transform 0.25s ease",
        }}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : isIn ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
      </button>
    </div>
  );
}

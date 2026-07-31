// src/components/SwipeableRow.jsx
// Wraps a transaction row so swiping left on mobile reveals Edit/Delete
// buttons underneath — desktop (lg+) ignores touch and renders unchanged.
// Lightweight hand-rolled touch tracking, no new dependency.
import { useRef, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'

const REVEAL_WIDTH = 132
const SWIPE_THRESHOLD = 40

export default function SwipeableRow({ children, onEdit, onDelete, isLast = false }) {
  const [dragX, setDragX] = useState(0)
  const openRef = useRef(false)
  const startX = useRef(0)
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const close = () => { openRef.current = false; setDragX(0) }

  const onTouchStart = e => {
    startX.current = e.touches[0].clientX
    draggingRef.current = true
    setIsDragging(true)
  }
  const onTouchMove = e => {
    if (!draggingRef.current) return
    const delta = e.touches[0].clientX - startX.current
    const base = openRef.current ? -REVEAL_WIDTH : 0
    setDragX(Math.max(-REVEAL_WIDTH, Math.min(0, base + delta)))
  }
  const onTouchEnd = () => {
    draggingRef.current = false
    setIsDragging(false)
    const shouldOpen = dragX < -SWIPE_THRESHOLD
    openRef.current = shouldOpen
    setDragX(shouldOpen ? -REVEAL_WIDTH : 0)
  }

  return (
    <div className="relative" style={{ overflow: 'hidden' }}>
      {/* Action buttons, revealed by the swipe — mobile/touch only */}
      <div className="absolute inset-y-0 right-0 lg:hidden flex items-stretch gap-1.5 py-2 pr-2"
        style={{ width: REVEAL_WIDTH, background: 'var(--card-bg-solid)' }}>
        {onEdit && (
          <button onClick={() => { onEdit(); close() }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl text-white transition-transform active:scale-95"
            style={{ background: 'var(--info)' }} aria-label="Edit">
            <Pencil size={16} />
            <span className="text-[10px] font-bold">Edit</span>
          </button>
        )}
        {onDelete && (
          <button onClick={() => { onDelete(); close() }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl text-white transition-transform active:scale-95"
            style={{ background: 'var(--negative)' }} aria-label="Delete">
            <Trash2 size={16} />
            <span className="text-[10px] font-bold">Delete</span>
          </button>
        )}
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease',
          touchAction: 'pan-y',
          borderBottom: isLast ? 'none' : undefined,
          // Must be opaque — some row markup (e.g. Expenses.jsx's .list-row) has no
          // background of its own, so without this the reveal buttons behind show
          // through at rest instead of staying hidden until actually swiped open.
          background: 'var(--card-bg-solid)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

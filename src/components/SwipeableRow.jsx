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
      <div className="absolute inset-y-0 right-0 lg:hidden" style={{ width: REVEAL_WIDTH, display: 'flex' }}>
        {onEdit && (
          <button onClick={() => { onEdit(); close() }} className="flex-1 flex items-center justify-center text-white" style={{ background: 'var(--info)' }} aria-label="Edit">
            <Pencil size={18} />
          </button>
        )}
        {onDelete && (
          <button onClick={() => { onDelete(); close() }} className="flex-1 flex items-center justify-center text-white" style={{ background: '#ef4444' }} aria-label="Delete">
            <Trash2 size={18} />
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
        }}
      >
        {children}
      </div>
    </div>
  )
}

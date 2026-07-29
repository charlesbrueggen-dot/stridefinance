// src/components/MerchantLogo.jsx
// Shared merchant icon: real favicon when we can guess the domain, otherwise a
// fallback icon chip. Used anywhere a transaction/subscription needs a visual —
// Subscriptions, Accounts, Expenses, Dashboard recent activity.
import { useState } from 'react'
import { logoDomain } from '../lib/merchantLogo'

export default function MerchantLogo({ name, FallbackIcon, size = 36, fallbackBg, fallbackColor }) {
  const [failed, setFailed] = useState(false)
  const domain = logoDomain(name)

  if (!domain || failed) {
    // No usable domain (or the favicon 404'd) — fall back to an icon chip.
    // Callers with a meaningful color code (e.g. green for income, red for
    // expense) can pass fallbackBg/fallbackColor; otherwise the neutral
    // .icon-chip styling is used.
    return (
      <div className={fallbackBg ? 'flex items-center justify-center rounded-full flex-shrink-0' : 'icon-chip flex-shrink-0'}
        style={{ width: size, height: size, background: fallbackBg, color: fallbackColor }}>
        {FallbackIcon && <FallbackIcon size={size * 0.45} />}
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 flex items-center justify-center rounded-xl overflow-hidden"
      style={{ width: size, height: size, background: 'var(--logo-bg)', border: '1px solid var(--logo-border)' }}>
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt=""
        width={size * 0.62}
        height={size * 0.62}
        style={{ objectFit: 'contain' }}
        onError={() => setFailed(true)}
        loading="lazy"
      />
    </div>
  )
}

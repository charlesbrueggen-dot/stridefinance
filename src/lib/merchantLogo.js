// src/lib/merchantLogo.js
// Shared merchant → domain guesser, originally built for Subscriptions.jsx.
// Well-known merchants map to their real domain; anything else falls back to a
// guessed "<name>.com". Consumers fetch the icon from Google's public favicon
// service (see MerchantLogo.jsx) and fall back to a category icon if it 404s.
export const LOGO_DOMAINS = {
  netflix: 'netflix.com', spotify: 'spotify.com', hulu: 'hulu.com',
  'disney+': 'disneyplus.com', disney: 'disneyplus.com', 'disney plus': 'disneyplus.com',
  'amazon prime': 'amazon.com', prime: 'amazon.com', amazon: 'amazon.com', audible: 'audible.com',
  'youtube premium': 'youtube.com', youtube: 'youtube.com', 'youtube tv': 'tv.youtube.com',
  'apple music': 'apple.com', 'apple tv': 'apple.com', 'apple tv+': 'apple.com', icloud: 'apple.com', apple: 'apple.com',
  'hbo max': 'max.com', max: 'max.com', hbo: 'max.com',
  'paramount+': 'paramountplus.com', paramount: 'paramountplus.com',
  peacock: 'peacocktv.com', crunchyroll: 'crunchyroll.com', twitch: 'twitch.tv',
  adobe: 'adobe.com', 'creative cloud': 'adobe.com', photoshop: 'adobe.com',
  dropbox: 'dropbox.com', notion: 'notion.so', canva: 'canva.com', github: 'github.com',
  microsoft: 'microsoft.com', 'microsoft 365': 'microsoft.com', 'office 365': 'microsoft.com', xbox: 'xbox.com',
  'google one': 'google.com', google: 'google.com', playstation: 'playstation.com',
  'ps plus': 'playstation.com', nintendo: 'nintendo.com', chatgpt: 'openai.com', openai: 'openai.com',
  'planet fitness': 'planetfitness.com', peloton: 'onepeloton.com', equinox: 'equinox.com',
  doordash: 'doordash.com', dashpass: 'doordash.com', instacart: 'instacart.com',
  'uber one': 'uber.com', uber: 'uber.com', 'walmart+': 'walmart.com', walmart: 'walmart.com',
  costco: 'costco.com', 'new york times': 'nytimes.com', nyt: 'nytimes.com',
  discord: 'discord.com', 'discord nitro': 'discord.com', duolingo: 'duolingo.com',
  strava: 'strava.com', patreon: 'patreon.com', 'linkedin premium': 'linkedin.com',
  // Everyday transaction merchants (beyond the subscription-oriented set above)
  starbucks: 'starbucks.com', mcdonalds: 'mcdonalds.com', "mcdonald's": 'mcdonalds.com',
  chipotle: 'chipotle.com', subway: 'subway.com', 'target': 'target.com', 'best buy': 'bestbuy.com',
  'home depot': 'homedepot.com', lowes: 'lowes.com', costco_gas: 'costco.com',
  'whole foods': 'wholefoodsmarket.com', 'trader joes': 'traderjoes.com', "trader joe's": 'traderjoes.com',
  kroger: 'kroger.com', safeway: 'safeway.com', publix: 'publix.com', cvs: 'cvs.com',
  walgreens: 'walgreens.com', shell: 'shell.com', chevron: 'chevron.com', exxon: 'exxon.com',
  lyft: 'lyft.com', airbnb: 'airbnb.com', delta: 'delta.com', southwest: 'southwest.com',
  united: 'united.com', 'ebay': 'ebay.com', etsy: 'etsy.com', paypal: 'paypal.com', venmo: 'venmo.com', zelle: 'zellepay.com',
}

export function logoDomain(name = '') {
  const key = name.trim().toLowerCase()
  if (!key) return null
  if (LOGO_DOMAINS[key]) return LOGO_DOMAINS[key]
  // Partial match ("Netflix.com Bill" → netflix)
  const hit = Object.keys(LOGO_DOMAINS).find(k => key.includes(k))
  if (hit) return LOGO_DOMAINS[hit]
  // Last resort: guess <name>.com from the first word
  const first = key.replace(/[^a-z0-9 ]/g, '').split(' ')[0]
  return first ? `${first}.com` : null
}

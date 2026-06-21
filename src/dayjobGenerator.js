// DayJob-inspired synthetic sales data generator
// Mirrors the columnar DayJobTest pattern:
// SalesNo, SalesAreaID, date, PluNo, ItemName, Quantity, Amount, TransMode
// With hierarchical keys enabling map/reduce rollups at any granularity

const REGIONS = ['NORTHEAST', 'SOUTHEAST', 'MIDWEST', 'SOUTHWEST', 'NORTHWEST', 'PACIFIC']
const AREAS_PER_REGION = 8
const PRODUCTS = Array.from({ length: 200 }, (_, i) => ({
  plu: String(10000 + i).padStart(5, '0'),
  name: `ITEM_${String(i + 1).padStart(3, '0')}`,
  category: ['GROCERY', 'DAIRY', 'MEAT', 'PRODUCE', 'BAKERY', 'FROZEN', 'BEVERAGE', 'SNACKS'][i % 8],
  basePrice: 0.5 + (i % 50) * 0.15,
  baseQty: 1 + (i % 20)
}))
const TRANS_MODES = ['SALE', 'RETURN', 'VOID', 'ADJUST']

const METRICS = ['quantity', 'amount', 'trans_count', 'avg_price', 'unique_items', 'unique_trans']

// Deterministic pseudo-random
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function keyToSeed(key) {
  let hash = 0
  for (const k of key) {
    const str = String(k)
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i)
      hash |= 0
    }
  }
  return Math.abs(hash) || 1
}

// Build key: [region, area, year, month, day, product_category, product_plu]
function buildSalesKey(config, indices) {
  const { regionIdx, areaIdx, year, month, day, productIdx } = indices
  const region = REGIONS[regionIdx % REGIONS.length]
  const area = `${region}_AREA_${String((areaIdx % AREAS_PER_REGION) + 1).padStart(2, '0')}`
  const product = PRODUCTS[productIdx % PRODUCTS.length]
  return [region, area, year, month, day, product.category, product.plu]
}

// Generate a single transaction
function generateTransaction(key, seed) {
  const rand = mulberry32(seed)
  const product = PRODUCTS[parseInt(key[6]) % PRODUCTS.length]
  
  const quantity = Math.max(1, Math.round(product.baseQty * (0.5 + rand() * 1.5)))
  const unitPrice = product.basePrice * (0.8 + rand() * 0.4)
  const amount = Math.round(quantity * unitPrice * 100) / 100
  const transMode = TRANS_MODES[Math.floor(rand() * TRANS_MODES.length)]
  
  // Returns/voids are negative
  const signedQty = transMode === 'RETURN' || transMode === 'VOID' ? -quantity : quantity
  const signedAmt = transMode === 'RETURN' || transMode === 'VOID' ? -amount : amount
  
  return {
    key: [...key],
    sales_no: `SN${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`,
    quantity: signedQty,
    amount: signedAmt,
    unit_price: Math.round(unitPrice * 100) / 100,
    trans_mode: transMode,
    item_name: product.name,
    category: product.category
  }
}

// Generate all leaf transactions for a date range
export function generateDayJobLeafData(config = {}) {
  const {
    regions = 3,
    areasPerRegion = 4,
    days = 30,
    productsPerDayPerArea = 50,
    startDate = new Date('2024-01-01')
  } = config
  
  const transactions = []
  let salesNo = 1
  
  for (let regionIdx = 0; regionIdx < regions; regionIdx++) {
    for (let areaIdx = 0; areaIdx < areasPerRegion; areaIdx++) {
      for (let dayOffset = 0; dayOffset < days; dayOffset++) {
        const currentDate = new Date(startDate)
        currentDate.setDate(currentDate.getDate() + dayOffset)
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        const day = currentDate.getDate()
        
        // Generate transactions for this day/area
        for (let p = 0; p < productsPerDayPerArea; p++) {
          const productIdx = (regionIdx * areasPerRegion * days * productsPerDayPerArea) + 
                            (areaIdx * days * productsPerDayPerArea) + 
                            (dayOffset * productsPerDayPerArea) + p
          
          const key = buildSalesKey(config, { regionIdx, areaIdx, year, month, day, productIdx })
          const seed = keyToSeed(key)
          
          // Multiple transactions per product per day (1-5)
          const txCount = 1 + Math.floor(mulberry32(seed + 1)() * 4)
          for (let t = 0; t < txCount; t++) {
            const txSeed = keyToSeed([...key, t])
            transactions.push(generateTransaction(key, txSeed))
            salesNo++
          }
        }
      }
    }
  }
  
  return transactions
}

// Map function: emit(key, value) - key is hierarchical array
export function mapTransactions(transactions, keyDepth) {
  return transactions.map(tx => ({
    key: tx.key.slice(0, keyDepth),
    value: {
      quantity: tx.quantity,
      amount: tx.amount,
      trans_count: 1,
      unique_items: 1,
      unique_trans: new Set([tx.sales_no]),
      categories: new Set([tx.category]),
      trans_modes: new Set([tx.trans_mode])
    }
  }))
}

// Reduce function: combine values for same key
export function reduceMapped(mapped, rereduce = false) {
  const groups = new Map()
  
  for (const { key, value } of mapped) {
    const keyStr = key.join('|')
    if (!groups.has(keyStr)) {
      groups.set(keyStr, {
        key: [...key],
        quantity: 0,
        amount: 0,
        trans_count: 0,
        unique_items: new Set(),
        unique_trans: new Set(),
        categories: new Set(),
        trans_modes: new Set()
      })
    }
    const group = groups.get(keyStr)
    group.quantity += value.quantity
    group.amount += value.amount
    group.trans_count += value.trans_count
    if (value.unique_items) value.unique_items.forEach(v => group.unique_items.add(v))
    if (value.unique_trans) value.unique_trans.forEach(v => group.unique_trans.add(v))
    if (value.categories) value.categories.forEach(v => group.categories.add(v))
    if (value.trans_modes) value.trans_modes.forEach(v => group.trans_modes.add(v))
  }
  
  // Finalize aggregates
  const results = []
  for (const [, group] of groups) {
    const avgPrice = group.trans_count > 0 ? group.amount / group.trans_count : 0
    results.push({
      key: group.key,
      quantity: Math.round(group.quantity * 100) / 100,
      amount: Math.round(group.amount * 100) / 100,
      trans_count: group.trans_count,
      avg_price: Math.round(avgPrice * 100) / 100,
      unique_items: group.unique_items.size,
      unique_trans: group.unique_trans.size,
      categories: Array.from(group.categories),
      trans_modes: Array.from(group.trans_modes),
      depth: group.key.length
    })
  }
  
  // Sort by key (binsearch order)
  results.sort((a, b) => {
    for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) {
      const av = a.key[i] ?? ''
      const bv = b.key[i] ?? ''
      if (av < bv) return -1
      if (av > bv) return 1
    }
    return 0
  })
  
  return results
}

// Rereduce: combine already-reduced results
export function rereduceMapped(reducedResults) {
  // Same logic as reduceMapped but input is already aggregated
  const groups = new Map()
  
  for (const row of reducedResults) {
    const keyStr = row.key.join('|')
    if (!groups.has(keyStr)) {
      groups.set(keyStr, {
        key: [...row.key],
        quantity: 0,
        amount: 0,
        trans_count: 0,
        unique_items: new Set(),
        unique_trans: new Set(),
        categories: new Set(),
        trans_modes: new Set()
      })
    }
    const group = groups.get(keyStr)
    group.quantity += row.quantity
    group.amount += row.amount
    group.trans_count += row.trans_count
    group.unique_items.add(row.unique_items) // This is a count, not a set in rereduce
    group.unique_trans.add(row.unique_trans)
    if (row.categories) row.categories.forEach(v => group.categories.add(v))
    if (row.trans_modes) row.trans_modes.forEach(v => group.trans_modes.add(v))
  }
  
  const results = []
  for (const [, group] of groups) {
    const avgPrice = group.trans_count > 0 ? group.amount / group.trans_count : 0
    results.push({
      key: group.key,
      quantity: Math.round(group.quantity * 100) / 100,
      amount: Math.round(group.amount * 100) / 100,
      trans_count: group.trans_count,
      avg_price: Math.round(avgPrice * 100) / 100,
      unique_items: group.unique_items.size, // approximate
      unique_trans: group.unique_trans.size,
      categories: Array.from(group.categories),
      trans_modes: Array.from(group.trans_modes),
      depth: group.key.length
    })
  }
  
  results.sort((a, b) => {
    for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) {
      const av = a.key[i] ?? ''
      const bv = b.key[i] ?? ''
      if (av < bv) return -1
      if (av > bv) return 1
    }
    return 0
  })
  
  return results
}

// Generate full cascade: rollups at each depth level
export function generateDayJobCascade(transactions, maxDepth = 7) {
  const cascade = []
  
  for (let depth = 1; depth <= maxDepth; depth++) {
    const mapped = mapTransactions(transactions, depth)
    const reduced = reduceMapped(mapped)
    cascade.push({
      depth,
      label: DEPTH_LABELS[depth - 1] || `level_${depth}`,
      data: reduced
    })
  }
  
  return cascade
}

const DEPTH_LABELS = [
  'region',           // 0: NORTHEAST, SOUTHEAST, etc.
  'area',             // 1: NORTHEAST_AREA_01, etc.
  'year',             // 2: 2024
  'month',            // 3: 1-12
  'day',              // 4: 1-31
  'category',         // 5: GROCERY, DAIRY, etc.
  'product'           // 6: PLU code
]

// Binsearch: find insertion point for key prefix
export function binsearchPrefix(data, prefix) {
  let lo = 0, hi = data.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const midKey = data[mid].key.slice(0, prefix.length).join('|')
    const target = prefix.join('|')
    if (midKey < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

// Get slice of data for a key prefix at target depth
export function getSliceAtDepth(data, prefix, targetDepth) {
  const start = binsearchPrefix(data, prefix)
  const results = []
  for (let i = start; i < data.length; i++) {
    const item = data[i]
    const match = prefix.every((p, idx) => item.key[idx] === p)
    if (!match) break
    if (item.key.length >= targetDepth) {
      results.push(item.key.slice(0, targetDepth).join('|'))
    }
  }
  return [...new Set(results)]
}

// Export columnar-style fixed-width format (for demo)
export function toFixedWidth(transactions) {
  // Fixed width format matching DayJobTest coords:
  // SalesNo(11), SalesAreaID(4), date(10), PluNo(5), ItemName(20), Quantity(11), Amount(11), TransMode(5)
  return transactions.map(tx => {
    const areaId = tx.key[1].split('_').pop() || '00'
    return (
      tx.sales_no.padEnd(11) +
      areaId.padStart(4, '0') +
      `${tx.key[2]}-${String(tx.key[3]).padStart(2,'0')}-${String(tx.key[4]).padStart(2,'0')}` +
      tx.key[6].padStart(5, '0') +
      tx.item_name.padEnd(20) +
      String(tx.quantity).padStart(11) +
      String(tx.amount).padStart(11) +
      tx.trans_mode.padEnd(5)
    )
  }).join('\n')
}

export { METRICS, DEPTH_LABELS, REGIONS, PRODUCTS, TRANS_MODES }
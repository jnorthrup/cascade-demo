// Synthetic operational data generator following CouchDB viewserver pattern
// Keys are hierarchical arrays: [region, zone, rack, node, year, month, day, hour, minute]
// This enables map/reduce rollups at any granularity level

const REGIONS = ['us-east', 'us-west', 'eu-central', 'ap-southeast', 'sa-east']
const ZONES = ['a', 'b', 'c', 'd']
const RACKS = Array.from({ length: 8 }, (_, i) => `r${String(i + 1).padStart(2, '0')}`)
const NODES = Array.from({ length: 16 }, (_, i) => `n${String(i + 1).padStart(3, '0')}`)
const METRICS = [
  'cpu_mhz', 'memory_mib', 'storage_gib', 
  'disk_io_kibps', 'lan_io_kbps', 'wan_io_kbps', 
  'consumption_wac', 'temperature_c'
]

const METRIC_RANGES = {
  cpu_mhz: [800, 3200],
  memory_mib: [4096, 65536],
  storage_gib: [500, 4000],
  disk_io_kibps: [100, 50000],
  lan_io_kbps: [1000, 1000000],
  wan_io_kbps: [100, 100000],
  consumption_wac: [50, 400],
  temperature_c: [18, 42]
}

// Deterministic pseudo-random for reproducibility
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// Generate a deterministic seed from a key array
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

// Generate a single reading at a specific key depth
function generateReading(key, depth) {
  const seed = keyToSeed(key)
  const rand = mulberry32(seed)
  
  const reading = { key: [...key] }
  
  // Add metrics with variance based on key
  for (const metric of METRICS) {
    const [min, max] = METRIC_RANGES[metric]
    const base = min + rand() * (max - min)
    // Add time-based variation
    const timeVariation = Math.sin(key[key.length - 1] * 0.1) * 0.1 + 1
    reading[metric] = Math.round(base * timeVariation * 100) / 100
  }
  
  reading.timestamp = buildTimestamp(key)
  reading.depth = depth
  
  return reading
}

// Build ISO timestamp from key components
function buildTimestamp(key) {
  const [,,,, year, month, day, hour, minute] = key
  if (year === undefined) return new Date().toISOString()
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0)).toISOString()
}

// Generate all leaf readings for a time range
export function generateLeafReadings(config = {}) {
  const {
    regions = 2,
    zonesPerRegion = 2,
    racksPerZone = 3,
    nodesPerRack = 4,
    days = 7,
    hoursPerDay = 24,
    minutesPerHour = 60,
    intervalMinutes = 5
  } = config
  
  const readings = []
  const now = new Date()
  const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000)
  
  for (let ri = 0; ri < regions; ri++) {
    const region = REGIONS[ri % REGIONS.length]
    for (let zi = 0; zi < zonesPerRegion; zi++) {
      const zone = ZONES[zi % ZONES.length]
      for (let rki = 0; rki < racksPerZone; rki++) {
        const rack = RACKS[rki % RACKS.length]
        for (let ni = 0; ni < nodesPerRack; ni++) {
          const node = NODES[ni % NODES.length]
          
          // Generate time series
          let currentTime = new Date(startTime)
          while (currentTime < endTime) {
            const key = [
              region, zone, rack, node,
              currentTime.getUTCFullYear(),
              currentTime.getUTCMonth() + 1,
              currentTime.getUTCDate(),
              currentTime.getUTCHours(),
              currentTime.getUTCMinutes()
            ]
            
            readings.push(generateReading(key, 9)) // Full depth = 9
            currentTime = new Date(currentTime.getTime() + intervalMinutes * 60 * 1000)
          }
        }
      }
    }
  }
  
  return readings
}

// Reducer function - computes aggregates at any key depth
// This mirrors the CouchDB reduce function pattern
export function reduceReadings(readings, targetDepth, rereduce = false) {
  if (!readings.length) return []
  
  // Group by key prefix up to targetDepth
  const groups = new Map()
  
  for (const reading of readings) {
    const prefix = reading.key.slice(0, targetDepth).join('|')
    if (!groups.has(prefix)) {
      groups.set(prefix, {
        key: reading.key.slice(0, targetDepth),
        count: 0,
        metrics: {}
      })
    }
    
    const group = groups.get(prefix)
    group.count++
    
    for (const metric of METRICS) {
      const val = reading[metric]
      if (val === undefined || val === null) continue
      
      if (!group.metrics[metric]) {
        group.metrics[metric] = { sum: 0, min: Infinity, max: -Infinity, count: 0 }
      }
      const m = group.metrics[metric]
      m.sum += val
      m.min = Math.min(m.min, val)
      m.max = Math.max(m.max, val)
      m.count++
    }
  }
  
  // Compute final aggregates
  const results = []
  for (const [, group] of groups) {
    const result = { key: group.key, count: group.count, depth: targetDepth }
    for (const metric of METRICS) {
      const m = group.metrics[metric]
      if (m && m.count > 0) {
        result[metric] = {
          sum: Math.round(m.sum * 100) / 100,
          avg: Math.round((m.sum / m.count) * 100) / 100,
          min: Math.round(m.min * 100) / 100,
          max: Math.round(m.max * 100) / 100
        }
      }
    }
    results.push(result)
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

// Generate cascade: rollups at each depth level
export function generateCascade(readings, maxDepth = 9) {
  const cascade = []
  for (let depth = 1; depth <= maxDepth; depth++) {
    cascade.push({
      depth,
      label: DEPTH_LABELS[depth - 1] || `level_${depth}`,
      data: reduceReadings(readings, depth)
    })
  }
  return cascade
}

const DEPTH_LABELS = [
  'region',
  'zone', 
  'rack',
  'node',
  'year',
  'month',
  'day',
  'hour',
  'minute'
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
  return [...new Set(results)] // Unique prefixes at target depth
}

export { METRICS, METRIC_RANGES, DEPTH_LABELS, REGIONS, ZONES, RACKS, NODES }
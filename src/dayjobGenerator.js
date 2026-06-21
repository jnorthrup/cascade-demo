// Raw keyspace generator for the path/timestamp demo.
// No map/reduce: this models ordered keys directly.

const PATH_ROOTS = ['svc', 'edge', 'core', 'batch', 'stream', 'api', 'web', 'ops']
const PATH_LEAVES = ['auth', 'billing', 'catalog', 'checkout', 'events', 'search', 'metrics', 'alerts']
const METRICS = ['requests', 'errors', 'latency_ms', 'bytes_in', 'bytes_out', 'queue_depth']
const PREFIX_LABELS = ['path', 'year', 'month', 'day', 'hour', 'minute', 'metric']
const MAX_PREFIX_DEPTH = PREFIX_LABELS.length

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function keyToSeed(parts) {
  let hash = 0
  for (const part of parts) {
    const str = String(part)
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i)
      hash |= 0
    }
  }
  return Math.abs(hash) || 1
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function buildPaths(count) {
  const paths = []
  let i = 0
  while (paths.length < count) {
    const root = PATH_ROOTS[i % PATH_ROOTS.length]
    const leaf = PATH_LEAVES[Math.floor(i / PATH_ROOTS.length) % PATH_LEAVES.length]
    const suffix = String(Math.floor(i / (PATH_ROOTS.length * PATH_LEAVES.length)) + 1).padStart(2, '0')
    paths.push(`${root}/${leaf}/${suffix}`)
    i++
  }
  return paths
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')
}

function timestampToSegments(timestamp) {
  const d = new Date(timestamp)
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes()
  ]
}

function compareKeys(a, b) {
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    const av = a[i]
    const bv = b[i]
    if (av === bv) continue
    if (av === undefined) return -1
    if (bv === undefined) return 1
    if (av < bv) return -1
    if (av > bv) return 1
  }
  return 0
}

function comparePrefix(key, prefix) {
  for (let i = 0; i < prefix.length; i++) {
    if (key[i] === prefix[i]) continue
    return key[i] < prefix[i] ? -1 : 1
  }
  return 0
}

function matchesPrefix(key, prefix) {
  return prefix.every((part, idx) => key[idx] === part)
}

function lowerBound(rows, prefix) {
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const cmp = comparePrefix(rows[mid].key, prefix)
    if (cmp < 0) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function createKeyspaceDemo(config = {}) {
  const {
    pathCount = 24,
    days = 30,
    eventsPerDay = 24,
    metricsPerEvent = 6,
    startDate = new Date('2024-01-01')
  } = config

  const paths = buildPaths(pathCount)
  const rows = []
  const events = []
  const perEventMetricCount = Math.max(1, Math.min(metricsPerEvent, METRICS.length))

  for (let pathIdx = 0; pathIdx < paths.length; pathIdx++) {
    const path = paths[pathIdx]

    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const day = new Date(startDate)
      day.setUTCDate(day.getUTCDate() + dayOffset)
      const year = day.getUTCFullYear()
      const month = day.getUTCMonth() + 1
      const date = day.getUTCDate()
      const dayLabel = `${year}-${pad2(month)}-${pad2(date)}`

      for (let eventIdx = 0; eventIdx < eventsPerDay; eventIdx++) {
        const minuteOfDay = Math.floor((eventIdx / eventsPerDay) * 1440)
        const hour = Math.floor(minuteOfDay / 60)
        const minute = minuteOfDay % 60
        const timestamp = new Date(Date.UTC(year, month - 1, date, hour, minute)).toISOString()
        const eventSeed = keyToSeed([path, timestamp])
        const eventRand = mulberry32(eventSeed)
        const metricStart = Math.floor(eventRand() * METRICS.length)
        const metricNames = Array.from({ length: perEventMetricCount }, (_, i) => METRICS[(metricStart + i) % METRICS.length])
        const eventId = `${path}|${timestamp}`

        const emitted = []
        for (let metricIdx = 0; metricIdx < metricNames.length; metricIdx++) {
          const metric = metricNames[metricIdx]
          const metricSeed = keyToSeed([path, timestamp, metric, metricIdx])
          const rand = mulberry32(metricSeed)
          const pathBias = pathIdx * 9.5
          const dayBias = dayOffset * 0.75
          const timeWave = Math.sin((minuteOfDay / 1440) * Math.PI * 2 + pathIdx * 0.25) * 16
          const metricBias = metricIdx * 3.25 + metric.length * 0.4
          const noise = (rand() - 0.5) * 8
          const value = Math.max(0, Math.round((70 + pathBias + dayBias + timeWave + metricBias + noise) * 10) / 10)

          const key = [path, year, month, date, hour, minute, metric]
          const row = {
            key,
            path,
            timestamp,
            day: dayLabel,
            metric,
            value,
            eventId
          }
          emitted.push(row)
          rows.push(row)
        }

        events.push({
          eventId,
          path,
          timestamp,
          day: dayLabel,
          emittedKeys: emitted.length,
          metrics: metricNames,
          firstValue: emitted[0]?.value ?? 0,
          lastValue: emitted[emitted.length - 1]?.value ?? 0
        })
      }
    }
  }

  rows.sort((a, b) => compareKeys(a.key, b.key))
  events.sort((a, b) => compareKeys(
    [a.path, ...timestampToSegments(a.timestamp)],
    [b.path, ...timestampToSegments(b.timestamp)]
  ))

  return {
    config: { pathCount, days, eventsPerDay, metricsPerEvent, startDate: new Date(startDate).toISOString() },
    paths,
    rows,
    events,
    metrics: METRICS,
    prefixLabels: PREFIX_LABELS,
    maxPrefixDepth: MAX_PREFIX_DEPTH
  }
}

export function buildPrefixFromSelection(path, timestamp, precision, metric) {
  const base = [path, ...timestampToSegments(timestamp)]
  if (precision <= 1) return [path]
  if (precision < MAX_PREFIX_DEPTH) return base.slice(0, precision)
  return [...base, metric]
}

export function sliceByPrefixRange(rows, prefix) {
  if (!prefix.length) return [...rows]
  const start = lowerBound(rows, prefix)
  const result = []
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]
    if (!matchesPrefix(row.key, prefix)) break
    result.push(row)
  }
  return result
}

export function describePrefixRange(prefix) {
  const startkey = [...prefix]
  const endkey = prefix.length ? [...prefix, {}] : [{}]
  return { startkey, endkey }
}

export function formatKey(key) {
  return key.map(part => String(part)).join(' › ')
}

export function formatTimestampLabel(timestamp) {
  return formatTimestamp(timestamp)
}

export { METRICS, PREFIX_LABELS, MAX_PREFIX_DEPTH }

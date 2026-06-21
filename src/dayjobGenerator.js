// Wide timeseries generator for the aggregator metaphor.
//
// The demo shows how a large, wide, ordered timeseries can be rolled up from
// one summary column to all raw columns by changing the visible column span.

const SERIES_COLORS = [
  'SENSOR', 'COUNTER', 'PIPE', 'QUEUE', 'NODE', 'HOST', 'EDGE', 'REGION'
]

const TIME_BUCKETS_PER_DAY = 48 // 30-minute buckets across a day
const ROLLUP_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 48]

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

function formatClock(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${pad2(h)}:${pad2(m)}`
}

function buildBucketLabels(rawBucketCount = TIME_BUCKETS_PER_DAY) {
  const minutesPerBucket = 1440 / rawBucketCount
  return Array.from({ length: rawBucketCount }, (_, i) => {
    const start = Math.round(i * minutesPerBucket)
    const end = Math.round((i + 1) * minutesPerBucket)
    return `${formatClock(start)}-${formatClock(end % 1440)}`
  })
}

function buildSeriesNames(seriesCount) {
  return Array.from({ length: seriesCount }, (_, i) => {
    const prefix = SERIES_COLORS[i % SERIES_COLORS.length]
    return `${prefix}_${String(i + 1).padStart(3, '0')}`
  })
}

function summarize(values) {
  const total = values.reduce((sum, value) => sum + value, 0)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const avg = values.length ? total / values.length : 0
  return { total, min, max, avg }
}

export function createWideTimeseries(config = {}) {
  const {
    seriesCount = 18,
    days = 21,
    startDate = new Date('2024-01-01'),
    rawBucketCount = TIME_BUCKETS_PER_DAY
  } = config

  const series = buildSeriesNames(seriesCount)
  const bucketLabels = buildBucketLabels(rawBucketCount)
  const rows = []

  for (let seriesIdx = 0; seriesIdx < series.length; seriesIdx++) {
    const seriesName = series[seriesIdx]

    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const day = new Date(startDate)
      day.setDate(day.getDate() + dayOffset)
      const dayLabel = day.toISOString().slice(0, 10)
      const daySeed = keyToSeed([seriesName, dayLabel])
      const dayRand = mulberry32(daySeed)
      const weekend = day.getDay() === 0 || day.getDay() === 6 ? -8 : 0
      const drift = dayOffset * 0.85
      const values = []

      for (let bucketIdx = 0; bucketIdx < rawBucketCount; bucketIdx++) {
        const bucketPhase = (bucketIdx / rawBucketCount) * Math.PI * 2
        const seasonal = Math.sin(bucketPhase + seriesIdx * 0.35 + dayOffset * 0.12) * 18
        const shoulder = Math.cos(bucketPhase * 2 + seriesIdx * 0.18) * 6
        const noise = (dayRand() - 0.5) * 7
        const baseline = 60 + seriesIdx * 4.5 + drift + weekend
        const value = Math.max(0, Math.round((baseline + seasonal + shoulder + noise) * 10) / 10)
        values.push(value)
      }

      const stats = summarize(values)
      rows.push({
        key: [seriesName, dayLabel],
        series: seriesName,
        day: dayLabel,
        rawBucketCount,
        bucketLabels,
        values,
        ...stats,
        depth: 2
      })
    }
  }

  return {
    config: { seriesCount, days, rawBucketCount, startDate: new Date(startDate).toISOString() },
    series,
    bucketLabels,
    rawBucketCount,
    rows
  }
}

function normalizeVisibleColumns(visibleColumns, rawBucketCount) {
  const candidate = Math.max(1, Math.min(rawBucketCount, Math.round(visibleColumns)))
  const exactOptions = ROLLUP_OPTIONS.filter(option => rawBucketCount % option === 0)
  if (exactOptions.includes(candidate)) return candidate
  return exactOptions.reduce((closest, option) => {
    if (option >= candidate && (closest == null || option < closest)) return option
    return closest
  }, null) ?? exactOptions[exactOptions.length - 1] ?? rawBucketCount
}

export function rollupWideTimeseries(rows, visibleColumns, rawBucketCount = TIME_BUCKETS_PER_DAY) {
  const normalized = normalizeVisibleColumns(visibleColumns, rawBucketCount)
  const spanSize = rawBucketCount / normalized

  return rows.map(row => {
    const columns = Array.from({ length: normalized }, (_, columnIdx) => {
      const start = Math.round(columnIdx * spanSize)
      const end = Math.round((columnIdx + 1) * spanSize)
      const slice = row.values.slice(start, end)
      const total = slice.reduce((sum, value) => sum + value, 0)
      const min = slice.length ? Math.min(...slice) : 0
      const max = slice.length ? Math.max(...slice) : 0
      const avg = slice.length ? total / slice.length : 0
      const startLabel = row.bucketLabels[start] || row.bucketLabels[0]
      const endLabel = row.bucketLabels[Math.max(start, end - 1)] || row.bucketLabels[row.bucketLabels.length - 1]

      return {
        index: columnIdx,
        label: normalized === 1 ? 'all buckets' : `${startLabel} → ${endLabel}`,
        start,
        end,
        total,
        min,
        max,
        avg,
        bucketCount: slice.length
      }
    })

    const summary = summarize(row.values)
    return {
      ...row,
      visibleColumns: normalized,
      aggregationFactor: rawBucketCount / normalized,
      columns,
      total: summary.total,
      min: summary.min,
      max: summary.max,
      avg: summary.avg
    }
  })
}

export function buildRollupLadder(rows, rawBucketCount = TIME_BUCKETS_PER_DAY) {
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)
  return ROLLUP_OPTIONS
    .filter(option => rawBucketCount % option === 0)
    .map(visibleColumns => ({
      visibleColumns,
      aggregationFactor: rawBucketCount / visibleColumns,
      rows: rows.length,
      cells: rows.length * visibleColumns,
      total: grandTotal
    }))
}

export function formatVisibleColumnsLabel(visibleColumns, rawBucketCount = TIME_BUCKETS_PER_DAY) {
  if (visibleColumns === 1) return '1 column'
  if (visibleColumns === rawBucketCount) return 'all columns'
  return `${visibleColumns} columns`
}

export { ROLLUP_OPTIONS, TIME_BUCKETS_PER_DAY }

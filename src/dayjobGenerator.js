// CouchDB view-row generator for the readings demo.
// Emits real JSON array keys and reducer-style stats over the generated docs.

const VIEW_DEFS = {
  byOrganization: {
    name: 'byOrganization',
    label: 'byOrganization',
    keyLabels: ['organization_id', 'machine_id', 'year', 'month', 'day', 'hour', 'minute'],
    buildKey(doc) {
      return [
        doc.organization_id,
        doc.machine_id,
        ...splitReadingDate(doc.reading_date)
      ]
    }
  },
  byMachine: {
    name: 'byMachine',
    label: 'byMachine',
    keyLabels: ['machine_id', 'year', 'month', 'day', 'hour', 'minute'],
    buildKey(doc) {
      return [
        doc.machine_id,
        ...splitReadingDate(doc.reading_date)
      ]
    }
  },
  byInfrastructure: {
    name: 'byInfrastructure',
    label: 'byInfrastructure',
    keyLabels: ['infrastructure_id', 'machine_id', 'year', 'month', 'day', 'hour', 'minute'],
    buildKey(doc) {
      return [
        doc.infrastructure_id,
        doc.machine_id,
        ...splitReadingDate(doc.reading_date)
      ]
    }
  },
  byBillingGroup: {
    name: 'byBillingGroup',
    label: 'byBillingGroup',
    keyLabels: ['billing_group_id', 'machine_id', 'year', 'month', 'day', 'hour', 'minute'],
    buildKey(doc) {
      return [
        doc.billing_group_id,
        doc.machine_id,
        ...splitReadingDate(doc.reading_date)
      ]
    }
  },
  byContract: {
    name: 'byContract',
    label: 'byContract',
    keyLabels: ['contract_id', 'machine_id', 'year', 'month', 'day', 'hour', 'minute'],
    buildKey(doc) {
      return [
        doc.contract_id,
        doc.machine_id,
        ...splitReadingDate(doc.reading_date)
      ]
    }
  }
}

const REDUCE_FIELDS = [
  'interval',
  'reading_date',
  'cpu_mhz',
  'memory_mib',
  'storage_gib',
  'disk_io_kilobytes_per_sec',
  'lan_io_kilobits_per_sec',
  'wan_io_kilobits_per_sec',
  'consumption_wac',
  'created_at'
]

const NUMERIC_FIELDS = REDUCE_FIELDS
const DEFAULT_VIEW = 'byOrganization'
const DEFAULT_START_DATE = new Date('2024-01-01T00:00:00Z')
const MAX_PREFIX_DEPTH = Math.max(...Object.values(VIEW_DEFS).map(view => view.keyLabels.length))

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

function splitReadingDate(readingDateMs) {
  const d = new Date(Number(readingDateMs))
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

function buildSeries(prefix, count) {
  const values = []
  let i = 0
  while (values.length < count) {
    values.push(prefix + i + 1)
    i++
  }
  return values
}

function buildDocs(config = {}) {
  const {
    organizationCount = 6,
    infrastructureCount = 8,
    billingGroupCount = 5,
    contractCount = 7,
    machineCount = 24,
    days = 21,
    readingsPerDay = 16,
    startDate = DEFAULT_START_DATE
  } = config

  const organizations = buildSeries(100, organizationCount)
  const infrastructures = buildSeries(200, infrastructureCount)
  const billingGroups = buildSeries(300, billingGroupCount)
  const contracts = buildSeries(400, contractCount)
  const machines = buildSeries(1000, machineCount)
  const docs = []

  for (let machineIdx = 0; machineIdx < machines.length; machineIdx++) {
    const machine_id = machines[machineIdx]
    const organization_id = organizations[machineIdx % organizations.length]
    const infrastructure_id = infrastructures[machineIdx % infrastructures.length]
    const billing_group_id = billingGroups[machineIdx % billingGroups.length]
    const contract_id = contracts[machineIdx % contracts.length]

    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const day = new Date(startDate)
      day.setUTCDate(day.getUTCDate() + dayOffset)
      const year = day.getUTCFullYear()
      const month = day.getUTCMonth() + 1
      const date = day.getUTCDate()

      for (let readingIdx = 0; readingIdx < readingsPerDay; readingIdx++) {
        const minuteOfDay = readingIdx
        const hour = Math.floor(minuteOfDay / 60)
        const minute = minuteOfDay % 60
        const reading_date = Date.UTC(year, month - 1, date, hour, minute, 0, 0)
        const seed = keyToSeed([machine_id, organization_id, infrastructure_id, billing_group_id, contract_id, reading_date])
        const rand = mulberry32(seed)

        const interval = [5, 10, 15][Math.floor(rand() * 3)]
        const cpu_mhz = Math.max(400, Math.round((1800 + machineIdx * 42 + dayOffset * 6 + rand() * 800) * 10) / 10)
        const memory_mib = Math.max(512, Math.round((4096 + (machineIdx % 8) * 768 + rand() * 512) * 10) / 10)
        const storage_gib = Math.max(50, Math.round((120 + (machineIdx % 5) * 24 + rand() * 30) * 10) / 10)
        const disk_io_kilobytes_per_sec = Math.max(0, Math.round((65 + dayOffset * 2 + rand() * 140) * 10) / 10)
        const lan_io_kilobits_per_sec = Math.max(0, Math.round((120 + (machineIdx % 6) * 18 + rand() * 160) * 10) / 10)
        const wan_io_kilobits_per_sec = Math.max(0, Math.round((18 + (dayOffset % 7) * 4 + rand() * 40) * 10) / 10)
        const consumption_wac = Math.max(0, Math.round((32 + machineIdx * 0.9 + dayOffset * 0.5 + rand() * 10) * 10) / 10)
        const created_at = reading_date + Math.round(rand() * 90000)

        const docId = `reading-${machine_id}-${dayOffset}-${readingIdx}`
        docs.push({
          _id: docId,
          organization_id,
          infrastructure_id,
          billing_group_id,
          contract_id,
          machine_id,
          reading_date,
          interval,
          cpu_mhz,
          memory_mib,
          storage_gib,
          disk_io_kilobytes_per_sec,
          lan_io_kilobits_per_sec,
          wan_io_kilobits_per_sec,
          consumption_wac,
          created_at
        })
      }
    }
  }

  return docs
}

function buildViewRows(docs, viewDef) {
  return docs.map(doc => ({
    docId: doc._id,
    key: viewDef.buildKey(doc),
    doc,
    value: doc
  })).sort((a, b) => compareKeys(a.key, b.key))
}

function buildCascadeLevels(rows, keyLabels) {
  const sortedRows = [...rows].sort((a, b) => compareKeys(a.key, b.key))
  const cascade = []

  for (let depth = 1; depth <= keyLabels.length; depth++) {
    const data = []
    let currentPrefix = null
    let currentRows = []

    const flush = () => {
      if (!currentRows.length) return

      const docs = currentRows.map(row => row.doc)
      const aggregate = aggregateDocs(docs)
      const prefix = [...currentPrefix]

      data.push({
        depth,
        key: prefix,
        keyLabel: prefix
          .map((segment, idx) => `${keyLabels[idx]}=${segment}`)
          .join(' › '),
        count: aggregate.count,
        docIds: currentRows.map(row => row.docId),
        docs,
        metrics: aggregate.stats,
        leaf: depth === keyLabels.length
      })
    }

    for (const row of sortedRows) {
      const prefix = row.key.slice(0, depth)
      if (!currentPrefix || compareKeys(prefix, currentPrefix) !== 0) {
        flush()
        currentPrefix = prefix
        currentRows = [row]
      } else {
        currentRows.push(row)
      }
    }

    flush()

    cascade.push({
      depth,
      label: depth === keyLabels.length ? 'leaf keys' : `${depth}-part rollups`,
      keyLabels: keyLabels.slice(0, depth),
      data
    })
  }

  return cascade
}

function aggregateDocs(docs) {
  const count = docs.length
  const stats = {}

  for (const field of NUMERIC_FIELDS) {
    const values = docs.map(doc => doc[field]).filter(value => value !== undefined && value !== null)
    if (!values.length) continue

    const sum = values.reduce((acc, value) => acc + Number(value), 0)
    stats[field] = {
      sum,
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length
    }
  }

  return { stats, count }
}

export function createCouchViewDemo(config = {}) {
  const docs = buildDocs(config)
  const views = Object.fromEntries(
    Object.entries(VIEW_DEFS).map(([name, viewDef]) => [name, buildViewRows(docs, viewDef)])
  )

  return {
    docs,
    views,
    config: {
      ...config,
      startDate: new Date(config.startDate || DEFAULT_START_DATE).toISOString()
    }
  }
}

export function buildPrefixFromSelection(key, precision) {
  const depth = Math.max(1, Math.min(key.length, Math.round(precision)))
  return key.slice(0, depth)
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
  return JSON.stringify(key)
}

export function formatTimestampLabel(timestamp) {
  const value = Number(timestamp)
  if (Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  return String(timestamp)
}

export function formatReduceField(field, stat) {
  if (!stat) return '—'
  const formatNumber = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'
  const formatDate = value => Number.isFinite(value) ? new Date(value).toISOString() : '—'

  if (field === 'reading_date' || field === 'created_at') {
    return {
      sum: formatDate(stat.sum),
      avg: formatDate(stat.avg),
      min: formatDate(stat.min),
      max: formatDate(stat.max),
      count: stat.count
    }
  }

  return {
    sum: formatNumber(stat.sum),
    avg: formatNumber(stat.avg),
    min: formatNumber(stat.min),
    max: formatNumber(stat.max),
    count: stat.count
  }
}

export {
  VIEW_DEFS,
  REDUCE_FIELDS,
  DEFAULT_VIEW,
  MAX_PREFIX_DEPTH,
  aggregateDocs,
  buildCascadeLevels
}

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  createKeyspaceDemo,
  sliceByPrefixRange,
  describePrefixRange,
  buildPrefixFromSelection,
  formatKey,
  formatTimestampLabel,
  PREFIX_LABELS,
  MAX_PREFIX_DEPTH
} from './dayjobGenerator'
import './styles.css'

function App() {
  const [dataset, setDataset] = useState(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [selectedEvent, setSelectedEvent] = useState('')
  const [prefixDepth, setPrefixDepth] = useState(2)
  const [selectedMetric, setSelectedMetric] = useState('requests')
  const [viewMode, setViewMode] = useState('rows')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationConfig] = useState({
    pathCount: 32,
    days: 21,
    eventsPerDay: 16,
    metricsPerEvent: 6,
    startDate: new Date('2024-01-01')
  })

  const regenerateData = useCallback(() => {
    setIsGenerating(true)
    setTimeout(() => {
      const next = createKeyspaceDemo(generationConfig)
      setDataset(next)
      setSelectedPath(next.paths[0] || '')
      setSelectedEvent(next.events[0]?.eventId || '')
      setPrefixDepth(2)
      setSelectedMetric(next.metrics[0] || 'requests')
      setIsGenerating(false)
    }, 20)
  }, [generationConfig])

  useEffect(() => {
    regenerateData()
  }, [regenerateData])

  const paths = dataset?.paths || []
  const events = dataset?.events || []
  const rows = dataset?.rows || []
  const metrics = dataset?.metrics || []
  const rawPrefixDepth = Math.max(1, Math.min(prefixDepth, MAX_PREFIX_DEPTH))

  const selectedEventObject = useMemo(() => {
    if (!selectedEvent) return null
    return events.find(event => event.eventId === selectedEvent) || null
  }, [events, selectedEvent])

  const prefix = useMemo(() => {
    if (!selectedEventObject) return []
    return buildPrefixFromSelection(
      selectedEventObject.path,
      selectedEventObject.timestamp,
      rawPrefixDepth,
      selectedMetric
    )
  }, [selectedEventObject, rawPrefixDepth, selectedMetric])

  const prefixRows = useMemo(() => sliceByPrefixRange(rows, prefix), [rows, prefix])

  const groupedByEvent = useMemo(() => {
    const groups = new Map()
    for (const row of prefixRows) {
      const eventKey = `${row.path}|${row.timestamp}`
      if (!groups.has(eventKey)) {
        groups.set(eventKey, {
          path: row.path,
          timestamp: row.timestamp,
          eventId: row.eventId,
          rows: []
        })
      }
      groups.get(eventKey).rows.push(row)
    }
    return Array.from(groups.values())
  }, [prefixRows])

  const rangeInfo = useMemo(() => describePrefixRange(prefix), [prefix])

  const firstVisibleRows = useMemo(() => {
    if (viewMode === 'events') return groupedByEvent.slice(0, 50)
    return prefixRows.slice(0, 120)
  }, [viewMode, groupedByEvent, prefixRows])

  const selectedPathRows = useMemo(() => {
    if (!selectedPath) return rows.slice(0, 120)
    return rows.filter(row => row.path === selectedPath)
  }, [rows, selectedPath])

  const selectedPathEvents = useMemo(() => {
    if (!selectedPath) return events.slice(0, 120)
    return events.filter(event => event.path === selectedPath)
  }, [events, selectedPath])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Raw Keyspace Prefix Demo</h1>
        <p className="subtitle">
          A [path,timestamp] key can fan out into several emitted rows; the demo shows the raw keyspace slice, not a fabricated rollup view.
        </p>
      </header>

      <div className="app-toolbar">
        <div className="toolbar-group">
          <label>Path:</label>
          <select className="select" value={selectedPath} onChange={e => setSelectedPath(e.target.value)}>
            {paths.map(path => <option key={path} value={path}>{path}</option>)}
          </select>
        </div>

        <div className="toolbar-group">
          <label>Event:</label>
          <select className="select" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
            {selectedPathEvents.map(event => (
              <option key={event.eventId} value={event.eventId}>
                {formatTimestampLabel(event.timestamp)} · {event.emittedKeys} keys
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-group">
          <label>Prefix depth:</label>
          <input
            type="range"
            min="1"
            max={MAX_PREFIX_DEPTH}
            step="1"
            value={rawPrefixDepth}
            onChange={e => setPrefixDepth(Number(e.target.value))}
            style={{ width: 220 }}
          />
          <span style={{ minWidth: 160 }}>{PREFIX_LABELS[rawPrefixDepth - 1] || `level ${rawPrefixDepth}`}</span>
        </div>

        <div className="toolbar-group">
          <label>Metric:</label>
          <select className="select" value={selectedMetric} onChange={e => setSelectedMetric(e.target.value)}>
            {metrics.map(metric => <option key={metric} value={metric}>{metric}</option>)}
          </select>
        </div>

        <div className="toolbar-group">
          <label>View:</label>
          <select className="select" value={viewMode} onChange={e => setViewMode(e.target.value)}>
            <option value="rows">Rows in prefix range</option>
            <option value="events">Events that emitted rows</option>
          </select>
        </div>

        <div className="toolbar-group">
          <button onClick={regenerateData} disabled={isGenerating} className="btn">
            {isGenerating ? 'Generating...' : 'Regenerate'}
          </button>
        </div>

        <div className="toolbar-group stats">
          <span>Paths: {paths.length.toLocaleString()}</span>
          <span>Events: {events.length.toLocaleString()}</span>
          <span>Rows: {rows.length.toLocaleString()}</span>
        </div>
      </div>

      <div className="app-main">
        <aside className="sidebar">
          <div className="panel">
            <div className="panel-header">
              <span>Prefix Range</span>
              <span className="level-count">[path,timestamp] → emitted rows</span>
            </div>
            <div className="panel-body">
              <div className="stat-grid">
                <div className="stat-item">
                  <div className="stat-label">startkey</div>
                  <div className="stat-value">{JSON.stringify(rangeInfo.startkey)}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">endkey</div>
                  <div className="stat-value">{JSON.stringify(rangeInfo.endkey)}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Matching rows</div>
                  <div className="stat-value">{prefixRows.length.toLocaleString()}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Matching events</div>
                  <div className="stat-value">{groupedByEvent.length.toLocaleString()}</div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: '11px', color: 'var(--fg-muted)' }}>
                One event can emit several keys. The prefix decides how much of the keyspace you see.
              </div>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="panel">
            <div className="panel-header">
              <span>{viewMode === 'rows' ? 'Raw Prefix Rows' : 'Event Fan-out'}</span>
              <span className="level-count">
                {viewMode === 'rows' ? `${firstVisibleRows.length.toLocaleString()} rows` : `${firstVisibleRows.length.toLocaleString()} events`}
              </span>
            </div>
            <div className="panel-body">
              {viewMode === 'rows' && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Value</th>
                      <th>Metric</th>
                      <th>Path</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firstVisibleRows.map(row => (
                      <tr key={`${row.eventId}-${row.metric}`}>
                        <td>{formatKey(row.key)}</td>
                        <td>{row.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{row.metric}</td>
                        <td>{row.path}</td>
                        <td>{formatTimestampLabel(row.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {viewMode === 'events' && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>Timestamp</th>
                      <th>Emitted keys</th>
                      <th>Metrics</th>
                      <th>First</th>
                      <th>Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firstVisibleRows.map(event => (
                      <tr key={event.eventId}>
                        <td>{event.path}</td>
                        <td>{formatTimestampLabel(event.timestamp)}</td>
                        <td>{event.emittedKeys}</td>
                        <td>{event.metrics.join(', ')}</td>
                        <td>{event.firstValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{event.lastValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="panel fwf-panel">
            <div className="panel-header">
              <span>Keyspace Metaphor</span>
              <span className="level-count">raw keys only</span>
            </div>
            <div className="panel-body">
              <div className="stat-grid">
                <div className="stat-item">
                  <div className="stat-label">Selected path</div>
                  <div className="stat-value">{selectedPath || '—'}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Selected event</div>
                  <div className="stat-value">{selectedEventObject ? formatTimestampLabel(selectedEventObject.timestamp) : '—'}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Emitted rows for event</div>
                  <div className="stat-value">{selectedEventObject?.emittedKeys ?? 0}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Prefix precision</div>
                  <div className="stat-value">{PREFIX_LABELS[rawPrefixDepth - 1] || `level ${rawPrefixDepth}`}</div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: '11px', color: 'var(--fg-muted)' }}>
                The key fan-out is the point: one [path,timestamp] event can yield several emitted rows, and prefix range selection decides how much of that ordered space you inspect.
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className="app-footer">
        <p>
          Raw keyspace demo · no map/reduce layer · hierarchical prefix selection over emitted keys
        </p>
      </footer>
    </div>
  )
}

export default App

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  createCouchViewDemo,
  sliceByPrefixRange,
  describePrefixRange,
  buildPrefixFromSelection,
  formatKey,
  formatTimestampLabel,
  formatReduceField,
  VIEW_DEFS,
  REDUCE_FIELDS,
  DEFAULT_VIEW,
  aggregateDocs
} from './dayjobGenerator'
import './styles.css'

function App() {
  const [dataset, setDataset] = useState(null)
  const [selectedView, setSelectedView] = useState(DEFAULT_VIEW)
  const [selectedDocId, setSelectedDocId] = useState('')
  const [prefixDepth, setPrefixDepth] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationConfig] = useState({
    organizationCount: 6,
    infrastructureCount: 8,
    billingGroupCount: 5,
    contractCount: 7,
    machineCount: 24,
    days: 21,
    readingsPerDay: 16,
    startDate: new Date('2024-01-01T00:00:00Z')
  })

  const regenerateData = useCallback(() => {
    setIsGenerating(true)
    setTimeout(() => {
      const next = createCouchViewDemo(generationConfig)
      const firstRows = next.views?.[DEFAULT_VIEW] || []
      setDataset(next)
      setSelectedView(DEFAULT_VIEW)
      setSelectedDocId(firstRows[0]?.docId || '')
      setPrefixDepth(VIEW_DEFS[DEFAULT_VIEW].keyLabels.length)
      setIsGenerating(false)
    }, 20)
  }, [generationConfig])

  useEffect(() => {
    regenerateData()
  }, [regenerateData])

  const viewNames = Object.keys(VIEW_DEFS)
  const currentViewDef = VIEW_DEFS[selectedView] || VIEW_DEFS[DEFAULT_VIEW]
  const maxPrefixDepth = currentViewDef.keyLabels.length
  const rawPrefixDepth = Math.max(1, Math.min(prefixDepth, maxPrefixDepth))

  const rows = dataset?.views?.[selectedView] || []

  useEffect(() => {
    if (!rows.length) {
      if (selectedDocId) setSelectedDocId('')
      return
    }

    if (!rows.some(row => row.docId === selectedDocId)) {
      setSelectedDocId(rows[0].docId)
    }
  }, [rows, selectedDocId])

  useEffect(() => {
    setPrefixDepth(current => Math.min(current, maxPrefixDepth))
  }, [maxPrefixDepth])

  const selectedRow = useMemo(() => {
    if (!rows.length) return null
    return rows.find(row => row.docId === selectedDocId) || rows[0]
  }, [rows, selectedDocId])

  const prefix = useMemo(() => {
    if (!selectedRow) return []
    return buildPrefixFromSelection(selectedRow.key, rawPrefixDepth)
  }, [selectedRow, rawPrefixDepth])

  const prefixRows = useMemo(() => sliceByPrefixRange(rows, prefix), [rows, prefix])
  const reduceOutput = useMemo(() => aggregateDocs(prefixRows.map(row => row.doc)), [prefixRows])
  const rangeInfo = useMemo(() => describePrefixRange(prefix), [prefix])

  const visibleRows = prefixRows.slice(0, 120)
  const reduceRows = REDUCE_FIELDS.map(field => ({
    field,
    data: formatReduceField(field, reduceOutput.stats?.[field])
  }))

  const selectedKeyPieces = selectedRow?.key.map((piece, idx) => ({
    label: currentViewDef.keyLabels[idx] || `part ${idx + 1}`,
    value: piece,
    selected: idx < rawPrefixDepth
  })) || []

  return (
    <div className="app">
      <header className="app-header">
        <h1>Raw CouchDB View Demo</h1>
        <p className="subtitle">
          JSON mapreduce emits ordered array keys; the prefix slider narrows a real CouchDB-style startkey/endkey range, and the reducer panel shows the aggregated stats over the matching rows.
        </p>
      </header>

      <div className="app-toolbar">
        <div className="toolbar-group">
          <label>View:</label>
          <select className="select" value={selectedView} onChange={e => {
            const nextView = e.target.value
            setSelectedView(nextView)
            setPrefixDepth(VIEW_DEFS[nextView].keyLabels.length)
            const nextRows = dataset?.views?.[nextView] || []
            setSelectedDocId(nextRows[0]?.docId || '')
          }}>
            {viewNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-group">
          <label>Prefix depth:</label>
          <input
            type="range"
            min="1"
            max={maxPrefixDepth}
            step="1"
            value={rawPrefixDepth}
            onChange={e => setPrefixDepth(Number(e.target.value))}
            style={{ width: 240 }}
          />
          <span style={{ minWidth: 260 }}>
            {currentViewDef.keyLabels.slice(0, rawPrefixDepth).join(' → ') || `level ${rawPrefixDepth}`}
          </span>
        </div>

        <div className="toolbar-group">
          <button onClick={regenerateData} disabled={isGenerating} className="btn">
            {isGenerating ? 'Generating...' : 'Regenerate'}
          </button>
        </div>

        <div className="toolbar-group stats">
          <span>Docs: {dataset?.docs?.length?.toLocaleString() || 0}</span>
          <span>Rows: {rows.length.toLocaleString()}</span>
          <span>Match: {prefixRows.length.toLocaleString()}</span>
        </div>
      </div>

      <div className="app-main">
        <aside className="sidebar">
          <div className="panel">
            <div className="panel-header">
              <span>Prefix Range</span>
              <span className="level-count">group_level {rawPrefixDepth} / {maxPrefixDepth}</span>
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
                  <div className="stat-label">Matching docs</div>
                  <div className="stat-value">{reduceOutput.count.toLocaleString()}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Matching rows</div>
                  <div className="stat-value">{prefixRows.length.toLocaleString()}</div>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: '11px', color: 'var(--fg-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Current view key
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedKeyPieces.map(piece => (
                    <span
                      key={piece.label}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 4,
                        border: `1px solid ${piece.selected ? 'var(--accent)' : 'var(--border)'}`,
                        background: piece.selected ? 'var(--accent-dim)' : 'var(--bg)',
                        color: piece.selected ? 'var(--accent-bright)' : 'var(--fg-muted)',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      {piece.label}={String(piece.value)}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: '11px', color: 'var(--fg-muted)' }}>
                CouchDB arrays collate lexicographically, so this prefix slice behaves like a real startkey/endkey scan over the selected view.
              </div>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="panel">
            <div className="panel-header">
              <span>Map Rows</span>
              <span className="level-count">{selectedView}</span>
            </div>
            <div className="panel-body">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Doc ID</th>
                    <th>Reading date</th>
                    <th>CPU</th>
                    <th>Mem</th>
                    <th>Disk IO</th>
                    <th>LAN IO</th>
                    <th>WAN IO</th>
                    <th>Consumption</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(row => {
                    const doc = row.doc
                    const selected = row.docId === selectedRow?.docId
                    return (
                      <tr
                        key={row.docId}
                        onClick={() => setSelectedDocId(row.docId)}
                        style={{ cursor: 'pointer', background: selected ? 'rgba(0, 160, 255, 0.08)' : 'transparent' }}
                      >
                        <td>{formatKey(row.key)}</td>
                        <td>{row.docId}</td>
                        <td>{formatTimestampLabel(doc.reading_date)}</td>
                        <td>{doc.cpu_mhz.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{doc.memory_mib.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{doc.disk_io_kilobytes_per_sec.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{doc.lan_io_kilobits_per_sec.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{doc.wan_io_kilobits_per_sec.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{doc.consumption_wac.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel fwf-panel">
            <div className="panel-header">
              <span>Reduce Output</span>
              <span className="level-count">{selectedView}/reduce</span>
            </div>
            <div className="panel-body">
              <div className="stat-grid">
                <div className="stat-item">
                  <div className="stat-label">count</div>
                  <div className="stat-value">{reduceOutput.count.toLocaleString()}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">first row key</div>
                  <div className="stat-value">{prefixRows[0] ? JSON.stringify(prefixRows[0].key) : '—'}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">last row key</div>
                  <div className="stat-value">{prefixRows[prefixRows.length - 1] ? JSON.stringify(prefixRows[prefixRows.length - 1].key) : '—'}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">reduce fields</div>
                  <div className="stat-value">{REDUCE_FIELDS.length}</div>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Sum</th>
                      <th>Avg</th>
                      <th>Min</th>
                      <th>Max</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reduceRows.map(row => (
                      <tr key={row.field}>
                        <td>{row.field}</td>
                        <td>{row.data.sum}</td>
                        <td>{row.data.avg}</td>
                        <td>{row.data.min}</td>
                        <td>{row.data.max}</td>
                        <td>{row.data.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className="app-footer">
        <p>
          CouchDB view demo · real array keys · real prefix range · real reducer stats over generated docs
        </p>
      </footer>
    </div>
  )
}

export default App

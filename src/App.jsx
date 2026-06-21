import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  createWideTimeseries,
  rollupWideTimeseries,
  buildRollupLadder,
  formatVisibleColumnsLabel,
  TIME_BUCKETS_PER_DAY
} from './dayjobGenerator'
import './styles.css'

function App() {
  const [dataset, setDataset] = useState(null)
  const [visibleColumns, setVisibleColumns] = useState(1)
  const [selectedSeries, setSelectedSeries] = useState('')
  const [viewMode, setViewMode] = useState('table')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationConfig] = useState({
    seriesCount: 24,
    days: 30,
    rawBucketCount: TIME_BUCKETS_PER_DAY,
    startDate: new Date('2024-01-01')
  })

  const regenerateData = useCallback(() => {
    setIsGenerating(true)
    setTimeout(() => {
      const next = createWideTimeseries(generationConfig)
      setDataset(next)
      setSelectedSeries(next.series[0] || '')
      setVisibleColumns(1)
      setIsGenerating(false)
    }, 30)
  }, [generationConfig])

  useEffect(() => {
    regenerateData()
  }, [regenerateData])

  const rows = dataset?.rows || []
  const rawBucketCount = dataset?.rawBucketCount || TIME_BUCKETS_PER_DAY
  const series = dataset?.series || []

  const selectedRows = useMemo(() => {
    if (!selectedSeries) return rows.slice(0, 120)
    return rows.filter(row => row.series === selectedSeries)
  }, [rows, selectedSeries])

  const rolledRows = useMemo(() => {
    if (!selectedRows.length) return []
    return rollupWideTimeseries(selectedRows, visibleColumns, rawBucketCount)
  }, [selectedRows, visibleColumns, rawBucketCount])

  const ladder = useMemo(() => buildRollupLadder(selectedRows, rawBucketCount), [selectedRows, rawBucketCount])
  const selectedRollup = ladder.find(step => step.visibleColumns === visibleColumns) || ladder[0]

  const maxColumns = rawBucketCount

  return (
    <div className="app">
      <header className="app-header">
        <h1>Wide Timeseries Rollup Demo</h1>
        <p className="subtitle">
          A large ordered series rolled up from 1 column to all columns, like a CouchDB-style aggregate surface.
        </p>
      </header>

      <div className="app-toolbar">
        <div className="toolbar-group">
          <label>Series:</label>
          <select
            className="select"
            value={selectedSeries}
            onChange={e => setSelectedSeries(e.target.value)}
          >
            {series.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div className="toolbar-group">
          <label>Rollup:</label>
          <input
            type="range"
            min="1"
            max={maxColumns}
            step="1"
            value={visibleColumns}
            onChange={e => setVisibleColumns(Number(e.target.value))}
            style={{ width: 220 }}
          />
          <span style={{ minWidth: 120 }}>{formatVisibleColumnsLabel(visibleColumns, rawBucketCount)}</span>
        </div>

        <div className="toolbar-group">
          <label>View:</label>
          <select className="select" value={viewMode} onChange={e => setViewMode(e.target.value)}>
            <option value="table">Rolled Table</option>
            <option value="matrix">Wide Matrix</option>
          </select>
        </div>

        <div className="toolbar-group">
          <button onClick={regenerateData} disabled={isGenerating} className="btn">
            {isGenerating ? 'Generating...' : 'Regenerate'}
          </button>
        </div>

        <div className="toolbar-group stats">
          <span>Series: {series.length.toLocaleString()}</span>
          <span>Days: {dataset?.config.days ?? 0}</span>
          <span>Raw buckets: {rawBucketCount}</span>
          <span>Rollup factor: {visibleColumns > 0 ? `${(rawBucketCount / visibleColumns).toFixed(1)}x` : '—'}</span>
        </div>
      </div>

      <div className="app-main">
        <aside className="sidebar">
          <div className="panel">
            <div className="panel-header">
              <span>Rollup Ladder</span>
              <span className="level-count">1 → {rawBucketCount} columns</span>
            </div>
            <div className="panel-body">
              <div className="stat-grid">
                {ladder.map(step => (
                  <div className="stat-item" key={step.visibleColumns}>
                    <div className="stat-label">{formatVisibleColumnsLabel(step.visibleColumns, rawBucketCount)}</div>
                    <div className="stat-value">{step.rows.toLocaleString()} rows</div>
                    <div className="stat-label">factor {step.aggregationFactor.toFixed(1)}x</div>
                  </div>
                ))}
              </div>
              {selectedRollup && (
                <div style={{ marginTop: 12, fontSize: '11px', color: 'var(--fg-muted)' }}>
                  Selected rollup: {selectedRollup.visibleColumns} columns / factor {selectedRollup.aggregationFactor.toFixed(1)}x
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="main-content">
          {viewMode === 'table' && (
            <div className="panel">
              <div className="panel-header">
                <span>Rolled Table</span>
                <span className="level-count">{rolledRows.length.toLocaleString()} rows</span>
              </div>
              <div className="panel-body">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Series</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Min</th>
                      <th>Max</th>
                      <th>Avg</th>
                      <th>Visible buckets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rolledRows.slice(0, 80).map(row => (
                      <tr key={`${row.series}-${row.day}`}>
                        <td>{row.series}</td>
                        <td>{row.day}</td>
                        <td>{row.total.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{row.min.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{row.max.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{row.avg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                        <td>{row.visibleColumns}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === 'matrix' && (
            <div className="panel">
              <div className="panel-header">
                <span>Wide Matrix</span>
                <span className="level-count">raw → rolled</span>
              </div>
              <div className="panel-body">
                <div className="fwf-content" style={{ whiteSpace: 'pre', overflowX: 'auto' }}>
                  {rolledRows.slice(0, 12).map(row => {
                    const cells = row.columns.map(col => `${String(col.index).padStart(2, '0')}:${col.total.toFixed(0)}`).join(' | ')
                    return `${row.series} ${row.day} | ${cells}`
                  }).join('\n')}
                </div>
              </div>
            </div>
          )}

          <div className="panel fwf-panel">
            <div className="panel-header">
              <span>Aggregator Metaphor</span>
              <span className="level-count">1 column → all columns</span>
            </div>
            <div className="panel-body">
              <div className="stat-grid">
                <div className="stat-item">
                  <div className="stat-label">Raw events per row</div>
                  <div className="stat-value">{rawBucketCount}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Visible columns</div>
                  <div className="stat-value">{visibleColumns}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Aggregation factor</div>
                  <div className="stat-value">{(rawBucketCount / visibleColumns).toFixed(1)}x</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Total visible cells</div>
                  <div className="stat-value">{(rolledRows.length * visibleColumns).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: '11px', color: 'var(--fg-muted)' }}>
                The same ordered timeseries can be summarized at any span: 1 column is the widest rollup, all columns are the raw leaf view.
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className="app-footer">
        <p>
          Wide timeseries rollup demo · ordered buckets · aggregation from coarse summary to leaf-level detail
        </p>
      </footer>
    </div>
  )
}

export default App

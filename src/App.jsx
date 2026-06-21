import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { 
  generateDayJobLeafData, 
  generateDayJobCascade, 
  reduceMapped,
  mapTransactions,
  METRICS,
  DEPTH_LABELS,
  binsearchPrefix,
  getSliceAtDepth,
  toFixedWidth
} from './dayjobGenerator'
import CascadeGrid from './CascadeGrid'
import DepthSelector from './DepthSelector'
import MetricSelector from './MetricSelector'
import KeyInspector from './KeyInspector'
import GradientCascade from './GradientCascade'
import StatsPanel from './StatsPanel'
import './styles.css'

function App() {
  const [transactions, setTransactions] = useState([])
  const [cascade, setCascade] = useState([])
  const [currentDepth, setCurrentDepth] = useState(4)
  const [selectedMetric, setSelectedMetric] = useState('amount')
  const [selectedKeyPrefix, setSelectedKeyPrefix] = useState([])
  const [viewMode, setViewMode] = useState('cascade')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showFixedWidth, setShowFixedWidth] = useState(false)
  const [generationConfig, setGenerationConfig] = useState({
    regions: 3,
    areasPerRegion: 4,
    days: 14,
    productsPerDayPerArea: 30
  })

  // Generate initial data
  useEffect(() => {
    regenerateData()
  }, [])

  const regenerateData = useCallback(() => {
    setIsGenerating(true)
    setTimeout(() => {
      const newTransactions = generateDayJobLeafData(generationConfig)
      const newCascade = generateDayJobCascade(newTransactions, 7)
      setTransactions(newTransactions)
      setCascade(newCascade)
      setIsGenerating(false)
    }, 50)
  }, [generationConfig])

  // Get current level data
  const currentLevelData = useMemo(() => {
    if (!cascade.length) return []
    const level = cascade.find(c => c.depth === currentDepth)
    return level ? level.data : []
  }, [cascade, currentDepth])

  // Get filtered data for selected key prefix
  const filteredData = useMemo(() => {
    if (!selectedKeyPrefix.length) return currentLevelData
    return currentLevelData.filter(item => 
      selectedKeyPrefix.every((p, i) => item.key[i] === p)
    )
  }, [currentLevelData, selectedKeyPrefix])

  // Compute gradient cascade data (all depths for a key path)
  const gradientData = useMemo(() => {
    if (!selectedKeyPrefix.length) return null
    return cascade.map(level => {
      const matches = level.data.filter(item => 
        selectedKeyPrefix.every((p, i) => item.key[i] === p)
      )
      return {
        depth: level.depth,
        label: level.label,
        count: matches.length,
        metrics: matches.reduce((acc, m) => {
          if (m[selectedMetric] !== undefined) {
            acc.sum += m[selectedMetric]
            acc.count += m.trans_count || 1
            acc.min = Math.min(acc.min, m[selectedMetric])
            acc.max = Math.max(acc.max, m[selectedMetric])
          }
          return acc
        }, { sum: 0, count: 0, min: Infinity, max: -Infinity })
      }
    }).filter(d => d.count > 0)
  }, [cascade, selectedKeyPrefix, selectedMetric])

  // Fixed width export
  const fixedWidthData = useMemo(() => {
    if (!showFixedWidth) return ''
    return toFixedWidth(transactions.slice(0, 100))
  }, [transactions, showFixedWidth])

  return (
    <div className="app">
      <header className="app-header">
        <h1>DayJob Cascade Gridview</h1>
        <p className="subtitle">Sales Map/Reduce Cascade · Columnar Pattern · Binsearch-Ordered Keys</p>
      </header>

      <div className="app-toolbar">
        <div className="toolbar-group">
          <label>Depth: </label>
          <DepthSelector 
            value={currentDepth} 
            onChange={setCurrentDepth}
            maxDepth={7}
            labels={DEPTH_LABELS}
          />
        </div>
        
        <div className="toolbar-group">
          <label>Metric: </label>
          <MetricSelector 
            value={selectedMetric} 
            onChange={setSelectedMetric}
            metrics={METRICS}
          />
        </div>

        <div className="toolbar-group">
          <label>View: </label>
          <select value={viewMode} onChange={e => setViewMode(e.target.value)} className="select">
            <option value="cascade">Cascade Grid</option>
            <option value="grid">Flat Grid</option>
            <option value="gradient">Gradient Cascade</option>
          </select>
        </div>

        <div className="toolbar-group">
          <button onClick={regenerateData} disabled={isGenerating} className="btn">
            {isGenerating ? 'Generating...' : 'Regenerate'}
          </button>
          <button onClick={() => setShowFixedWidth(!showFixedWidth)} className="btn secondary">
            {showFixedWidth ? 'Hide FWF' : 'Show FWF'}
          </button>
        </div>

        <div className="toolbar-group stats">
          <span>Leaf TX: {transactions.length.toLocaleString()}</span>
          <span>Depth {currentDepth}: {currentLevelData.length} rollups</span>
          {selectedKeyPrefix.length && (
            <span>Prefix: {selectedKeyPrefix.join(' › ')}</span>
          )}
        </div>
      </div>

      <div className="app-main">
        <aside className="sidebar">
          <KeyInspector
            cascade={cascade}
            currentDepth={currentDepth}
            selectedPrefix={selectedKeyPrefix}
            onSelectPrefix={setSelectedKeyPrefix}
            selectedMetric={selectedMetric}
          />
          
          <StatsPanel
            readings={transactions}
            cascade={cascade}
            currentDepth={currentDepth}
            selectedMetric={selectedMetric}
            selectedPrefix={selectedKeyPrefix}
          />
        </aside>

        <main className="main-content">
          {viewMode === 'cascade' && (
            <CascadeGrid
              cascade={cascade}
              currentDepth={currentDepth}
              selectedMetric={selectedMetric}
              selectedPrefix={selectedKeyPrefix}
              onSelectPrefix={setSelectedKeyPrefix}
            />
          )}
          
          {viewMode === 'grid' && (
            <FlatGrid
              data={filteredData}
              depth={currentDepth}
              metric={selectedMetric}
              onSelectPrefix={setSelectedKeyPrefix}
            />
          )}
          
          {viewMode === 'gradient' && (
            <GradientCascade
              gradientData={gradientData}
              metric={selectedMetric}
              prefix={selectedKeyPrefix}
            />
          )}

          {showFixedWidth && fixedWidthData && (
            <div className="panel fwf-panel">
              <div className="panel-header">
                <span>Fixed-Width Format (DayJobTest coords)</span>
                <span className="level-count">{Math.min(transactions.length, 100)} rows</span>
              </div>
              <div className="panel-body">
                <pre className="fwf-content">{fixedWidthData}</pre>
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <p>Map: emit([region, area, year, month, day, category, plu], {qty, amt, count}) · Reduce: sum/count/avg · Rereduce: combine partials</p>
        <p style={{ marginTop: 4, fontSize: '10px', opacity: 0.6 }}>
          Inspired by columnar/cursors/DayJobTest.kt · Fixed-width: SalesNo(11) AreaID(4) Date(10) PluNo(5) ItemName(20) Qty(11) Amt(11) Mode(5)
        </p>
      </footer>
    </div>
  )
}

// Flat grid view for detailed inspection
function FlatGrid({ data, depth, metric, onSelectPrefix }) {
  const columns = ['Key', 'Count', 'Qty', 'Amount', 'Avg Price', 'Unique Items', 'Categories']
  
  return (
    <div className="grid-view">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => <th key={col}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 200).map((row, idx) => (
            <tr 
              key={idx} 
              onClick={() => onSelectPrefix(row.key)}
              className="clickable-row"
            >
              <td className="key-cell">
                <span className="key-path">{row.key.join(' › ')}</span>
                <span className="depth-badge">depth {depth}</span>
              </td>
              <td>{row.trans_count.toLocaleString()}</td>
              <td>{row.quantity.toLocaleString()}</td>
              <td>{row.amount.toLocaleString()}</td>
              <td>{row.avg_price?.toLocaleString(undefined, {maximumFractionDigits: 2}) ?? '—'}</td>
              <td>{row.unique_items.toLocaleString()}</td>
              <td>{row.categories?.join(', ') ?? '—'}</td>
            </tr>
          ))}
          {data.length > 200 && (
            <tr>
              <td colSpan={7} className="truncated">... and {data.length - 200} more rows (click a row to drill down)</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default App
import React, { useMemo, useState } from 'react'

function CascadeGrid({ cascade, currentDepth, selectedMetric, selectedPrefix, onSelectPrefix }) {
  // Find the active depth level
  const activeLevel = useMemo(() => cascade.find(c => c.depth === currentDepth), [cascade, currentDepth])
  
  // Get all levels for the cascade view
  const levels = useMemo(() => cascade.slice(0, currentDepth + 1), [cascade, currentDepth])

  const handleRowClick = (levelDepth, key) => {
    onSelectPrefix(key)
  }

  const isRowSelected = (key) => {
    if (!selectedPrefix.length) return false
    return key.length >= selectedPrefix.length && 
      key.slice(0, selectedPrefix.length).every((k, i) => k === selectedPrefix[i])
  }

  return (
    <div className="cascade-grid">
      {levels.map((level, idx) => (
        <div 
          key={level.depth} 
          className={`cascade-level ${level.depth === currentDepth ? 'active-depth' : ''}`}
        >
          <div className={`level-header ${level.depth === currentDepth ? 'active' : ''}`}>
            <span className="level-label">{level.label}</span>
            <span className="level-count">{level.data.length} aggregates · depth {level.depth}</span>
          </div>
          <div className="level-body">
            {level.data.slice(0, 50).map((row, rowIdx) => (
              <div
                key={rowIdx}
                className={`cascade-row ${isRowSelected(row.key) ? 'selected' : ''}`}
                onClick={() => handleRowClick(level.depth, row.key)}
              >
                <div className="row-key">
                  {row.key.map((segment, segIdx) => (
                    <span 
                      key={segIdx} 
                      className={`key-segment ${segIdx === row.key.length - 1 ? 'last' : ''}`}
                    >
                      {segment}
                    </span>
                  ))}
                </div>
                <div className="row-metrics">
                  {selectedMetric && row.metrics?.[selectedMetric] && (
                    <>
                      <div className="metric-value">
                        <span className="metric-label">sum</span>
                        <span className="metric-number">{row.metrics[selectedMetric].sum.toLocaleString()}</span>
                      </div>
                      <div className="metric-value">
                        <span className="metric-label">avg</span>
                        <span className="metric-number">{row.metrics[selectedMetric].avg.toLocaleString()}</span>
                      </div>
                      <div className="metric-value">
                        <span className="metric-label">min</span>
                        <span className="metric-number">{row.metrics[selectedMetric].min.toLocaleString()}</span>
                      </div>
                      <div className="metric-value">
                        <span className="metric-label">max</span>
                        <span className="metric-number">{row.metrics[selectedMetric].max.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  {!selectedMetric && (
                    <span className="metric-number">Count: {row.count.toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
            {level.data.length > 50 && (
              <div className="cascade-row" style={{ opacity: 0.6, cursor: 'default' }}>
                <span style={{ color: 'var(--fg-subtle)' }}>
                  ... and {level.data.length - 50} more aggregates
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default CascadeGrid
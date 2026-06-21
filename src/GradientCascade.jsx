import React, { useMemo } from 'react'

function GradientCascade({ gradientData, selectedMetric, selectedPrefix, cascade }) {
  // The gradient cascade shows how rollups evolve as key width expands/contracts
  // This mirrors the CouchDB viewserver pattern: emit([region, zone, rack, node, time...], doc)
  // reduce() produces aggregates at each key prefix length
  
  const visibleDepths = useMemo(() => gradientData?.filter(d => d.count > 0) || [], [gradientData])
  
  if (!visibleDepths.length) return null
  
  const maxCount = Math.max(...visibleDepths.map(d => d.count))
  const maxSum = Math.max(...visibleDepths.map(d => d.metrics?.sum || 0))
  
  return (
    <div className="panel">
      <div className="panel-header">
        <span>Gradient Cascade — {selectedPrefix.length ? selectedPrefix.join(' › ') : '(select a key path)'}</span>
        <span className="level-count">{selectedMetric}</span>
      </div>
      <div className="panel-body">
        <div className="gradient-cascade">
          {visibleDepths.map((level, idx) => {
            const width = maxSum > 0 ? (level.metrics.sum / maxSum) * 100 : 0
            const countWidth = maxCount > 0 ? (level.count / maxCount) * 100 : 0
            const avg = level.metrics.count > 0 ? level.metrics.sum / level.metrics.count : 0
            
            // Calculate "precision" - how many key components at this depth
            const keyPrecision = level.depth
            const isSelectedDepth = selectedPrefix.length === level.depth - 1 // account for root
            
            return (
              <div 
                key={level.depth} 
                className={`gradient-row ${isSelectedDepth ? 'selected-depth' : ''}`}
                style={{ opacity: level.count > 0 ? 1 : 0.3 }}
              >
                <div className="gradient-row-header">
                  <span className="gradient-depth-badge">L{level.depth}</span>
                  <span className="gradient-label">{level.label}</span>
                  <span className="gradient-count">{level.count.toLocaleString()}</span>
                </div>
                
                <div className="gradient-bars">
                  {/* Sum bar - represents total aggregate volume */}
                  <div className="gradient-bar-container">
                    <div 
                      className="gradient-bar gradient-bar-sum"
                      style={{ width: `${width}%` }}
                      title={`Sum: ${level.metrics.sum.toLocaleString()}`}
                    >
                      <span className="bar-label">Σ</span>
                      <span className="bar-value">{level.metrics.sum.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {/* Count bar - represents number of leaf documents */}
                  <div className="gradient-bar-container">
                    <div 
                      className="gradient-bar gradient-bar-count"
                      style={{ width: `${countWidth}%` }}
                      title={`Count: ${level.count.toLocaleString()}`}
                    >
                      <span className="bar-label">N</span>
                      <span className="bar-value">{level.count.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {/* Avg indicator */}
                  <div className="gradient-avg" style={{ 
                    left: `${Math.min(width, 95)}%` 
                  }} title={`Avg: ${avg.toFixed(2)}`}>
                    ⌀ {avg.toFixed(1)}
                  </div>
                </div>
                
                {/* Key precision indicator - shows key component at this depth */}
                <div className="gradient-key-info">
                  <span className="precision-label">key[{keyPrecision - 1}]</span>
                  {selectedPrefix[keyPrecision - 1] && (
                    <span className="precision-value">{selectedPrefix[keyPrecision - 1]}</span>
                  )}
                  <span className="precision-range">
                    [{level.metrics.min.toFixed(1)} … {level.metrics.max.toFixed(1)}]
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        
        {/* Key width expansion/contraction visualization */}
        <div className="key-width-visualization">
          <div className="viz-header">Key Width Expansion → Rollup Contraction</div>
          <div className="viz-bars">
            {visibleDepths.map((level, idx) => {
              const keyWidth = level.depth
              const rollupRatio = level.metrics.count > 0 ? 
                (level.metrics.count / visibleDepths[visibleDepths.length - 1]?.metrics.count || 1) * 100 : 0
              
              return (
                <div key={level.depth} className="viz-bar-row">
                  <div 
                    className="viz-key-width"
                    style={{ width: `${Math.min(keyWidth * 10, 100)}%` }}
                    title={`Key components: ${keyWidth}`}
                  >
                    W{keyWidth}
                  </div>
                  <div 
                    className="viz-rollup-ratio"
                    style={{ width: `${rollupRatio}%` }}
                    title={`Rollup ratio: ${(rollupRatio * 100).toFixed(1)}%`}
                  >
                    R{rollupRatio.toFixed(0)}%
                  </div>
                </div>
              )
            })}
          </div>
          <div className="viz-legend">
            <span>← Narrow keys (high cardinality, fine precision)</span>
            <span>Wide keys (low cardinality, coarse rollup) →</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GradientCascade
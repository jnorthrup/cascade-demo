import React, { useMemo } from 'react'

function StatsPanel({ readings, cascade, currentDepth, selectedMetric, selectedPrefix }) {
  const stats = useMemo(() => {
    if (!readings.length) return null
    
    const currentLevel = cascade.find(c => c.depth === currentDepth)
    const aggregates = currentLevel?.data || []
    
    // Compute totals for selected metric
    let totalSum = 0
    let totalCount = 0
    let globalMin = Infinity
    let globalMax = -Infinity
    
    for (const agg of aggregates) {
      if (agg.metrics?.[selectedMetric]) {
        totalSum += agg.metrics[selectedMetric].sum
        totalCount += agg.count
        globalMin = Math.min(globalMin, agg.metrics[selectedMetric].min)
        globalMax = Math.max(globalMax, agg.metrics[selectedMetric].max)
      }
    }
    
    const avg = totalCount > 0 ? totalSum / totalCount : 0
    
    // Key space stats
    const uniqueKeys = aggregates.length
    const maxPossibleKeys = Math.pow(10, currentDepth) // rough estimate
    const sparsity = maxPossibleKeys > 0 ? (uniqueKeys / maxPossibleKeys * 100).toFixed(2) : 0
    
    // Prefix-specific stats
    let prefixStats = null
    if (selectedPrefix.length) {
      const prefixAggs = aggregates.filter(a => 
        selectedPrefix.every((p, i) => a.key[i] === p)
      )
      let pSum = 0, pCount = 0, pMin = Infinity, pMax = -Infinity
      for (const agg of prefixAggs) {
        if (agg.metrics?.[selectedMetric]) {
          pSum += agg.metrics[selectedMetric].sum
          pCount += agg.count
          pMin = Math.min(pMin, agg.metrics[selectedMetric].min)
          pMax = Math.max(pMax, agg.metrics[selectedMetric].max)
        }
      }
      if (pCount > 0) {
        prefixStats = {
          count: prefixAggs.length,
          sum: pSum,
          avg: pSum / pCount,
          min: pMin,
          max: pMax
        }
      }
    }
    
    return {
      totalLeaves: readings.length,
      aggregates: uniqueKeys,
      totalSum,
      avg,
      globalMin,
      globalMax,
      sparsity,
      prefixStats
    }
  }, [readings, cascade, currentDepth, selectedMetric, selectedPrefix])
  
  if (!stats) return <div className="panel"><div className="panel-body">No data</div></div>
  
  return (
    <div className="panel">
      <div className="panel-header">
        <span>Statistics</span>
        <span className="level-count">Depth {currentDepth}</span>
      </div>
      <div className="panel-body">
        <div className="stat-grid">
          <div className="stat-item">
            <div className="stat-label">Leaf Documents</div>
            <div className="stat-value">{stats.totalLeaves.toLocaleString()}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Aggregates at Depth</div>
            <div className="stat-value">{stats.aggregates.toLocaleString()}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Sum</div>
            <div className="stat-value accent">{stats.totalSum.toLocaleString()}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Average</div>
            <div className="stat-value accent">{stats.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Min</div>
            <div className="stat-value warn">{stats.globalMin.toLocaleString()}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Max</div>
            <div className="stat-value info">{stats.globalMax.toLocaleString()}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Key Space Sparsity</div>
            <div className="stat-value">{stats.sparsity}%</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Reduction Factor</div>
            <div className="stat-value">
              {stats.totalLeaves > 0 ? (stats.totalLeaves / stats.aggregates).toFixed(1) + 'x' : '—'}
            </div>
          </div>
        </div>
        
        {stats.prefixStats && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Prefix: {selectedPrefix.join(' › ')}
            </div>
            <div className="stat-grid">
              <div className="stat-item">
                <div className="stat-label">Matching Aggregates</div>
                <div className="stat-value">{stats.prefixStats.count}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Sum</div>
                <div className="stat-value accent">{stats.prefixStats.sum.toLocaleString()}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Average</div>
                <div className="stat-value accent">{stats.prefixStats.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Min</div>
                <div className="stat-value warn">{stats.prefixStats.min.toLocaleString()}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Max</div>
                <div className="stat-value info">{stats.prefixStats.max.toLocaleString()}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Coverage</div>
                <div className="stat-value">
                  {(stats.prefixStats.sum / stats.totalSum * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--fg-subtle)' }}>
          <div>Map: emit([region, zone, rack, node, Y, M, D, h, m], doc)</div>
          <div>Reduce: sum/avg/min/max per key prefix</div>
          <div>Rereduce: combine partial aggregates</div>
          <div style={{ marginTop: 8, color: 'var(--accent)' }}>
            Binsearch-ordered keys enable O(log n) slice extraction
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatsPanel
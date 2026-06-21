import React from 'react'

const DEPTH_LABELS = [
  'region', 'zone', 'rack', 'node', 
  'year', 'month', 'day', 'hour', 'minute'
]

function DepthSelector({ value, onChange, maxDepth, labels }) {
  return (
    <div className="depth-selector" role="radiogroup" aria-label="Select aggregation depth">
      {Array.from({ length: maxDepth }, (_, i) => i + 1).map(depth => (
        <button
          key={depth}
          className={`depth-btn ${value === depth ? 'active' : ''}`}
          onClick={() => onChange(depth)}
          role="radio"
          aria-checked={value === depth}
          title={`${labels[depth - 1] || `level_${depth}`} (depth ${depth})`}
        >
          {labels[depth - 1] || `L${depth}`}
          <span style={{ 
            marginLeft: 4, 
            fontSize: '9px', 
            opacity: 0.6,
            fontWeight: 'normal'
          }}>
            {depth}
          </span>
        </button>
      ))}
    </div>
  )
}

export default DepthSelector
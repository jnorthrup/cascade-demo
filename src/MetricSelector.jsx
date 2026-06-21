import React from 'react'

const METRICS = ['quantity', 'amount', 'trans_count', 'avg_price', 'unique_items', 'unique_trans']

const METRIC_LABELS = {
  quantity: 'Qty',
  amount: 'Amount',
  trans_count: 'Tx Count',
  avg_price: 'Avg Price',
  unique_items: 'Unique Items',
  unique_trans: 'Unique Tx'
}

function MetricSelector({ value, onChange, metrics }) {
  return (
    <div className="metric-selector" role="radiogroup" aria-label="Select metric">
      {metrics.map(metric => (
        <button
          key={metric}
          className={`metric-btn ${value === metric ? 'active' : ''}`}
          onClick={() => onChange(metric)}
          role="radio"
          aria-checked={value === metric}
          title={METRIC_LABELS[metric] || metric}
        >
          {METRIC_LABELS[metric] || metric}
        </button>
      ))}
    </div>
  )
}

export default MetricSelector
import React, { useMemo, useState } from 'react'

function KeyInspector({ cascade, currentDepth, selectedPrefix, onSelectPrefix, selectedMetric }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  
  // Build tree structure from cascade data
  const tree = useMemo(() => {
    if (!cascade.length) return []
    
    // Use the deepest available level that has data
    const maxDepthData = cascade[cascade.length - 1]
    if (!maxDepthData?.data?.length) return []
    
    // Build a tree from the leaf level up
    const root = { 
      key: [], 
      label: 'root', 
      children: new Map(), 
      count: 0,
      metrics: {}
    }
    
    // Aggregate counts and metrics at each node
    for (const level of cascade) {
      for (const row of level.data) {
        let node = root
        node.count += row.count
        
        // Aggregate metrics
        if (row[selectedMetric]) {
          if (!node.metrics[selectedMetric]) {
            node.metrics[selectedMetric] = { sum: 0, min: Infinity, max: -Infinity, count: 0 }
          }
          const m = node.metrics[selectedMetric]
          m.sum += row[selectedMetric].sum
          m.count += row.count
          m.min = Math.min(m.min, row[selectedMetric].min)
          m.max = Math.max(m.max, row[selectedMetric].max)
        }
        
        for (let i = 0; i < row.key.length; i++) {
          const segment = row.key[i]
          if (!node.children.has(segment)) {
            node.children.set(segment, { 
              key: row.key.slice(0, i + 1),
              label: segment,
              children: new Map(),
              count: 0,
              metrics: {},
              depth: i + 1
            })
          }
          node = node.children.get(segment)
          node.count += row.count
          
          if (row[selectedMetric]) {
            if (!node.metrics[selectedMetric]) {
              node.metrics[selectedMetric] = { sum: 0, min: Infinity, max: -Infinity, count: 0 }
            }
            const m = node.metrics[selectedMetric]
            m.sum += row[selectedMetric].sum
            m.count += row.count
            m.min = Math.min(m.min, row[selectedMetric].min)
            m.max = Math.max(m.max, row[selectedMetric].max)
          }
        }
      }
    }
    
    // Convert Map to array for rendering
    function convertNode(node) {
      return {
        ...node,
        children: Array.from(node.children.values()).map(convertNode).sort((a, b) => 
          String(a.label).localeCompare(String(b.label))
        )
      }
    }
    
    return convertNode(root).children
  }, [cascade, selectedMetric])
  
  // Check if a node's key path matches the selected prefix
  const isNodeSelected = (key) => {
    if (!selectedPrefix.length) return false
    return key.length >= selectedPrefix.length && 
      key.slice(0, selectedPrefix.length).every((k, i) => k === selectedPrefix[i])
  }
  
  // Check if a node is an ancestor of the selected prefix
  const isNodeAncestor = (key) => {
    if (!selectedPrefix.length) return false
    return selectedPrefix.length > key.length &&
      key.every((k, i) => k === selectedPrefix[i])
  }
  
  const toggleExpand = (key) => {
    const keyStr = key.join('|')
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(keyStr)) next.delete(keyStr)
      else next.add(keyStr)
      return next
    })
  }
  
  const isExpanded = (key) => expandedNodes.has(key.join('|'))
  
  const renderNode = (node, depth = 0) => {
    const keyStr = node.key.join('|')
    const selected = isNodeSelected(node.key)
    const ancestor = isNodeAncestor(node.key)
    const hasChildren = node.children.length > 0
    const expanded = isExpanded(node.key) || ancestor // Auto-expand ancestors of selection
    
    // Auto-expand ancestors
    if (ancestor && !expandedNodes.has(keyStr)) {
      setExpandedNodes(prev => new Set(prev).add(keyStr))
    }
    
    const metric = node.metrics[selectedMetric]
    const avg = metric ? Math.round((metric.sum / metric.count) * 100) / 100 : null
    
    return (
      <div key={keyStr} className="tree-node" style={{ paddingLeft: 8 + depth * 12 }}>
        <div 
          className={`tree-label ${selected ? 'selected' : ''} ${ancestor ? 'ancestor' : ''}`}
          onClick={() => onSelectPrefix(node.key)}
          style={{ opacity: node.depth > currentDepth ? 0.5 : 1 }}
        >
          {hasChildren && (
            <span className="tree-expand" onClick={e => { e.stopPropagation(); toggleExpand(node.key) }}>
              {expanded ? '▼' : '▶'}
            </span>
          )}
          {!hasChildren && <span className="tree-expand">·</span>}
          <span className="tree-name">{node.label}</span>
          <span className="tree-count">{node.count.toLocaleString()}</span>
          {avg !== null && (
            <span className="tree-metric">avg: {avg.toLocaleString()}</span>
          )}
        </div>
        {expanded && hasChildren && (
          <div className="tree-children">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }
  
  return (
    <div className="panel">
      <div className="panel-header">
        <span>Key Inspector</span>
        <span className="level-count">Depth ≤ {currentDepth}</span>
      </div>
      <div className="panel-body">
        <div className="key-tree">
          {tree.map(node => renderNode(node))}
        </div>
        {selectedPrefix.length && (
          <div style={{ marginTop: 12, padding: 8, background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', fontSize: '11px' }}>
            <strong>Selected:</strong> {selectedPrefix.join(' › ')}
            <button 
              onClick={() => onSelectPrefix([])}
              style={{ marginLeft: 8, padding: '2px 6px', fontSize: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '3px', cursor: 'pointer' }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default KeyInspector
import React from 'react';

const boxStyle = {
  position: 'fixed',
  bottom: 8,
  left: 8,
  zIndex: 9999,
  background: 'rgba(0,0,0,0.7)',
  color: '#fff',
  padding: '8px 10px',
  borderRadius: '6px',
  fontSize: '12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  maxWidth: '50vw',
  maxHeight: '40vh',
  overflow: 'auto',
  border: '1px solid rgba(255,255,255,0.2)'
};

export default function DebugOverlay({ info }) {
  if (!info?.enabled) return null;
  const lines = [
    `search: ${info.search}`,
    `hash: ${info.hash}`,
    `sel.songId: ${info.sel?.songId || ''}`,
    `sel.chartId: ${info.sel?.chartId || ''}`,
    `sel.mode: ${info.sel?.mode || ''}`,
    `legacy.title: ${info.sel?.legacy?.title || ''}`,
    `legacy.diff/mode: ${info.sel?.legacy?.difficulty || ''} / ${info.sel?.legacy?.mode || ''}`,
    `smData.files: ${info.filesCount}`,
    `simfile.path: ${info.simfilePath || ''}`,
    `simfile.title: ${info.simfileTitle || ''}`,
    `chart.slug/mode/diff: ${info.chartSlug || ''} / ${info.chartMode || ''} / ${info.chartDiff || ''}`,
    `playStyle: ${info.playStyle}`,
    `lastAction: ${info.lastAction || ''}`,
  ];
  return (
    <div style={boxStyle}>
      <div><strong>Debug</strong></div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{lines.join('\n')}</pre>
    </div>
  );
}


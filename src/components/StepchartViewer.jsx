import React, { useState, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { StepchartSection } from './StepchartSection';
import { parseSm } from '../utils/smParser';
import './StepchartViewer.css';

const StepchartViewer = ({ smFileUrl }) => {
  const [simfile, setSimfile] = useState(null);
  const [error, setError] = useState(null);
  const [selectedChart, setSelectedChart] = useState(null);
  const [selectedChartKey, setSelectedChartKey] = useState(null);

  useEffect(() => {
    const loadChart = async () => {
      if (smFileUrl) {
        try {
          const res = await fetch(smFileUrl);
          const text = await res.text();
          const parsedSimfile = parseSm(text);
          setSimfile(parsedSimfile);
          if (parsedSimfile.availableTypes.length > 0) {
            const firstChartKey = parsedSimfile.availableTypes[0].slug;
            setSelectedChartKey(firstChartKey);
            setSelectedChart(parsedSimfile.charts[firstChartKey]);
          }
        } catch (err) {
          setError(err.message);
          console.error(err);
        }
      }
    };
    loadChart();
  }, [smFileUrl]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!simfile) {
    return <div>Loading...</div>;
  }

  const handleChartChange = (event) => {
    const chartKey = event.target.value;
    setSelectedChartKey(chartKey);
    setSelectedChart(simfile.charts[chartKey]);
  };

  const totalSongHeight = selectedChart
    ? Math.max(
        Number(selectedChart.arrows[selectedChart.arrows.length - 1]?.offset ?? 0),
        Number(selectedChart.freezes[selectedChart.freezes.length - 1]?.endOffset ?? 0)
      ) + 1
    : 0;

  const isSingle = selectedChartKey?.includes('single');
  const sectionsPerChunk = isSingle ? 7 : 4;
  const groupSizeMeasures = 8 * sectionsPerChunk;
  const measureHeightPx = 160; // arrow size 40 * 4 beats
  const itemSize = groupSizeMeasures * measureHeightPx;
  const groupCount = Math.ceil(totalSongHeight / groupSizeMeasures);

  const Row = ({ index, style }) => {
    const groupStart = index * groupSizeMeasures;
    const elems = [];
    for (let i = 0; i < sectionsPerChunk; ++i) {
      const start = groupStart + i * 8;
      if (start >= totalSongHeight) break;
      elems.push(
        <StepchartSection
          key={start}
          chart={selectedChart}
          speedMod={1}
          startOffset={start}
          endOffset={Math.min(totalSongHeight, start + 8)}
        />
      );
    }
    return (
      <div
        style={{ ...style, zIndex: 99999 - index }}
        className="stepchartSectionGroup"
      >
        {elems}
      </div>
    );
  };

  return (
    <div>
      <select onChange={handleChartChange} value={selectedChartKey || ''}>
        {simfile.availableTypes.map((chartType) => (
          <option key={chartType.slug} value={chartType.slug}>
            {chartType.mode} - {chartType.difficulty} ({chartType.feet})
          </option>
        ))}
      </select>
      <List
        className="stepchart-viewer"
        height={512}
        itemCount={groupCount}
        itemSize={itemSize}
        width={256}
      >
        {Row}
      </List>
    </div>
  );
};

export default StepchartViewer;
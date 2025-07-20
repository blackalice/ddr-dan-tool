import React, { useState, useEffect, useContext } from 'react';
import { StepchartSection } from './StepchartSection';
import { parseSm } from '../utils/smParser';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
import './StepchartViewer.css';

const StepchartViewer = ({ smFileUrl }) => {
  const [simfile, setSimfile] = useState(null);
  const [error, setError] = useState(null);
  const [selectedChart, setSelectedChart] = useState(null);
  const [selectedChartKey, setSelectedChartKey] = useState(null);
  const { showRankedRatings } = useContext(SettingsContext);

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

  const sections = [];
  if (selectedChart) {
    for (let i = 0; i < totalSongHeight; i += 8) {
      sections.push(
        <StepchartSection
          key={i}
          chart={selectedChart}
          speedMod={1}
          startOffset={i}
          endOffset={Math.min(totalSongHeight, i + 8)}
        />
      );
    }
  }

  const sectionGroups = [];
  if (selectedChart) {
    const isSingle = selectedChartKey.includes('single');
    const sectionsPerChunk = isSingle ? 7 : 4;

    while (sections.length) {
      const sectionChunk = sections.splice(0, sectionsPerChunk);
      sectionGroups.push(
        <div
          key={sectionGroups.length}
          className="stepchartSectionGroup"
          style={{ zIndex: 99999 - sectionGroups.length }}
        >
          {sectionChunk}
        </div>
      );
    }
  }

  return (
    <div>
      <select onChange={handleChartChange} value={selectedChartKey || ''}>
        {simfile.availableTypes.map((chartType) => (
          <option key={chartType.slug} value={chartType.slug}>
            {chartType.mode} - {chartType.difficulty} ({showRankedRatings && chartType.rankedRating != null ? chartType.rankedRating : chartType.feet})
          </option>
        ))}
      </select>
      <div className="stepchart-viewer">{sectionGroups}</div>
    </div>
  );
};

export default StepchartViewer;
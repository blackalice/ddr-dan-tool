import React, { useMemo } from 'react';

const FLAKE_COUNT = 36;

const SnowfallOverlay = () => {
  const flakes = useMemo(() => (
    Array.from({ length: FLAKE_COUNT }, (_, index) => ({
      id: `flake-${index}`,
      left: `${Math.random() * 100}%`,
      sizeRem: 0.12 + Math.random() * 0.26,
      opacity: 0.35 + Math.random() * 0.55,
      duration: 9 + Math.random() * 12,
      delay: Math.random() * 6,
      drift: -30 + Math.random() * 60,
    }))
  ), []);

  return (
    <div className="snowfall-overlay" aria-hidden="true">
      {flakes.map((flake) => (
        <span
          key={flake.id}
          className="snowflake"
          style={{
            left: flake.left,
            width: `${flake.sizeRem}rem`,
            height: `${flake.sizeRem}rem`,
            opacity: flake.opacity,
            animationDuration: `${flake.duration}s`,
            animationDelay: `-${flake.delay}s`,
            '--snow-drift': `${flake.drift}px`,
          }}
        />
      ))}
    </div>
  );
};

export default SnowfallOverlay;

import React from 'react';

const LOGO_EXTS = ['png', 'jpg', 'jpeg', 'webp'];

function buildLogoCandidates(name) {
  if (!name) return [];
  const mix = encodeURIComponent(name);
  return LOGO_EXTS.map((ext) => `/sm/${mix}/${mix}.${ext}`);
}

export default function GameLogo({
  name,
  className = 'game-logo-img',
  alt,
  width = 90,
  height = 90,
  loading = 'eager',
  decoding = 'sync',
  draggable = false,
}) {
  const candidates = React.useMemo(() => buildLogoCandidates(name), [name]);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(0);
  }, [name]);

  if (!name || candidates.length === 0 || index < 0) return null;
  const src = candidates[index];

  const handleError = () => {
    setIndex((i) => (i + 1 < candidates.length ? i + 1 : -1));
  };

  return (
    <img
      className={className}
      src={src}
      alt={alt ?? name}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      draggable={draggable}
      onError={handleError}
    />
  );
}

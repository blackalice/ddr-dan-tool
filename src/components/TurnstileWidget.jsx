import React, { useEffect, useRef } from 'react';

export default function TurnstileWidget({ siteKey, onVerify, theme = 'auto' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!siteKey) return;

    function render() {
      if (!window.turnstile || !ref.current) return;
      try {
        window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => onVerify?.(token),
          'error-callback': () => onVerify?.(''),
          'expired-callback': () => onVerify?.(''),
          theme,
        });
      } catch {}
    }

    if (window.turnstile) {
      render();
      return;
    }

    const src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    let script = document.querySelector(`script[src="${src}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = render;
      document.head.appendChild(script);
    } else if (script.dataset.loaded) {
      render();
    } else {
      script.addEventListener('load', render, { once: true });
    }
  }, [siteKey, onVerify, theme]);

  if (!siteKey) return null;
  return <div ref={ref} />;
}


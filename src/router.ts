import { useEffect, useState } from 'react';

function getRoute(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash;
  return hash.startsWith('#/') ? hash.slice(1) : '';
}

export function useHashRoute(): string {
  const [route, setRoute] = useState<string>(() => getRoute());
  useEffect(() => {
    const onHash = () => {
      setRoute(getRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

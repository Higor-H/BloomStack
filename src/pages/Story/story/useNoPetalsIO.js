import { useEffect, useRef } from 'react';

export function useNoPetalsIO() {
  const noPetalsCountRef = useRef(0);
  useEffect(() => {
    const html = document.documentElement;
    const inc = () => { noPetalsCountRef.current += 1; html.classList.add('story-no-petals'); };
    const dec = () => {
      noPetalsCountRef.current = Math.max(0, noPetalsCountRef.current - 1);
      if (noPetalsCountRef.current === 0) html.classList.remove('story-no-petals');
    };

    const obs = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? inc() : dec()),
      { threshold: 0.3 }
    );

    const ids = ['polen', 'trees'];
    const targets = ids.map(id => document.getElementById(id)).filter(Boolean);
    targets.forEach(t => obs.observe(t));

    return () => {
      obs.disconnect();
      html.classList.remove('story-no-petals');
      noPetalsCountRef.current = 0;
    };
  }, []);
}

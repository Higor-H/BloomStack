import { useEffect, useRef } from 'react';

export function useNoPetalsIO() {
  const noPetalsCountRef = useRef(0);

  useEffect(() => {
    const html = document.documentElement;

    const hidePetals = () => {
      noPetalsCountRef.current += 1;
      html.classList.add('story-no-petals');
      // força fade-out
      html.style.setProperty('--petals-opacity', '0');
    };

    const showPetals = () => {
      noPetalsCountRef.current = Math.max(0, noPetalsCountRef.current - 1);
      if (noPetalsCountRef.current === 0) {
        // força fade-in
        html.style.setProperty('--petals-opacity', '1');
        // remove a classe depois do fade
        setTimeout(() => {
          html.classList.remove('story-no-petals');
        }, 350); // igual ao tempo da transição
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? hidePetals() : showPetals()),
      { threshold: 0.3 }
    );

    const ids = ['polen', 'trees'];
    const targets = ids.map(id => document.getElementById(id)).filter(Boolean);
    targets.forEach(t => observer.observe(t));

    return () => {
      observer.disconnect();
      html.classList.remove('story-no-petals');
      noPetalsCountRef.current = 0;
      html.style.removeProperty('--petals-opacity');
    };
  }, []);
}

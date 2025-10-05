import { useEffect } from 'react';

export function useInViewIO() {
  useEffect(() => {
    const els = document.querySelectorAll('.story-section .section-content');
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => e.isIntersecting && e.target.classList.add('in-view')),
      { threshold: 0.35 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

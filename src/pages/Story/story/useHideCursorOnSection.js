import { useEffect } from 'react';

export function useHideCursorOnSection(sectionId = 'trees') {
  useEffect(() => {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          document.body.classList.add('has-bee'); // cursor some
        } else {
          document.body.classList.remove('has-bee'); // cursor volta
        }
      },
      { threshold: 0.2 } // quando 20% da seção estiver visível
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      document.body.classList.remove('has-bee'); // garante reset
    };
  }, [sectionId]);
}

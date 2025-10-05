import { useEffect } from 'react';

export function useStoryActiveClasses() {
  useEffect(() => {
    document.documentElement.classList.add('story-active');
    document.body.classList.add('story-active');
    return () => {
      document.documentElement.classList.remove('story-active');
      document.body.classList.remove('story-active');
    };
  }, []);
}

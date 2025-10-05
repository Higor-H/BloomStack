import React, { useEffect, useRef } from 'react';

export default function TreesFlowers({ count = 12 }) {
  const wrapRef = useRef(null);
  const hoverTimersRef = useRef(new Map());
  const lastSpawnRef = useRef(new Map());

  useEffect(() => {
    const section = document.getElementById('trees');
    if (!section) return;
    const el = wrapRef.current;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (el) {
          if (entry.isIntersecting) el.classList.add('in');
          else el.classList.remove('in');
        }
      },
      { threshold: 0.35 }
    );
    io.observe(section);

    function markHovered(flower) {
      if (!flower) return;
      flower.classList.add('is-hovered');
      const tm = hoverTimersRef.current.get(flower);
      if (tm) clearTimeout(tm);
      const t = setTimeout(() => flower.classList.remove('is-hovered'), 180);
      hoverTimersRef.current.set(flower, t);
    }
    function spawnPollen(flower, n = 3) {
      const now = Date.now();
      const last = lastSpawnRef.current.get(flower) || 0;
      if (now - last < 120) return;
      lastSpawnRef.current.set(flower, now);

      const bloom = flower.querySelector('.tf-bloom') || flower;
      for (let i = 0; i < n; i++) {
        const p = document.createElement('span');
        p.className = 'tf-pollen';
        const tx = (Math.random() * 46 - 23).toFixed(1) + 'px';
        const ty = (-30 - Math.random() * 40).toFixed(1) + 'px';
        const delay = (Math.random() * 0.12).toFixed(2) + 's';
        const scale = (0.6 + Math.random() * 0.4).toFixed(2);
        p.style.setProperty('--tx', tx);
        p.style.setProperty('--ty', ty);
        p.style.setProperty('--pd', delay);
        p.style.setProperty('--ps', scale);
        bloom.appendChild(p);
        p.addEventListener('animationend', () => p.remove(), { once: true });
      }
    }
    function onPointerMove(e) {
      const target = e.target?.closest?.('.tree-flower');
      if (!target || !el?.contains(target)) return;
      markHovered(target);
      spawnPollen(target, 2 + Math.floor(Math.random() * 2));
    }
    function onPointerLeave() {
      el.querySelectorAll('.tree-flower.is-hovered').forEach(f => f.classList.remove('is-hovered'));
    }

    el?.addEventListener('pointermove', onPointerMove);
    el?.addEventListener('pointerleave', onPointerLeave);

    return () => {
      io.disconnect();
      el?.removeEventListener('pointermove', onPointerMove);
      el?.removeEventListener('pointerleave', onPointerLeave);
      hoverTimersRef.current.forEach(t => clearTimeout(t));
      hoverTimersRef.current.clear();
      lastSpawnRef.current.clear();
    };
  }, []);

  const items = Array.from({ length: count }).map((_, i) => {
    const left = 6 + Math.random() * 88;
    const h = 110 + Math.random() * 120;
    const delay = 0.08 * i + Math.random() * 0.15;
    const hue = 315 + Math.floor(Math.random() * 30);
    const sway = (Math.random() * 2 - 1).toFixed(2);
    return { left, h, delay, hue, sway };
  });

  return (
    <div ref={wrapRef} className="trees-flowers" aria-hidden="true">
      {items.map((f, idx) => (
        <div
          key={idx}
          className="tree-flower"
          style={{
            left: `${f.left}%`,
            ['--h']: `${f.h}px`,
            ['--d']: `${f.delay}s`,
            ['--hue']: f.hue,
            ['--sway']: f.sway
          }}
        >
          <div className="tf-stem" />
          <div className="tf-leaf tf-leaf--l" />
          <div className="tf-leaf tf-leaf--r" />
          <div className="tf-bloom">
            {Array.from({ length: 12 }).map((__, i) => (
              <span key={i} className="tf-petal" style={{ ['--i']: i }} />
            ))}
            <span className="tf-center" />
          </div>
        </div>
      ))}
    </div>
  );
}

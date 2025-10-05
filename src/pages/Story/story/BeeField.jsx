import React, { useEffect, useRef } from 'react';

export default function BeeField({ pollenCount = 20, trailLen = 20 }) {
  const fieldRef = useRef(null);
  const beeRef = useRef(null);
  const trailRef = useRef(null);
  const rafRef = useRef(0);

  const beePos = useRef({ x: 0, y: 0 });
  const angRef = useRef(0);
  const ptrRef = useRef({ x: 0, y: 0, has: false });

  const pollen = useRef([]);
  const frameCount = useRef(0);
  const initedRef = useRef(false);
  const hasPollenRef = useRef(false);
  const flowerEmitRef = useRef(new WeakMap());

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const host = el.parentElement || el;

    while (trailRef.current.children.length < trailLen) {
      const dot = document.createElement('span');
      dot.className = 'trail-dot';
      trailRef.current.appendChild(dot);
    }
    const trailPts = [];

    function spawnPollen(n = pollenCount) {
      const rect = el.getBoundingClientRect();
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = 'pollen';
        const x = Math.random() * rect.width;
        const y = Math.random() * rect.height;
        s.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        el.appendChild(s);
        pollen.current.push({
          el: s, x, y,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          stuck: false, offx: 0, offy: 0
        });
      }
    }
    spawnPollen(pollenCount);

    function setTarget(e) {
      const r = host.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      ptrRef.current = { x, y, has: true };
    }
    function onLeave() { ptrRef.current.has = false; }

    host.addEventListener('pointermove', setTarget, { passive: true });
    host.addEventListener('touchmove', setTarget, { passive: true });
    host.addEventListener('pointerleave', onLeave, { passive: true });

    function updatePollen(rect, bx, by) {
      const items = pollen.current;
      let stuckAny = false;
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        if (!p.stuck) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > rect.width) p.vx *= -1;
          if (p.y < 0 || p.y > rect.height) p.vy *= -1;
          const dx = p.x - bx, dy = p.y - by;
          if (dx * dx + dy * dy < 18 * 18 && ptrRef.current.has) {
            p.stuck = true;
            p.offx = dx; p.offy = dy;
            p.el.classList.add('stuck');
          }
        } else {
          p.x = bx + p.offx;
          p.y = by + p.offy;
          p.offx *= 0.9; p.offy *= 0.9;
          stuckAny = true;
        }
        p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      }
      hasPollenRef.current = stuckAny;
    }

    function emitFromFlower(flower, n = 5) {
      const now = Date.now();
      const last = flowerEmitRef.current.get(flower) || 0;
      if (now - last < 220) return;
      flowerEmitRef.current.set(flower, now);

      const bloom = flower.querySelector('.tf-bloom') || flower;
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = 'tf-pollen';
        const tx = (Math.random() * 60 - 30).toFixed(1) + 'px';
        const ty = (-40 - Math.random() * 70).toFixed(1) + 'px';
        const delay = (Math.random() * 0.12).toFixed(2) + 's';
        const scale = (0.7 + Math.random() * 0.5).toFixed(2);
        s.style.setProperty('--tx', tx);
        s.style.setProperty('--ty', ty);
        s.style.setProperty('--pd', delay);
        s.style.setProperty('--ps', scale);
        bloom.appendChild(s);
        s.addEventListener('animationend', () => s.remove(), { once: true });
      }
    }

    function checkFlowers(rectHost, bx, by) {
      if (!hasPollenRef.current) return;
      const flowers = host.querySelectorAll('.tree-flower');
      flowers.forEach(f => {
        const b = f.querySelector('.tf-bloom');
        const rb = b?.getBoundingClientRect?.();
        if (!rb) return;
        const cx = rb.left - rectHost.left + rb.width / 2;
        const cy = rb.top - rectHost.top + rb.height / 2;
        const dx = cx - bx;
        const dy = cy - by;
        if (dx * dx + dy * dy <= 36 * 36) {
          if (!f.classList.contains('bloomed')) f.classList.add('bloomed');
          emitFromFlower(f, 4 + Math.floor(Math.random() * 4));
        }
      });
    }

    function frame() {
      const rect = host.getBoundingClientRect();

      if (!initedRef.current) {
        beePos.current.x = rect.width * 0.5;
        beePos.current.y = rect.height * 0.6;
        initedRef.current = true;
      }

      const px = ptrRef.current.has ? ptrRef.current.x : beePos.current.x;
      const py = ptrRef.current.has ? ptrRef.current.y : beePos.current.y;

      const dx = px - beePos.current.x;
      const dy = py - beePos.current.y;
      const sp = Math.hypot(dx, dy);
      if (sp > 0.01) angRef.current = Math.atan2(dy, dx);

      beePos.current.x = px;
      beePos.current.y = py;

      if (beeRef.current) {
        beeRef.current.style.transform = `translate3d(${px}px, ${py}px, 0) rotate(${angRef.current}rad)`;
      }

      trailPts.push({ x: px, y: py });
      if (trailPts.length > trailLen) trailPts.shift();
      const children = trailRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const idx = trailPts.length - 1 - i;
        const dot = children[i];
        if (idx >= 0) {
          const p = trailPts[idx];
          dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${1 - i / (trailLen + 6)})`;
          dot.style.opacity = String(Math.max(0, 0.85 - i * 0.03));
        } else {
          dot.style.opacity = '0';
        }
      }

      frameCount.current++;
      if (frameCount.current % 2 === 0) updatePollen(rect, beePos.current.x, beePos.current.y);

      checkFlowers(rect, beePos.current.x, beePos.current.y);

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      host.removeEventListener('pointermove', setTarget);
      host.removeEventListener('touchmove', setTarget);
      host.removeEventListener('pointerleave', onLeave);
      try { pollen.current.forEach(p => p.el.remove()); pollen.current = []; } catch {}
    };
  }, [pollenCount, trailLen]);

  return (
    <div ref={fieldRef} className="bee-field" aria-hidden="true">
      <div ref={beeRef} className="bee">
        <span className="bee__wing bee__wing--l" />
        <span className="bee__wing bee__wing--r" />
        <span className="bee__body" />
      </div>
      <div ref={trailRef} className="bee-trail" />
    </div>
  );
}

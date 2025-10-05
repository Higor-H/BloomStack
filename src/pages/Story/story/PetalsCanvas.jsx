import React, { useEffect, useRef } from 'react';

export default function PetalsCanvas() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const petalsRef = useRef([]);
  const mouseXRef = useRef(0);
  const mouseYRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });

    function setSize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    setSize();

    const TOTAL = 110;

    function drawPetalShape(x, y, w, h, rot, opacity, tintHue) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const grad = ctx.createLinearGradient(0, -h, 0, 0);
      const c1 = `hsla(${tintHue}, 85%, 90%, ${opacity})`;
      const c2 = `hsla(${tintHue + 10}, 75%, 70%, ${Math.max(0.5, opacity - 0.2)})`;
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.strokeStyle = `hsla(${tintHue}, 30%, 40%, ${opacity * 0.35})`;
      ctx.lineWidth = 0.8;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(w * 0.55, -h * 0.55, 0, -h);
      ctx.quadraticCurveTo(-w * 0.55, -h * 0.55, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    class Petal {
      constructor() { this.reset(true); }
      reset(first = false) {
        this.x = -40 - Math.random() * (canvas.clientWidth * 0.25);
        this.y = first ? Math.random() * canvas.clientHeight : Math.random() * canvas.clientHeight;
        const base = window.innerWidth < 480 ? 16 : 22;
        this.w = base + Math.random() * 14;
        this.h = base * 0.8 + Math.random() * 10;
        this.opacity = 0.6 + Math.random() * 0.4;
        this.hue = 330 + Math.floor(Math.random() * 20);
        this.xSpeed = 1.8 + Math.random() * 2.2;
        this.ySpeed = 0.15 + Math.random() * 0.55;
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swaySpeed = 0.01 + Math.random() * 0.02;
        this.rot = Math.random() * Math.PI;
        this.rotSpeed = 0.01 + Math.random() * 0.03;
      }
      draw() {
        drawPetalShape(this.x, this.y, this.w, this.h, this.rot, this.opacity, this.hue);
      }
      animate() {
        const wx = (mouseXRef.current - 0.5) * 10;
        const wy = (mouseYRef.current - 0.5) * 2;
        this.x += this.xSpeed + wx * 0.6;
        this.swayPhase += this.swaySpeed;
        this.y += this.ySpeed + Math.sin(this.swayPhase) * 0.8 + wy * 0.4;
        this.rot += this.rotSpeed;
        if (this.x > canvas.clientWidth + 60 || this.y > canvas.clientHeight + 60) this.reset();
        this.draw();
      }
    }

    function init() {
      petalsRef.current = [];
      for (let i = 0; i < TOTAL; i++) petalsRef.current.push(new Petal());
    }

    function render() {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      petalsRef.current.forEach(p => p.animate());
      rafRef.current = window.requestAnimationFrame(render);
    }

    function onResize() { setSize(); }
    function touchHandler(e) {
      const cx = e?.clientX ?? e?.touches?.[0]?.clientX ?? 0;
      const cy = e?.clientY ?? e?.touches?.[0]?.clientY ?? 0;
      mouseXRef.current = cx / window.innerWidth;
      mouseYRef.current = cy / window.innerHeight;
    }

    init();
    render();

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('mousemove', touchHandler, { passive: true });
    window.addEventListener('touchmove', touchHandler, { passive: true });

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', touchHandler);
      window.removeEventListener('touchmove', touchHandler);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="story-canvas story-canvas--fixed" />;
}

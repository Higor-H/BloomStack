import React, { useEffect, useRef } from 'react';
import './Story.css';

function PetalsCanvas() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const petalsRef = useRef([]);
  const mouseXRef = useRef(0);
  const mouseYRef = useRef(0); // NOVO

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

    // NOVO: desenha uma pétala vetorial com gradiente
    function drawPetalShape(x, y, w, h, rot, opacity, tintHue) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);

      const grad = ctx.createLinearGradient(0, -h, 0, 0);
      // variação leve de cor por pétala
      const c1 = `hsla(${tintHue}, 85%, 90%, ${opacity})`;
      const c2 = `hsla(${tintHue + 10}, 75%, 70%, ${Math.max(0.5, opacity - 0.2)})`;
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.strokeStyle = `hsla(${tintHue}, 30%, 40%, ${opacity * 0.35})`;
      ctx.lineWidth = 0.8;

      // forma tipo gota/pétala
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
      constructor() {
        this.reset(true);
      }
      reset(first = false) {
        // nasce fora da tela à esquerda
        this.x = -40 - Math.random() * (canvas.clientWidth * 0.25);
        this.y = first
          ? Math.random() * canvas.clientHeight
          : Math.random() * canvas.clientHeight;

        const base = window.innerWidth < 480 ? 16 : 22;
        this.w = base + Math.random() * 14;
        this.h = base * 0.8 + Math.random() * 10;
        this.opacity = 0.6 + Math.random() * 0.4;
        this.hue = 330 + Math.floor(Math.random() * 20); // tons de rosa
        // vento predominante (esq -> dir)
        this.xSpeed = 1.8 + Math.random() * 2.2;
        this.ySpeed = 0.15 + Math.random() * 0.55;
        // oscilação + rotação
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swaySpeed = 0.01 + Math.random() * 0.02;
        this.rot = Math.random() * Math.PI;
        this.rotSpeed = 0.01 + Math.random() * 0.03;
      }
      draw() {
        drawPetalShape(this.x, this.y, this.w, this.h, this.rot, this.opacity, this.hue);
      }
      animate() {
        // vento com influência do mouse
        const wx = (mouseXRef.current - 0.5) * 10;
        const wy = (mouseYRef.current - 0.5) * 2;
        this.x += this.xSpeed + wx * 0.6;
        this.swayPhase += this.swaySpeed;
        this.y += this.ySpeed + Math.sin(this.swayPhase) * 0.8 + wy * 0.4;
        this.rot += this.rotSpeed;

        // reciclar quando sair
        if (this.x > canvas.clientWidth + 60 || this.y > canvas.clientHeight + 60) {
          this.reset();
        }
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

    // sem imagem externa: inicia direto
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

const Story = () => {
  // Ativa overrides globais somente nesta página
  useEffect(() => {
    document.documentElement.classList.add('story-active');
    document.body.classList.add('story-active');
    return () => {
      document.documentElement.classList.remove('story-active');
      document.body.classList.remove('story-active');
    };
  }, []);

  useEffect(() => {
    // animação suave ao entrar na viewport
    const els = document.querySelectorAll('.story-section .section-content');
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => e.isIntersecting && e.target.classList.add('in-view')),
      { threshold: 0.35 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  function scrollToNext() {
    const el = document.getElementById('about');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      {/* Canvas único e fixo para compartilhar pétalas entre sessões */}
      <PetalsCanvas />

      <section className="story-hero story-section" aria-label="Florecendo Ideias">
        <div className="section-content">
          <div className="hero-overlay">
            <h1 className="hero-title">Florecendo Ideias</h1>
            <p className="hero-sub">O vento leva pétalas da esquerda para a direita. Mova o mouse ou toque para soprar.</p>
          </div>
        </div>
        <div className="scroll-indicator" onClick={scrollToNext} role="button" aria-label="Ir para a próxima seção">
          <span>Role</span>
          <span className="scroll-indicator__arrow" aria-hidden="true" />
        </div>
      </section>

      <section id="about" className="about story-section" aria-label="Florecendo Ideias — Sobre">
        <div className="section-content">
          <div className="hero-overlay">
            <h1 className="hero-title">Florecendo Ideias</h1>
            <p className="hero-sub">Voce sabiaa as que as plantas são a base para a vida da Terra?</p>
            <p className="hero-sub">Em meio as petalas que voam pelo vento, que cobrem o chão no verão, que dão a belaza da primavera, essas plantas gurdam segredos e habilidade unicas.</p>
            <p className="hero-sub">Elas são quimica, fisica, biologia e vida.</p>
            <p className="hero-sub">Polinizadores</p>
            <p className="hero-sub">Agricultura</p>
            <p className="hero-sub">Medicamentos</p>
            <p className="hero-sub">Combate a erosão</p>
            <p className="hero-sub">Produção de oxigênio</p>
            <p className="hero-sub">Absorção de CO2</p>
            <p className="hero-sub">E muito mais...</p>
          </div>
        </div>
      </section>
    </>
  );
};

export default Story;
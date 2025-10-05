import React, { useEffect, useRef } from 'react';
import './Story.css';

// NOVO: componentes e hooks separados
import PetalsCanvas from './story/PetalsCanvas.jsx';
import TreesFlowers from './story/TreesFlowers.jsx';
import BeeField from './story/BeeField.jsx';
import { useInViewIO } from './story/useInViewIO.js';
import { useNoPetalsIO } from './story/useNoPetalsIO.js';
import { useStoryActiveClasses } from './story/useStoryActiveClasses.js';

const Story = () => {
  // Ativa overrides globais somente nesta página
  useStoryActiveClasses();

  // animação suave ao entrar na viewport
  useInViewIO();

  // esconde pétalas enquanto #polen e/ou #trees estiverem visíveis
  useNoPetalsIO();

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

      <section id="polen" className="about story-section" aria-label="Florecendo Ideias — Sobre">
        <div className="section-content">
          <div className="hero-overlay">
            <h1 className="hero-title">Abelhas</h1>
            <p className="hero-sub">Voce sabiaa as que as plantas são a base para a vida da Terra?</p>
            <p className="hero-sub">Em meio as petalas que voam pelo vento, que cobrem o chão no verão, que dão a belaza da primavera, essas plantas gurdam segredos e habilidade unicas.</p>
            <p className="hero-sub">Elas são quimica, fisica, biologia e vida.</p>
            <p className="hero-sub">Polinizadores</p>
          </div>
        </div>
        {/* campo interativo de abelhas/pólen */}
        <BeeField />
      </section>

      <section id="trees" className="trees story-section" aria-label="Galhos e flores">
        <div className="section-content">
          <div className="hero-overlay">
            <h1 className="hero-title">Galhos em Flor</h1>
            <p className="hero-sub">Florescendo ao fundo para continuar a história.</p>
          </div>
        </div>
        <TreesFlowers count={16} />
        <BeeField />
      </section>
    </>
  );
};

export default Story;
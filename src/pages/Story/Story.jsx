import React, { useEffect, useRef } from 'react';
import './Story.css';
import { Link } from 'react-router-dom';
import Player from "./Player.jsx";


// NOVO: componentes e hooks separados
import PetalsCanvas from './story/PetalsCanvas.jsx';
import TreesFlowers from './story/TreesFlowers.jsx';
import BeeField from './story/BeeField.jsx';
import { useInViewIO } from './story/useInViewIO.js';
import { useNoPetalsIO } from './story/useNoPetalsIO.js';
import { useStoryActiveClasses } from './story/useStoryActiveClasses.js';
import { useHideCursorOnSection } from './story/useHideCursorOnSection.js';
import bgAudio from '../../assets/audio.mp3'; // novo: usa bundler para funcionar no GH Pages

const Story = () => {
  // Ativa overrides globais somente nesta página
  useStoryActiveClasses();

  // animação suave ao entrar na viewport
  useInViewIO();

  // esconde pétalas enquanto #polen e/ou #trees estiverem visíveis
  useNoPetalsIO();

  useHideCursorOnSection('trees'); // faz cursor sumir nessa seção

  function scrollToNext() {
    const el = document.getElementById('about');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  return (
    <>
      {/* Canvas único e fixo para compartilhar pétalas entre sessões */}
      <PetalsCanvas />
      <audio src={bgAudio} autoPlay loop /> {/* antes: "/assets/audio.mp3" */}
      <Player />

      <section className="story-hero story-section" aria-label="Florecendo Ideias">
        <div className="section-content" style={{ padding: '0 16px', maxWidth: 1100, margin: '0 auto' }}>
          <div className="hero-overlay">
            <h1 className="hero-title">Why is monitoring <span style={{ fontWeight: 800 }}>🌸 flowering</span> important?</h1>
            <p className="hero-sub">
              <span style={{ fontWeight: 800, textDecoration: 'underline wavy #dc1ee9ff' }}>🌼 Flowering</span> is an incredible phenomenon that goes far beyond producing flowers that beautify environments and exude pleasant aromas. It is present in many aspects of our lives, being the basis of countless medicines, and its <span style={{ fontWeight: 700, borderBottom: '2px solid #22c55e' }}>🐝 pollination</span> process contributes to environmental stability, supports agriculture, and aids in the prediction and analysis of <b>climate change</b>.
            </p>
          </div>
        </div>
        <div className="scroll-indicator" onClick={scrollToNext} role="button" aria-label="Ir para a próxima seção">
          <span>Role</span>
          <span className="scroll-indicator__arrow" aria-hidden="true" />
        </div>
      </section>

      <section id="about" className="about story-section" aria-label="Florecendo Ideias — Sobre">
        <div className="section-content" style={{ padding: '0 16px', maxWidth: 1100, margin: '0 auto' }}>
          <div className="hero-overlay">
            {/* <h1 className="hero-title">Why is monitoring flowering important?</h1> */}
            <p className="hero-sub">
              Additionally, blooming acts as a highly sensitive <span style={{ fontWeight: 800, textDecoration: 'underline wavy #8b5cf6' }}>bioindicator</span> of environmental changes. That’s why, the study of <span style={{ fontWeight: 800 }}>🌿 plant phenology</span> emerges as a promising approach for monitoring, predicting, and mitigating the impacts of <b >climate change</b> on global vegetation and the species that depend on it. Ultimately, these natural processes play a vital role in our lives here on Earth.
            </p>
            <p className="hero-sub">
              According to Yoseline Angel, a scientist at the University of Maryland-College Park and <span style={{ fontWeight: 800, borderBottom: '2px dashed #0ea5e9' }}>🚀 NASA</span> Goddard Space Flight Center in Greenbelt, Maryland, studies on <span style={{ fontWeight: 700 }}>flowering</span> can support farmers and natural resource managers who depend on these species, as well as the insects and other <span style={{ fontWeight: 700 }}>pollinators</span> that accompany them. Fruits, oilseeds, various <span style={{ fontWeight: 800, textDecoration: 'underline #ef4444' }}>medicines</span>, and cotton are some of the products derived from flowering plants.
            </p>
          </div>
        </div>
      </section>

      <section id="polen" className="about story-section" aria-label="Florecendo Ideias — Sobre">
        <div className="section-content" style={{ padding: '0 16px', maxWidth: 1100, margin: '0 auto' }}>
          <div className="hero-overlay">
            <h1 className="hero-title">Small Heroes <span aria-hidden="true">🐝</span></h1>
            <p className="hero-sub">
              <span style={{ fontWeight: 800, textDecoration: 'underline wavy #16a34a' }}>Pollination</span> is an extremely important process for plants, consisting of the transfer of <span style={{ fontWeight: 700 }}>pollen grains</span> (male gametes) from male to female reproductive structures, an essential step for the formation of <span style={{ fontWeight: 800 }}>seeds</span> and <span style={{ fontWeight: 800 }}>fruits</span>. In gymnosperms, this process occurs predominantly by wind, while in angiosperms, pollen is transferred from the anther to the stigma, and can occur within the same plant (self-pollination) or between different plants (cross-pollination).
            </p>
            <br />
            <p className="hero-sub">
              Validating ground-based records through photographs is essential to confirm satellite observations in flowering studies, allowing for more detailed monitoring of events. In this context, <span style={{ fontWeight: 900, background: 'linear-gradient(90deg,#fef3c7,#fbcfe8)', borderRadius: 8, padding: '0 6px' }}>🌷 FloraQuest</span> emerges as a tool that makes recording blooms more attractive by providing information on <span style={{ fontWeight: 700 }}>pollination</span>, facilitating <span style={{ fontWeight: 700 }}>species identification</span>, and allowing the sharing of cataloged records, thus contributing to the advancement of studies in <span style={{ fontWeight: 800, textDecoration: 'underline wavy #ec4899' }}>Plant Phenology</span>.
            </p>
          </div>
        </div>
        {/* campo interativo de abelhas/pólen */}
        <BeeField activeSectionId="polen" />
      </section>

      <section id="trees" className="trees story-section" aria-label="Galhos e flores">
        <div className="section-content" style={{ padding: '0 16px', maxWidth: 1100, margin: '0 auto' }}>
          <div className="hero-overlay">
            {/* <h1 className="hero-title"></h1> */}
            <p className="hero-sub">
              Have you seen how they impact everyone in the environment? The next time you see a <span style={{ fontWeight: 800 }}>🌸 flower</span>, remember their importance. When you eat a <span style={{ fontWeight: 800 }}>fruit</span>, try to imagine how it got there. Was this flower a bee's favorite spot? Or did a bat pass by? When you're sick and taking <span style={{ fontWeight: 800, textDecoration: 'underline wavy #f43f5e' }}>medicine</span>, which flowers helped you through that moment? How about reciprocating all this help by caring for flowers, getting to know them, and recording your descobertas on <span style={{ fontWeight: 900, background: 'linear-gradient(90deg,#e9d5ff,#d9f99d)', borderRadius: 8, padding: '0 6px' }}>🌷 FloraQuest</span>? Curious? Then let your mind blossom!
            </p>
          </div>
        </div>
        <TreesFlowers count={16} />
        <BeeField activeSectionId="trees" />
        <button
          onClick={scrollToTop}
          className="back-to-top"
          aria-label="Voltar ao topo"
        >
          Up
        </button>

        <Link to="/">
          <button
            type="button"
            style={{
              position: 'fixed',
              left: '20px',
              top: '20px',
              padding: '6px 10px',
              fontSize: '14px',
              fontWeight: 'bold',
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#fff',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              zIndex: 999,
            }}
          >
            Go Back
          </button>
        </Link>

      </section>
    </>
  );
};

export default Story;
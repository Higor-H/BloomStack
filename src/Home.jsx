import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './Home.css'
import {Link} from "react-router-dom";
import { useEffect } from "react";


function Home() {

    useEffect(() => {
        // adiciona classe no body
        document.body.classList.add("home-body");

        // remove quando sair da Home
        return () => {
            document.body.classList.remove("home-body");
        };
    }, []);

  return (
    <>
        <div className="petals-container">
            {[...Array(20)].map((_, i) => (
                <div
                    key={i}
                    className="petal"
                    style={{
                        left: `${Math.random() * 100}vw`,
                        animationDuration: `${4 + Math.random() * 6}s`,
                        animationDelay: `${Math.random() * 5}s`
                    }}
                />
            ))}
        </div>
      <div className="glass-card">
          <div>
              <a href="https://vite.dev" target="_blank">
                  <img src={viteLogo} className="logo" alt="Vite logo" />
              </a>
              <a href="https://react.dev" target="_blank">
                  <img src={reactLogo} className="logo react" alt="React logo" />
              </a>
          </div>
          <h1>BloomStack</h1>
          <div className="card">
              <Link to="/maps">
                  <button>Ir para Maps</button>
              </Link>
              <Link to="/feed" style={{ marginLeft: 8 }}>
                  <button>Ver feed</button>
              </Link>
              <p>
                  Edit <code>src/Home.jsx</code> and save to test HMR
              </p>
          </div>
          <p className="read-the-docs">
              Click on the Vite and React logos to learn more
          </p>
      </div>
    </>
  )
}

export default Home;

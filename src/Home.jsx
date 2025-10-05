import BloomImage from './assets/Bloom_6.png';
import './Home.css'
import {Link} from "react-router-dom";
import { useEffect } from "react";


function Home() {

    useEffect(() => {
        document.body.classList.add("home-body");
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
            <Link to="/story">
                  <img src={BloomImage} className="logo" alt="Bloom logo" />
            </Link>
                 
          </div>
          <div className="card">
              <Link to="/maps">
                  <button>Ir para Maps</button>
              </Link>
              <Link to="/feed" style={{ marginLeft: 8 }}>
                  <button>Ver feed</button>
              </Link>
              <Link to="/charts" style={{ marginLeft: 8, marginTop: 8 }}>
                  <button>Ver gráficos</button>
              </Link>
          </div>
          <p className="read-the-docs">
              By Ana Silva, Eduardo Zorzan, Gabriela Superti, Higor Milani, Lauro Ferneda, Maria Chehade
          </p>
      </div>
    </>
  )
}

export default Home;

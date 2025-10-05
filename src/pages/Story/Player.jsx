import React, { useRef, useState } from "react";
import audioFile from "../../assets/audio.mp3"; // caminho do seu áudio

export default function Player() {
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    return (
        <>
            <audio ref={audioRef} src={audioFile} loop />

            {/* Ícone fixo no canto superior direito */}
            <div
                onClick={togglePlay}
                style={{
                    position: "fixed",
                    top: "20px",
                    right: "20px",
                    fontSize: "24px",
                    cursor: "pointer",
                    zIndex: 999,
                    userSelect: "none",
                }}
                title={isPlaying ? "Pausar música" : "Tocar música"}
            >
                {isPlaying ? "🎵" : "🎶"}
            </div>
        </>
    );
}

"use client";
// A Reel in a phone-shaped frame. Muted autoplay (the only kind phones allow) with a sound button, or plain controls.
import { useEffect, useRef, useState } from "react";
import { IconMute, IconSound } from "./Icons";

export default function ReelPlayer({ src, poster, badge, auto = false, inView = false, controls = false, sound = true, className = "", label }) {
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);

  // React does not write the muted attribute into server HTML, and phones only autoplay muted video.
  useEffect(() => {
    const v = ref.current;
    if (!v || controls) return;
    v.muted = true;
    if (auto && !inView) v.play().catch(() => {});
  }, [auto, inView, controls]);

  // Play only while on screen, so a page of Reels does not download them all at once.
  useEffect(() => {
    const v = ref.current;
    if (!v || !inView || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.6 });
    io.observe(v);
    return () => io.disconnect();
  }, [inView]);

  if (!src) {
    return (
      <div className={`phone phone-empty ${className}`}>
        {poster ? <img src={poster} alt={label || ""} /> : <span className="small">The Reel will play here</span>}
      </div>
    );
  }
  return (
    <div className={`phone ${className}`}>
      {badge ? <span className="phone-badge">{badge}</span> : null}
      <video
        ref={ref}
        src={src}
        poster={poster || undefined}
        playsInline
        loop={!controls}
        muted={controls ? undefined : muted}
        autoPlay={auto && !inView}
        controls={controls}
        preload={auto || inView ? "metadata" : "none"}
        aria-label={label}
      />
      {sound && !controls ? (
        <button
          type="button"
          className="sound-btn"
          aria-label={muted ? "Turn the sound on" : "Mute"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const v = ref.current;
            if (!v) return;
            v.muted = !muted;
            if (v.paused) v.play().catch(() => {});
            setMuted(!muted);
          }}
        >
          {muted ? <IconMute size={18} /> : <IconSound size={18} />}
        </button>
      ) : null}
    </div>
  );
}

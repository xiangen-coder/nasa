"use client";

import { useEffect, useRef } from "react";

export default function CinematicHero({ animate }: { animate: boolean }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const player = video.current;
    if (!player) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function syncPlayback() {
      if (!player) return;
      if (animate && !motion.matches) {
        void player.play().catch(() => {});
      } else {
        player.pause();
      }
    }

    syncPlayback();
    motion.addEventListener("change", syncPlayback);
    return () => {
      motion.removeEventListener("change", syncPlayback);
      player.pause();
    };
  }, [animate]);

  return (
    <div className="cinematic-visual" aria-hidden="true">
      <video
        ref={video}
        className="cinematic-video"
        src="/illustration/lunar-homepage-loop.mp4"
        muted
        loop
        playsInline
        preload="metadata"
      />
    </div>
  );
}

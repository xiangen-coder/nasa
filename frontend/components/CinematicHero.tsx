"use client";

import { useEffect, useRef } from "react";

export default function CinematicHero({ animate }: { animate: boolean }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const player = video.current;
    if (!player) return;

    const desktop = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function syncPlayback() {
      if (!player) return;
      const source = desktop.matches
        ? "/illustration/lunar-homepage-loop-4k.mp4"
        : "/illustration/lunar-homepage-loop.mp4";
      if (player.getAttribute("src") !== source) player.src = source;
      if (animate && !motion.matches) {
        void player.play().catch(() => {});
      } else {
        player.pause();
      }
    }

    syncPlayback();
    desktop.addEventListener("change", syncPlayback);
    motion.addEventListener("change", syncPlayback);
    return () => {
      desktop.removeEventListener("change", syncPlayback);
      motion.removeEventListener("change", syncPlayback);
      player.pause();
    };
  }, [animate]);

  return (
    <div className="cinematic-visual" aria-hidden="true">
      <video
        ref={video}
        className="cinematic-video"
        muted
        loop
        playsInline
        preload="metadata"
      />
    </div>
  );
}

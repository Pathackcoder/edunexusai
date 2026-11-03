import React, { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';

export const CAMPUS_VIDEO = '/videos/campus-flyover.mp4';
export const CAMPUS_POSTER = '/videos/campus-flyover-poster.jpg';

/** Motion-sensitive users and data-saver connections get the still frame instead of the video. */
const prefersStill = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData === true;
  } catch {
    return false;
  }
};

/**
 * Full-screen Feddrick University campus flyover behind the login page.
 *
 *   video (object-fit: cover)  →  subtle tint + readability gradients  →  login UI
 *
 * The overlay is light: the campus stays clearly visible and moving, with extra depth only
 * on the left (behind the sign-in card) and along the bottom (behind the footer). The
 * poster frame paints instantly, so there is never a blank or white first frame.
 * `visible` lets the intro fade the footage in from the night tone underneath.
 */
export function CampusVideoBackdrop({ visible = true }) {
  const videoRef = useRef(null);
  const [still] = useState(prefersStill);

  // Some browsers ignore the autoplay attribute after client-side navigation; nudge once.
  // On leaving the page (e.g. after signing in), release the video so its download stops
  // instead of continuing in the background.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || still) return undefined;
    // (Re)attach the source: a previous cleanup may have released it, e.g. when React
    // re-runs effects in development.
    if (video.getAttribute('src') !== CAMPUS_VIDEO) {
      video.setAttribute('src', CAMPUS_VIDEO);
      video.load();
    }
    video.play?.().catch(() => {
      /* autoplay blocked: the poster frame stays as the background */
    });
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [still]);

  return (
    <Box aria-hidden sx={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', bgcolor: '#0B1036', pointerEvents: 'none' }}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: visible ? 1 : 0,
          transition: 'opacity 900ms ease',
          '& > video, & > img': { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: { xs: '62% 50%', md: '58% 50%' } },
        }}
      >
        {still ? (
          <Box component="img" src={CAMPUS_POSTER} alt="" />
        ) : (
          <video ref={videoRef} src={CAMPUS_VIDEO} poster={CAMPUS_POSTER} autoPlay muted loop playsInline preload="auto" disablePictureInPicture disableRemotePlayback />
        )}
      </Box>

      {/* Readability: a slight overall tint, more depth behind the card and the footer. */}
      <Box sx={{ position: 'absolute', inset: 0, background: 'rgba(12, 16, 52, 0.22)' }} />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: {
            xs: 'linear-gradient(180deg, rgba(11, 16, 54, 0.55) 0%, rgba(11, 16, 54, 0.25) 30%, rgba(11, 16, 54, 0.35) 70%, rgba(11, 16, 54, 0.7) 100%)',
            md: 'linear-gradient(90deg, rgba(11, 16, 54, 0.62) 0%, rgba(11, 16, 54, 0.38) 34%, rgba(11, 16, 54, 0.08) 62%, rgba(11, 16, 54, 0) 80%)',
          },
        }}
      />
      <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '22%', background: 'linear-gradient(0deg, rgba(8, 11, 40, 0.6), transparent)' }} />
      <Box sx={{ position: 'absolute', left: 0, right: 0, top: 0, height: '18%', background: 'linear-gradient(180deg, rgba(8, 11, 40, 0.45), transparent)' }} />
    </Box>
  );
}

export default CampusVideoBackdrop;

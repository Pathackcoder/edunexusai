/**
 * YouTube / Vimeo URLs → validated { provider, id } → embed URL built by us. Stored layouts
 * keep only the canonical watch URL; the embed address is always generated from the parsed
 * identifier and the approved player hosts below, never taken from user input.
 */
export const VIDEO_PLAYER_HOSTS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'];
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;

const seconds = (value) => {
  if (!value) return 0;
  if (/^\d{1,6}$/.test(value)) return Number(value);
  const m = /^(?:(\d{1,2})h)?(?:(\d{1,3})m)?(?:(\d{1,5})s)?$/.exec(value);
  return m && m[0] ? (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0) : 0;
};

/** Returns { provider, id, hash?, start? } or null for anything that is not a supported video URL. */
export function parseVideoUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 500 || /[<>"'\s]/.test(raw)) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || (url.port && url.port !== '443' && url.port !== '80')) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (YT_HOSTS.includes(host)) {
    let id = null;
    if (host === 'youtu.be') id = parts[0];
    else if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) id = parts[1];
    if (!id || !YT_ID.test(id)) return null;
    const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
    return { provider: 'youtube', id, ...(start ? { start } : {}) };
  }
  if (VIMEO_HOSTS.includes(host)) {
    let id = null;
    let hash = null;
    if (host === 'player.vimeo.com') {
      if (parts[0] !== 'video') return null;
      id = parts[1];
      hash = url.searchParams.get('h');
    } else {
      const index = parts.findIndex((p) => VIMEO_ID.test(p));
      if (index < 0) return null;
      if (index > 0 && !['channels', 'groups', 'video'].includes(parts[0])) return null;
      id = parts[index];
      if (parts[index + 1] && VIMEO_HASH.test(parts[index + 1])) hash = parts[index + 1];
      hash = hash ?? url.searchParams.get('h');
    }
    if (!id || !VIMEO_ID.test(id)) return null;
    if (hash && !VIMEO_HASH.test(hash)) return null;
    return { provider: 'vimeo', id, ...(hash ? { hash: hash.toLowerCase() } : {}) };
  }
  return null;
}

/** The URL saved in layouts: a normalised watch URL. */
export function canonicalVideoUrl(video) {
  if (!video) return '';
  if (video.provider === 'youtube') return `https://www.youtube.com/watch?v=${video.id}${video.start ? `&t=${video.start}` : ''}`;
  return `https://vimeo.com/${video.id}${video.hash ? `/${video.hash}` : ''}`;
}

/** The iframe src, built only from a parsed identifier and an approved player host. */
export function videoEmbedUrl(video) {
  if (!video) return null;
  if (video.provider === 'youtube' && YT_ID.test(video.id)) {
    return `${VIDEO_PLAYER_HOSTS[0]}/embed/${video.id}?rel=0${video.start ? `&start=${Number(video.start)}` : ''}`;
  }
  if (video.provider === 'vimeo' && VIMEO_ID.test(video.id)) {
    return `${VIDEO_PLAYER_HOSTS[1]}/video/${video.id}?dnt=1${video.hash && VIMEO_HASH.test(video.hash) ? `&h=${video.hash}` : ''}`;
  }
  return null;
}

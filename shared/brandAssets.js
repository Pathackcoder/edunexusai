// Shared by the API and UI: the institution logo an administrator can upload in Portal Appearance.
// One logo per institution, used wherever the portal shows the university's branding. Without an upload
// the portal shows the logo bundled with the deployment (frontend/public), so a deployment can also ship
// its own files instead of uploading one.

export const LOGO_LIMITS = {
  maxBytes: 1024 * 1024,
  maxDimension: 4000,
  minHeight: 48,
  // From a square crest (1 : 1) to a long horizontal lockup (6 : 1).
  minAspect: 0.5,
  maxAspect: 6,
  // SVG is deliberately not accepted: an uploaded SVG can carry script.
  types: { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP' },
};

export const LOGO_GUIDANCE = 'A horizontal logo or a square crest, ideally a PNG with a transparent background, about 200 px high (for example 700 × 200 px). PNG, JPEG or WebP, up to 1 MB.';

/** The reason an image of `width` × `height` cannot be used as the logo, or null when it can. */
export function logoShapeProblem(width, height) {
  if (!width || !height) return 'The image size could not be read.';
  if (width > LOGO_LIMITS.maxDimension || height > LOGO_LIMITS.maxDimension) return `The image is too large (at most ${LOGO_LIMITS.maxDimension} px on each side).`;
  if (height < LOGO_LIMITS.minHeight) return `The image is too small: use at least ${LOGO_LIMITS.minHeight} px of height.`;
  const aspect = width / height;
  if (aspect < LOGO_LIMITS.minAspect) return 'The logo is too tall for the portal: use a square or horizontal logo.';
  if (aspect > LOGO_LIMITS.maxAspect) return `The logo is too wide for the portal (at most ${LOGO_LIMITS.maxAspect} : 1; this one is ${aspect.toFixed(1)} : 1).`;
  return null;
}

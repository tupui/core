/**
 * The GHOSTSIG mark for Blux's wallet picker, inline like the newer logos in
 * bluxcc/core src/assets. The same 11 by 11 grid as assets/icon.svg in the
 * GHOSTSIG repository.
 */
const GhostsigLogo = ({ size = 40 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 44 44"
    fill="none"
    role="img"
    aria-label="GHOSTSIG"
  >
    <g shapeRendering="crispEdges" fill="#FF2E88">
      <rect x="12" y="0" width="20" height="4" />
      <rect x="8" y="4" width="28" height="4" />
      <rect x="4" y="8" width="36" height="4" />
      <rect x="0" y="12" width="44" height="4" />
      <rect x="0" y="16" width="8" height="4" />
      <rect x="36" y="16" width="8" height="4" />
      <rect x="0" y="20" width="44" height="16" />
      <rect x="0" y="36" width="8" height="8" />
      <rect x="12" y="36" width="8" height="8" />
      <rect x="24" y="36" width="8" height="8" />
      <rect x="36" y="36" width="8" height="8" />
    </g>
    <rect
      x="8"
      y="16"
      width="28"
      height="4"
      fill="#C8FF00"
      shapeRendering="crispEdges"
    />
  </svg>
);

export default GhostsigLogo;

export function Logo({ size = 40 }: { size?: number }) {
  const white = "#e5e7eb"
  const red = "#ff3b30"
  const grey = "#8a8f98"
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="MicroStudio logo">
      <g>
        <rect x="8" y="8" width="10" height="10" rx="2" fill={white} />
        <rect x="26" y="8" width="10" height="10" rx="2" fill={red} />
        <rect x="44" y="8" width="10" height="10" rx="2" fill={white} />
        <rect x="8" y="26" width="10" height="10" rx="2" fill={grey} />
        <rect x="26" y="26" width="10" height="10" rx="2" fill={white} />
        <rect x="44" y="26" width="10" height="10" rx="2" fill={grey} />
        <rect x="8" y="44" width="10" height="10" rx="2" fill={grey} />
        <rect x="26" y="44" width="10" height="10" rx="2" fill={grey} />
        <rect x="44" y="44" width="10" height="10" rx="2" fill={grey} />
      </g>
    </svg>
  )
}
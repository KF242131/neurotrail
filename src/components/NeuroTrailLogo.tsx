type Props = {
  className?: string;
};

// A quiet monochrome mark: a single cell with a few dendritic offshoots.
const dendrites = [
  { x: 22, y: 6 },
  { x: 30, y: 17 },
  { x: 25, y: 28 },
  { x: 11, y: 30 },
  { x: 5, y: 18 },
  { x: 9, y: 7 },
];

export function NeuroTrailLogo({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 36"
      role="img"
      aria-label="NeuroTrail"
      fill="none"
    >
      <g stroke="#ECE6D7" strokeLinecap="round" strokeOpacity="0.42">
        {dendrites.map((d) => (
          <line
            key={`${d.x}-${d.y}`}
            x1="18"
            y1="18"
            x2={d.x}
            y2={d.y}
            strokeWidth="0.7"
          />
        ))}
      </g>
      {dendrites.map((d) => (
        <circle
          key={`tip-${d.x}-${d.y}`}
          cx={d.x}
          cy={d.y}
          r="0.9"
          fill="#ECE6D7"
          fillOpacity="0.6"
        />
      ))}
      <circle cx="18" cy="18" r="2.4" fill="#ECE6D7" fillOpacity="0.85" />
      <circle
        cx="18"
        cy="18"
        r="6.5"
        stroke="#ECE6D7"
        strokeOpacity="0.18"
        strokeWidth="0.6"
      />
    </svg>
  );
}

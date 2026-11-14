export function FlarexLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="1"
        y="1"
        width="34"
        height="34"
        rx="8"
        fill="var(--bg-elevated)"
        stroke="var(--border-strong)"
        strokeWidth="1.2"
      />
      {/* Microgravity chamber containment ring */}
      <circle
        cx="18"
        cy="18"
        r="11.2"
        stroke="var(--accent-blue)"
        strokeWidth="1.3"
        strokeDasharray="4 2.5"
        opacity="0.7"
      />
      {/* Spherical microgravity flame front */}
      <circle
        cx="18"
        cy="18.5"
        r="6.2"
        fill="var(--accent-blue)"
        fillOpacity="0.16"
        stroke="var(--accent-cyan)"
        strokeWidth="1.6"
      />
      {/* Inner cool/diffusion core */}
      <path
        d="M18 13.4C20.2 15.6 21.1 17.5 21.1 19.3C21.1 21 19.7 22.4 18 22.4C16.3 22.4 14.9 21 14.9 19.3C14.9 17.5 15.8 15.6 18 13.4Z"
        fill="var(--accent-blue)"
      />
      <circle cx="18" cy="19.5" r="1.4" fill="var(--bg-card)" />
    </svg>
  );
}

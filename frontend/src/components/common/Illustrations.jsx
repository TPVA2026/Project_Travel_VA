export function AirplaneIllustration() {
  return (
    <div className="illustration-airplane" aria-hidden="true">
      <svg viewBox="0 0 320 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Soft clouds */}
        <g opacity="0.85">
          <path
            d="M50 70 C40 70 30 78 30 90 C20 90 12 100 14 110 C16 120 26 126 38 126 C50 126 100 126 112 126 C124 126 134 116 132 104 C130 92 118 84 106 85 C102 74 90 68 78 70 C70 65 58 64 50 70 Z"
            fill="#dbeafe"
            stroke="#93c5fd"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M190 40 C182 40 174 46 172 54 C164 54 158 60 160 68 C162 76 170 80 180 80 C190 80 230 80 238 80 C246 80 254 74 252 66 C250 58 240 52 230 53 C226 44 216 40 208 41 C202 38 194 37 190 40 Z"
            fill="#eff6ff"
            stroke="#bfdbfe"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M210 130 C200 130 190 138 190 148 C180 148 174 156 176 164 C178 172 186 176 196 176 C206 176 256 176 266 176 C276 176 284 168 282 158 C280 148 270 142 260 143 C256 134 246 130 236 131 C230 126 220 126 210 130 Z"
            fill="#dbeafe"
            stroke="#93c5fd"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>

        {/* Airplane */}
        <g transform="translate(130, 75) rotate(-18)">
          {/* Main Fuselage */}
          <path
            d="M-40 20 C-10 15 60 15 110 24 C125 27 135 34 135 37 C135 40 125 45 105 45 C50 45 -10 40 -40 34 C-46 32 -48 24 -40 20 Z"
            fill="#ffffff"
            stroke="#1e3a8a"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {/* Nose tip */}
          <path d="M125 31 C135 34 135 37 125 39 Z" fill="#3b82f6" />
          {/* Windows */}
          <circle cx="20" cy="28" r="2.5" fill="#3b82f6" />
          <circle cx="35" cy="28" r="2.5" fill="#3b82f6" />
          <circle cx="50" cy="29" r="2.5" fill="#3b82f6" />
          <circle cx="65" cy="30" r="2.5" fill="#3b82f6" />
          <circle cx="80" cy="31" r="2.5" fill="#3b82f6" />
          <path d="M96 30 L108 32 C108 34 102 36 96 34 Z" fill="#1e3a8a" />
          {/* Wings */}
          {/* Left Wing (Back) */}
          <path
            d="M25 18 L65 -30 L82 -26 L48 18 Z"
            fill="#93c5fd"
            stroke="#1e3a8a"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* Right Wing (Front) */}
          <path
            d="M35 34 L60 85 L76 83 L58 35 Z"
            fill="#60a5fa"
            stroke="#1e3a8a"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {/* Tail Wing */}
          <path
            d="M-35 22 L-65 -15 L-48 -15 L-18 22 Z"
            fill="#3b82f6"
            stroke="#1e3a8a"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* Tail Fin Horizontal */}
          <path
            d="M-36 28 L-55 42 L-46 44 L-28 32 Z"
            fill="#93c5fd"
            stroke="#1e3a8a"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  )
}

export function BusIllustration() {
  return (
    <div className="illustration-bus-wrap" aria-hidden="true">
      <svg viewBox="0 0 160 80" className="bus-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Bus Body */}
        <rect
          x="10"
          y="18"
          width="130"
          height="42"
          rx="12"
          fill="#f97316"
          stroke="#c2410c"
          strokeWidth="3"
        />
        {/* White roof/top accent */}
        <path
          d="M10 32 Q10 20 22 20 L128 20 Q140 20 140 32 L10 32 Z"
          fill="#ffedd5"
          stroke="#c2410c"
          strokeWidth="2"
        />
        {/* Windows */}
        <rect x="22" y="24" width="22" height="14" rx="3" fill="#ffffff" stroke="#c2410c" strokeWidth="2" />
        <rect x="50" y="24" width="22" height="14" rx="3" fill="#ffffff" stroke="#c2410c" strokeWidth="2" />
        <rect x="78" y="24" width="22" height="14" rx="3" fill="#ffffff" stroke="#c2410c" strokeWidth="2" />
        <path d="M106 24 L126 24 Q132 24 132 30 L132 38 L106 38 Z" fill="#ffffff" stroke="#c2410c" strokeWidth="2" />
        {/* Headlight */}
        <circle cx="134" cy="46" r="4" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
        {/* Wheels */}
        <circle cx="36" cy="60" r="10" fill="#334155" stroke="#0f172a" strokeWidth="3" />
        <circle cx="36" cy="60" r="4" fill="#e2e8f0" />
        <circle cx="112" cy="60" r="10" fill="#334155" stroke="#0f172a" strokeWidth="3" />
        <circle cx="112" cy="60" r="4" fill="#e2e8f0" />
      </svg>
      <div className="bus-road-line"></div>
    </div>
  )
}

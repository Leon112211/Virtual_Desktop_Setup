import { useId } from 'react';
import type { BuiltinKind } from '../domain/project';

export function ModelThumbnail({
  kind,
}: {
  kind: BuiltinKind | 'imported' | 'laptopTray' | 'monitorArmDual';
}) {
  const uid = useId().replace(/:/g, '');
  const aluGrad = `alu-${uid}`;
  const darkGrad = `dark-${uid}`;
  const screenGrad = `scr-${uid}`;
  const glowGrad = `glw-${uid}`;

  return (
    <svg
      viewBox="0 0 140 88"
      fill="none"
      aria-hidden="true"
      className={`model-illustration ${kind}`}
    >
      <defs>
        <linearGradient id={aluGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f4f7fb" />
          <stop offset="52%" stopColor="#dde4ee" />
          <stop offset="100%" stopColor="#bcc6d4" />
        </linearGradient>
        <linearGradient id={darkGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3c4555" />
          <stop offset="55%" stopColor="#262d38" />
          <stop offset="100%" stopColor="#161b22" />
        </linearGradient>
        <linearGradient id={screenGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#264b73" />
          <stop offset="48%" stopColor="#1a3452" />
          <stop offset="100%" stopColor="#0f1d30" />
        </linearGradient>
        <linearGradient id={glowGrad} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
          <stop offset="36%" stopColor="#a78bfa" stopOpacity="0.45" />
          <stop offset="70%" stopColor="#fb7185" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.42" />
        </linearGradient>
      </defs>

      {/* Soft grounded ambient contact shadow */}
      <ellipse cx="70" cy="77" rx="42" ry="4.5" fill="#1e293b" opacity=".08" />

      {kind === 'monitor' ? (
        <>
          {/* Slanted silver stand base & perforated column */}
          <path
            d="M51 74 62 69h16l11 5-19 2.5z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".6"
          />
          <path d="M67 52h6l2 19h-10z" fill="#b9c3d1" />
          <rect x="68.7" y="57.5" width="2.6" height="8" rx="1.3" fill="#475569" />
          {/* Ultra-slim 4-side InfinityEdge aluminum chassis & screen */}
          <path d="M23 13.5 113 7.5l6.5 48.5-90 7z" fill={`url(#${darkGrad})`} />
          <path d="M26 16.5 110.5 10.5l5.5 42.5-84.5 6.5z" fill={`url(#${screenGrad})`} />
          {/* Subtle UI ocean horizon + metallic highlight sheen */}
          <path d="m28 45 86-6.5 1.5 12-84.5 6.5z" fill="#0f253d" opacity=".75" />
          <path d="m26 16.5 40-3-22 44.5-12.5 1z" fill="#ffffff" opacity=".06" />
          <path d="m29.5 60.5 90-7 .4 1.6-90 7z" fill="#cfd6e0" />
        </>
      ) : kind === 'screenLamp' ? (
        <>
          {/* Display back silhouette & warm asymmetric 4000K illumination */}
          <path d="M32 34 108 26l3 38-76 8z" fill="#cbd5e1" opacity=".45" />
          <polygon points="27,32 111,22 122,63 18,70" fill="#fde68a" opacity=".2" />
          {/* Weighted counterbalance clamp & slim anodized lightbar */}
          <path d="M62 21h15l2 11H60z" fill="#475569" />
          <path d="m22 26 93-10.5 3.5 3.5-2 5.5-93 11-3.5-3.5z" fill={`url(#${darkGrad})`} />
          <path
            d="m25 32.5 89-10"
            stroke="#fef08a"
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity=".92"
          />
          <circle cx="106" cy="20" r="1.4" fill="#94a3b8" />
        </>
      ) : kind === 'speaker' ? (
        <>
          {/* Warm oak wood cabinet + cream-white leatherette front baffle (Edifier/Kanto inspired) */}
          <path d="M46 14 64 7 100 14 82 21z" fill="#e5d3b7" />
          <path d="M82 21 100 14 100 65 82 72z" fill="#c7ae8b" />
          <path
            d="M46 14 82 21 82 72 46 65z"
            fill="#f7f4ed"
            stroke="#d6d0c4"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Top perforated dome tweeter */}
          <ellipse cx="64" cy="31.5" rx="6.8" ry="7.4" fill="#181c23" />
          <ellipse
            cx="64"
            cy="31.5"
            rx="4"
            ry="4.4"
            fill="#334155"
            stroke="#475569"
            strokeWidth=".6"
          />
          {/* Sculpted rubber-surround mid-bass driver + spun silver phase plug */}
          <ellipse cx="64" cy="51.5" rx="12.5" ry="13.5" fill="#181c23" />
          <ellipse cx="64" cy="51.5" rx="9" ry="9.8" fill="#2c3340" />
          <ellipse cx="64" cy="51.5" rx="3.8" ry="4.2" fill={`url(#${aluGrad})`} />
          {/* Brushed badge & companion aluminum desktop puck */}
          <path d="m60 65 8 1.5v2.2l-8-1.5z" fill="#1e293b" />
          <ellipse
            cx="97"
            cy="69"
            rx="8.5"
            ry="4.6"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".7"
          />
          <ellipse cx="97" cy="67.6" rx="7.8" ry="3.8" fill="#f8fafc" />
        </>
      ) : kind === 'keyboard' ? (
        <>
          {/* Minimalist Pure White CNC TKL mechanical keyboard with soft optical RGB aura */}
          <path d="m18 39 87-17 21 33-85 18z" fill="#e2e8f0" />
          <path d="m18 39 23 34v4.5L18 43.5z" fill="#cbd5e1" />
          <path d="m41 73 85-18v4.5l-85 18z" fill="#b8c3d1" />
          {/* Subtle optical RGB diffusion bed beneath pure white keycaps */}
          <path d="m23 39.5 78-15 18 28.5-77 16z" fill={`url(#${glowGrad})`} />
          {Array.from({ length: 4 }, (_, r) =>
            Array.from({ length: 11 }, (_, c) => (
              <path
                key={`${r}${c}`}
                d={`m${24.5 + c * 7.1 + r * 4.3} ${39.5 - c * 1.4 + r * 6.8} 5.6-1.1 3.3 4.8-5.6 1.1z`}
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth=".35"
              />
            )),
          )}
        </>
      ) : kind === 'controller' ? (
        <>
          {/* Refined PS5 DualSense two-tone silhouette + cyan touchpad rim glow */}
          <path
            d="M34 30c7-7 16-6 23-2l24-4c7-5 17-5 23 2 9 11 20 35 12 42-6 6-18-5-24-13l-31 5c-7 10-19 20-26 14-8-8-9-31-1-44Z"
            fill="#1e242f"
          />
          <path
            d="M34 30c7-7 16-6 23-2l24-4c7-5 17-5 23 2 5 6 8 15 6 21l-21-3-29 5-26 9c-5-11-4-21 0-28Z"
            fill="#f4f7fb"
            stroke="#cbd5e1"
            strokeWidth=".6"
          />
          <path d="m56 26 26-4 3 15-26 4z" fill="#e2e8f0" stroke="#38bdf8" strokeWidth="1" />
          <circle cx="59" cy="46" r="5.2" fill="#2d3544" />
          <circle cx="84" cy="41.5" r="5.2" fill="#2d3544" />
          <path
            d="M43 31v11m-5.5-5.5 11-1"
            stroke="#475569"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <circle cx="96" cy="27.5" r="2.2" fill="#64748b" />
          <circle cx="101.5" cy="33.5" r="2.2" fill="#94a3b8" />
          <circle cx="91.5" cy="36" r="2.2" fill="#64748b" />
        </>
      ) : kind === 'pegboard' ? (
        <>
          {/* Warm architectural CNC slotted pegboard with steel L-clamps */}
          <path d="m36 14 69-8 3 60-69 9z" fill="#efeae0" stroke="#c8c2b6" strokeWidth=".7" />
          <path d="m105 6 4.5 3.5 3 59.5-4.5-3z" fill="#c7c2b6" />
          {Array.from({ length: 6 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => (
              <rect
                key={`${r}${c}`}
                x={43 + c * 7.2}
                y={21 + r * 6.8 + (c % 2) * 3.4 - c * 0.8}
                width="1.8"
                height="5.2"
                rx="0.9"
                fill="#969c9e"
              />
            )),
          )}
          <path
            d="m46 72.5-7 4.5 15 1.8 10-4.5m27-6.5-4.5 4.5 15 1.8 8-4.5"
            stroke="#94a3b8"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      ) : kind === 'gamingLaptop' ? (
        <>
          {/* Sleek stealth CNC gaming notebook with slim cyan keyboard glow */}
          <path d="m27 54 61-8 24 18.5-60 11z" fill={`url(#${darkGrad})`} />
          <path d="m27 54 25 21.5v3.5L27 57.5z" fill="#11161d" />
          <path
            d="m34 55 49-6.8 14 10.5-48.5 7.5z"
            fill="#18202c"
            stroke="#38bdf8"
            strokeWidth=".7"
            strokeOpacity=".55"
          />
          <path d="m27 54 61-8-4-32-61 9z" fill="#2b3442" />
          <path d="m31 51 52.5-7-3.5-26.5-52.5 7.5z" fill={`url(#${screenGrad})`} />
          <path d="m31 25 32-4.5-15 28-13.5 2z" fill="#38bdf8" opacity=".14" />
        </>
      ) : kind === 'macbook' ? (
        <>
          {/* Apple MacBook Pro unibody with signature top display notch & black keyboard pocket */}
          <path
            d="m29 55 59-8 22 17.5-59 10z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".5"
          />
          <path d="m35 55.5 48.5-6.5 12.5 9.5-48.5 7.5z" fill="#181c24" />
          <path d="m55 66 18-2.8 4 3.5-18 2.8z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth=".4" />
          <path d="m29 55 59-8-4-32-59 8z" fill="#d9e0ea" stroke="#94a3b8" strokeWidth=".5" />
          <path d="m32.5 52 51.5-7-3.2-27.5-51.5 7z" fill={`url(#${screenGrad})`} />
          {/* Characteristic MacBook Pro camera notch */}
          <path d="m54 20.5 7-.9.4 2.4-7 .9z" fill="#0f172a" />
        </>
      ) : kind === 'macMini' ? (
        <>
          {/* 2026 M4 compact Mac mini (127 × 127 × 50 mm): circular recessed black pedestal + front vertical USB-C & 3.5mm */}
          <ellipse cx="70" cy="70.5" rx="18" ry="4.5" fill="#181c22" />
          <path d="m45 50 25-8 25 8-25 8z" fill="#f1f5f9" />
          <path d="m45 50 25 8v12l-25-8z" fill="#d3dbe5" />
          <path d="m70 58 25-8v12l-25 8z" fill="#b7c1ce" />
          <circle cx="70" cy="50" r="3" fill="#334155" opacity=".75" />
          {/* Front vertical 2× USB-C + white LED + 3.5mm jack */}
          <line
            x1="52"
            y1="56.5"
            x2="52"
            y2="59.5"
            stroke="#1e293b"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <line
            x1="56"
            y1="57.8"
            x2="56"
            y2="60.8"
            stroke="#1e293b"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="60" cy="60.2" r=".9" fill="#f8fafc" />
          <circle cx="64" cy="61.5" r="1.1" fill="#1e293b" />
        </>
      ) : kind === 'macStudio' ? (
        <>
          {/* Mac Studio (197 × 197 × 95 mm): tall CNC unibody + brushed foot ring + front TB5 & SDXC slot */}
          <ellipse cx="70" cy="71" rx="22" ry="5" fill="#181c22" />
          <path d="m42 35 28-9 28 9-28 9z" fill="#f1f5f9" />
          <path d="m42 35 28 9v26l-28-9z" fill="#d4dce6" />
          <path d="m70 44 28-9v26l-28 9z" fill="#b7c1ce" />
          <circle cx="70" cy="35" r="3.4" fill="#334155" opacity=".78" />
          {/* Front 2× horizontal USB-C + SDXC slot + right white status LED */}
          <rect x="47" y="53" width="3.8" height="1.5" rx=".7" fill="#1e293b" />
          <rect x="52.5" y="54.8" width="3.8" height="1.5" rx=".7" fill="#1e293b" />
          <rect x="58.5" y="56.6" width="6.5" height="1.6" rx=".6" fill="#0f172a" />
          <circle cx="67.5" cy="59.2" r="1" fill="#ffffff" />
        </>
      ) : kind === 'laptopStand' ? (
        <>
          {/* Twelve South Curve Flex articulated twin-leg stand with front catch hooks */}
          <path
            d="m36 70 45-7m-13 9 45-7"
            stroke="#64748b"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path d="m81 63 32 2" stroke="#475569" strokeWidth="2.8" strokeLinecap="round" />
          <path
            d="m81 63-26-26m39 24-13-30"
            stroke="#7c8a9e"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <circle cx="81" cy="63" r="2.6" fill="#1e293b" />
          <circle cx="55" cy="37" r="2.6" fill="#1e293b" />
          {/* Silicone-lined top cradle rails & connected catch hooks */}
          <path
            d="m34 45 48-14m-13 18 45-14"
            stroke="#94a3b8"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          <path d="m34 45-2-4m37 8-2-4" stroke="#334155" strokeWidth="2.8" strokeLinecap="round" />
        </>
      ) : kind === 'monitorArm' ? (
        <>
          {/* Precision gas-spring monitor arm with desk C-clamp & VESA plate */}
          <rect x="92" y="55" width="15" height="15" rx="2.5" fill={`url(#${darkGrad})`} />
          <path
            d="M99.5 55V37L73 44.5 48 24.5"
            stroke="#334155"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M99.5 55V37L73 44.5 48 24.5"
            stroke="#64748b"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity=".65"
          />
          <circle cx="73" cy="44.5" r="4.8" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
          <circle cx="58" cy="32.5" r="2" fill="#facc15" />
          <rect
            x="35"
            y="15.5"
            width="17"
            height="17"
            rx="2.5"
            fill="#1e293b"
            stroke="#475569"
            strokeWidth=".8"
          />
        </>
      ) : kind === 'monitorArmDual' ? (
        <>
          {/* NB F160 side-by-side twin C-clamps + tight parallel pillars + symmetrical dual arms */}
          <rect x="51" y="56.5" width="38" height="5.5" rx="2" fill="#334155" />
          <rect x="56.5" y="62" width="7.5" height="13.5" rx="1.5" fill="#161b22" />
          <rect x="76" y="62" width="7.5" height="13.5" rx="1.5" fill="#161b22" />
          <path
            d="M63.5 56.5V45L42 32 33 19M76.5 56.5V45L98 32 107 19"
            stroke="#334155"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="42" cy="32" r="3.8" fill="#1e293b" stroke="#94a3b8" strokeWidth=".8" />
          <circle cx="98" cy="32" r="3.8" fill="#1e293b" stroke="#94a3b8" strokeWidth=".8" />
          <circle cx="37" cy="25" r="1.6" fill="#facc15" />
          <circle cx="103" cy="25" r="1.6" fill="#facc15" />
          <rect
            x="21"
            y="11.5"
            width="15"
            height="15"
            rx="2.2"
            fill="#1e293b"
            stroke="#475569"
            strokeWidth=".8"
          />
          <rect
            x="104"
            y="11.5"
            width="15"
            height="15"
            rx="2.2"
            fill="#1e293b"
            stroke="#475569"
            strokeWidth=".8"
          />
        </>
      ) : kind === 'laptopTray' ? (
        <>
          {/* NB FP-2 ventilated steel VESA laptop cradle */}
          <path d="m32 45 50-16 26 21-50 18z" fill={`url(#${darkGrad})`} />
          <path d="m39 46 39-12 20 16-39 14z" fill="#11161d" stroke="#475569" strokeWidth=".9" />
          <path d="m27 44 8 8m62-11 8 8" stroke="#1e293b" strokeWidth="3.8" strokeLinecap="round" />
          <path d="m48 61 4 4m18-11 4 4" stroke="#64748b" strokeWidth="3.2" strokeLinecap="round" />
        </>
      ) : kind === 'mouse' ? (
        <>
          {/* Matte flagship wireless mouse with silver scroll wheel */}
          <path
            d="M52 58c-5-14-3-31 7-37 8-5 20-5 27 0 9 7 9 24 4 38-4 11-11 16-20 16s-14-6-18-17Z"
            fill={`url(#${darkGrad})`}
          />
          <path d="M56 29c5-6 17-7 25-2" stroke="#11151b" strokeWidth="2.2" />
          <path d="M70 19v19" stroke="#11151b" strokeWidth="2" />
          <rect x="67" y="22.5" width="6" height="11" rx="3" fill={`url(#${aluGrad})`} />
          <rect x="49.5" y="42" width="3.5" height="10.5" rx="1.75" fill="#11151b" />
          <path d="M65 56a5 5 0 1 1 8 4" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : kind === 'powerStrip' ? (
        <>
          {/* Modern minimalist smart power strip */}
          <rect
            x="20"
            y="34"
            width="100"
            height="32"
            rx="7"
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth="1.4"
          />
          <rect x="27" y="42" width="8" height="16" rx="2.5" fill="#0ea5e9" />
          <circle cx="31" cy="46" r="1.2" fill="#e0f2fe" />
          {[44, 63, 82].map((x) => (
            <g key={x}>
              <line
                x1={x - 3}
                y1="42"
                x2={x + 3}
                y2="42"
                stroke="#1e293b"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1={x}
                y1="49"
                x2={x}
                y2="54"
                stroke="#1e293b"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <line
                x1={x - 3}
                y1="58"
                x2={x - 1}
                y2="55"
                stroke="#1e293b"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <line
                x1={x + 3}
                y1="58"
                x2={x + 1}
                y2="55"
                stroke="#1e293b"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </g>
          ))}
          <rect x="98" y="42" width="12" height="5" rx="1.5" fill="#1e293b" />
          <rect x="100" y="51" width="8" height="4" rx="2" fill="#2563eb" />
        </>
      ) : kind === 'wallOutlet' ? (
        <>
          {/* Clean 86-type square wall/floor outlet (AC 5-hole combo + optional USB-A only, NO Type-C) */}
          <rect
            x="35"
            y="19"
            width="70"
            height="60"
            rx="7"
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />
          <rect
            x="40"
            y="24"
            width="60"
            height="50"
            rx="4"
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth=".8"
          />
          <line
            x1="57"
            y1="34"
            x2="57"
            y2="41"
            stroke="#1e293b"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <line
            x1="69"
            y1="34"
            x2="69"
            y2="41"
            stroke="#1e293b"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <line
            x1="63"
            y1="49"
            x2="63"
            y2="56"
            stroke="#1e293b"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <line
            x1="55"
            y1="64"
            x2="58"
            y2="59"
            stroke="#1e293b"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="71"
            y1="64"
            x2="68"
            y2="59"
            stroke="#1e293b"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="83" y="45" width="11" height="4.8" rx="1.5" fill="#1e293b" />
        </>
      ) : kind === 'mousepad' ? (
        <>
          {/* Matte obsidian stitched gaming desk mat */}
          <path d="m20 38 78-15 24 29-78 17z" fill={`url(#${darkGrad})`} />
          <path d="m20 38 24 31v4L20 42z" fill="#0f1217" />
          <path d="m44 69 78-17v4L44 73z" fill="#1a1f28" />
          <path
            d="m24 39 72-14 21 26-72 15z"
            stroke="#64748b"
            strokeWidth="1.2"
            strokeDasharray="2.5 2"
          />
        </>
      ) : (
        <>
          <path d="m70 12 38 21v35L70 81 33 61V27z" fill={`url(#${aluGrad})`} />
          <path d="m33 27 37 20 38-14M70 47v34" stroke="#64748b" strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}

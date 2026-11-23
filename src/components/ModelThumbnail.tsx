// CS50x Final Project — DeskCraft
// AI Assistance Disclosure: Developed under the author's design & domain rules with assistance from AI coding tools (see src/App.tsx & README.md).
import { useId } from 'react';
import type { BuiltinKind } from '../domain/project';

export function ModelThumbnail({
  kind,
}: {
  kind: BuiltinKind | 'imported' | 'laptopTray' | 'monitorArmDual';
}) {
  const uid = useId().replace(/:/g, '');
  const aluGrad = `alu-${uid}`;
  const aluSide = `als-${uid}`;
  const darkGrad = `dark-${uid}`;
  const darkTop = `dkt-${uid}`;
  const screenGrad = `scr-${uid}`;
  const woodTop = `wdt-${uid}`;
  const woodSide = `wds-${uid}`;
  const lampBeam = `lmp-${uid}`;
  const padGrad = `pad-${uid}`;

  return (
    <svg
      viewBox="0 0 140 88"
      fill="none"
      aria-hidden="true"
      className={`model-illustration ${kind}`}
    >
      <defs>
        <linearGradient id={aluGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="50%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id={aluSide} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id={darkGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3c4556" />
          <stop offset="55%" stopColor="#252c37" />
          <stop offset="100%" stopColor="#141921" />
        </linearGradient>
        <linearGradient id={darkTop} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4b5566" />
          <stop offset="100%" stopColor="#262e3a" />
        </linearGradient>
        <linearGradient id={screenGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#24466c" />
          <stop offset="52%" stopColor="#162d49" />
          <stop offset="100%" stopColor="#0d1b2d" />
        </linearGradient>
        <linearGradient id={woodTop} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e9d8be" />
          <stop offset="100%" stopColor="#d3bc9a" />
        </linearGradient>
        <linearGradient id={woodSide} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#cbb28e" />
          <stop offset="100%" stopColor="#ae926d" />
        </linearGradient>
        <linearGradient id={lampBeam} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.46" />
          <stop offset="58%" stopColor="#fef3c7" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#fef3c7" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={padGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2d3544" />
          <stop offset="60%" stopColor="#1d232d" />
          <stop offset="100%" stopColor="#13171f" />
        </linearGradient>
      </defs>

      {/* Soft grounded studio contact shadow */}
      <ellipse
        cx="70"
        cy={kind === 'wallOutlet' ? '79' : '77.5'}
        rx={kind === 'monitor' ? '44' : kind === 'wallOutlet' ? '28' : '38'}
        ry="4.2"
        fill="#0f172a"
        opacity=".085"
      />

      {kind === 'monitor' ? (
        <>
          {/* Symmetrical 27" ultrathin bezel display on beveled brushed aluminum base */}
          <path
            d="M46 74.5 55.5 70h29l9.5 4.5a1.6 1.6 0 0 1-.6 2.8H46.6a1.6 1.6 0 0 1-.6-2.8Z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".7"
            strokeLinejoin="round"
          />
          <path d="M46.5 76.2h47" stroke="#94a3b8" strokeWidth=".9" opacity=".65" />
          {/* Tapered vertical aluminum stand column with cable-routing cutout */}
          <path
            d="M65.6 58h8.8l1.6 13.8H64z"
            fill={`url(#${aluSide})`}
            stroke="#94a3b8"
            strokeWidth=".55"
          />
          <rect x="68.5" y="61.5" width="3" height="7" rx="1.5" fill="#475569" />
          {/* 16:9 ultra-slim outer aluminum rim & dark inner glass bezel */}
          <rect
            x="23.5"
            y="8.5"
            width="93"
            height="52.5"
            rx="2.8"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".7"
          />
          <rect x="25" y="10" width="90" height="49.5" rx="2" fill="#131820" />
          <rect x="27.2" y="12.2" width="85.6" height="45.1" rx="1" fill={`url(#${screenGrad})`} />
          {/* Subtle atmospheric horizon + diagonal anti-glare glass reflection */}
          <path d="M27.2 44.5c26-5 56-4 85.6-1v13.8H27.2z" fill="#0d2137" opacity=".72" />
          <path d="M27.2 12.2h33l-19 45.1H27.2z" fill="#ffffff" opacity=".065" />
          <line x1="25" y1="60.2" x2="115" y2="60.2" stroke="#cbd5e1" strokeWidth=".9" />
        </>
      ) : kind === 'screenLamp' ? (
        <>
          {/* Faint top section of monitor to clearly show mounting context */}
          <path
            d="M20 74V30.5a3 3 0 0 1 3-3h94a3 3 0 0 1 3 3V74"
            fill="#e2e8f0"
            fillOpacity=".48"
            stroke="#94a3b8"
            strokeWidth="1"
          />
          <rect x="24" y="31.5" width="92" height="42.5" rx="1" fill="#1e293b" opacity=".2" />
          {/* Soft warm 4000K asymmetric downward illumination beam */}
          <polygon points="31,29 109,29 124,74 16,74" fill={`url(#${lampBeam})`} />
          {/* Rear weighted counterweight clip resting cleanly on monitor top bezel */}
          <rect
            x="61"
            y="18.5"
            width="18"
            height="12"
            rx="2.5"
            fill="#334155"
            stroke="#1e293b"
            strokeWidth=".6"
          />
          <rect x="65" y="16" width="10" height="4" rx="1.4" fill="#475569" />
          {/* Slim cylindrical anodized aluminum lightbar */}
          <rect
            x="24"
            y="22"
            width="92"
            height="6.4"
            rx="3.2"
            fill={`url(#${darkGrad})`}
            stroke="#1e293b"
            strokeWidth=".6"
          />
          {/* Top machined specular highlight & bottom warm LED diffuser strip */}
          <line
            x1="28"
            y1="23.8"
            x2="112"
            y2="23.8"
            stroke="#94a3b8"
            strokeWidth=".8"
            opacity=".45"
          />
          <line
            x1="31"
            y1="28.3"
            x2="109"
            y2="28.3"
            stroke="#fef08a"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          {/* Tactile right-end dimming cap */}
          <rect x="111.5" y="22.5" width="4" height="5.4" rx="1.6" fill="#64748b" />
        </>
      ) : kind === 'speaker' ? (
        <>
          {/* Matched pair of studio bookshelf monitors (rear-left passive + front-right active, zero logos) */}
          {/* Left companion speaker (slightly recessed) */}
          <g transform="translate(-14, -4) scale(0.92)">
            <path d="M40 18 52 12.5 78 17.5 66 23z" fill={`url(#${woodTop})`} />
            <path d="M66 23 78 17.5 78 68 66 73.5z" fill={`url(#${woodSide})`} />
            <path
              d="M40 18 66 23 66 73.5 40 68.5z"
              fill="#f6f2ea"
              stroke="#d5cdc0"
              strokeWidth=".9"
              strokeLinejoin="round"
            />
            <ellipse cx="53" cy="34.5" rx="5.2" ry="5.6" fill="#1b2029" />
            <ellipse cx="53" cy="34.5" rx="2.7" ry="3" fill="#3b4556" />
            <ellipse cx="53" cy="54" rx="9.6" ry="10.4" fill="#181c23" />
            <ellipse cx="53" cy="54" rx="7" ry="7.6" fill="#2c3442" />
            <ellipse cx="53" cy="54" rx="2.8" ry="3.1" fill={`url(#${aluGrad})`} />
          </g>
          {/* Right primary active studio monitor */}
          <path
            d="M66 16.5 79 10.5 108 16 95 22z"
            fill={`url(#${woodTop})`}
            stroke="#c5ad89"
            strokeWidth=".5"
          />
          <path d="M95 22 108 16 108 69 95 75z" fill={`url(#${woodSide})`} />
          <path
            d="M66 16.5 95 22 95 75 66 69.5z"
            fill="#faf7f1"
            stroke="#d8d0c3"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {/* Silk dome tweeter in recessed waveguide */}
          <ellipse cx="80.5" cy="34.5" rx="6" ry="6.5" fill="#181d25" />
          <ellipse
            cx="80.5"
            cy="34.5"
            rx="3.4"
            ry="3.7"
            fill="#334155"
            stroke="#475569"
            strokeWidth=".5"
          />
          {/* Mid-bass woofer cone + rubber surround + spun aluminum phase cap */}
          <ellipse cx="80.5" cy="55" rx="10.8" ry="11.8" fill="#161a21" />
          <ellipse cx="80.5" cy="55" rx="7.9" ry="8.6" fill="#2a323f" />
          <ellipse cx="80.5" cy="55" rx="3.2" ry="3.5" fill={`url(#${aluGrad})`} />
          {/* Subtle active standby LED */}
          <circle cx="90.2" cy="69.5" r="1.2" fill="#f59e0b" />
        </>
      ) : kind === 'keyboard' ? (
        <>
          {/* Clean 3/4 isometric 75% CNC aluminum mechanical keyboard with distinct keycap clusters */}
          {/* Aluminum lower chassis wedge */}
          <path
            d="m17 44 82-18 24 27-82 19z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".7"
          />
          <path d="m17 44 24 28v4.5L17 48.5z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth=".55" />
          <path d="m41 72 82-19v4.5l-82 19z" fill="#94a3b8" />
          {/* Recessed dark switch plate */}
          <path d="m22 44.5 74-16.2 20 22.8-74 17z" fill="#1e2530" />
          {/* Row 1 (Esc + F-row) */}
          <path d="m24.5 44 5.4-1.2 2.4 2.8-5.4 1.2z" fill="#3b82f6" />
          {Array.from({ length: 10 }, (_, c) => (
            <path
              key={`r0-${c}`}
              d={`m${31.2 + c * 6.5} ${42.5 - c * 1.42} 5.4-1.2 2.4 2.8-5.4 1.2z`}
              fill={c >= 4 && c <= 7 ? '#e2e8f0' : '#f8fafc'}
            />
          ))}
          {/* Row 2 (Numbers) */}
          {Array.from({ length: 11 }, (_, c) => (
            <path
              key={`r1-${c}`}
              d={`m${28.4 + c * 6.5} ${48.4 - c * 1.42} 5.4-1.2 2.5 2.9-5.4 1.2z`}
              fill={c === 10 ? '#cbd5e1' : '#ffffff'}
            />
          ))}
          {/* Row 3 (QWERTY) */}
          {Array.from({ length: 11 }, (_, c) => (
            <path
              key={`r2-${c}`}
              d={`m${32.4 + c * 6.5} ${53.1 - c * 1.42} 5.4-1.2 2.5 2.9-5.4 1.2z`}
              fill={c === 0 || c === 10 ? '#cbd5e1' : '#ffffff'}
            />
          ))}
          {/* Row 4 (ASDF) */}
          {Array.from({ length: 11 }, (_, c) => (
            <path
              key={`r3-${c}`}
              d={`m${36.4 + c * 6.5} ${57.8 - c * 1.42} 5.4-1.2 2.5 2.9-5.4 1.2z`}
              fill={c === 0 || c === 10 ? '#cbd5e1' : '#ffffff'}
            />
          ))}
          {/* Row 5 (Bottom modifiers + clean spacebar) */}
          <path d="m40.4 62.5 11.4-2.5 2.5 2.9-11.4 2.5z" fill="#cbd5e1" />
          <path d="m53.6 59.6 31.5-6.9 2.5 2.9-31.5 6.9z" fill="#f8fafc" />
          <path d="m86.8 52.3 11.4-2.5 2.5 2.9-11.4 2.5z" fill="#cbd5e1" />
          <path d="m100 49.4 9.5-2.1 2.5 2.9-9.5 2.1z" fill="#94a3b8" />
        </>
      ) : kind === 'controller' ? (
        <>
          {/* Sculpted symmetrical ergonomic wireless gamepad (unbranded clean Home button) */}
          {/* Top L1/R1 shoulder bumpers */}
          <path
            d="M42 22.5c4.5-3 12-3 16.5-1l-1.5 4.5H41zM98 22.5c-4.5-3-12-3-16.5-1l1.5 4.5h16z"
            fill="#1e2430"
          />
          {/* Lower dark grip shell */}
          <path
            d="M35 28c6-5.5 15-5.5 22-3h26c7-2.5 16-2.5 22 3 8 8.5 13 33 7.5 41.5-4.5 7-13.5 1-20.5-11.5H48c-7 12.5-16 18.5-20.5 11.5C22 61 27 36.5 35 28Z"
            fill={`url(#${darkGrad})`}
          />
          {/* Upper contoured matte-white shell */}
          <path
            d="M35 28c6-5.5 15-5.5 22-3h26c7-2.5 16-2.5 22 3 5.5 6 9 20.5 8 30.5-5.5-5-11-9-19-9.5l-5-7.5H51l-5 7.5c-8 .5-13.5 4.5-19 9.5-1-10 2.5-24.5 8-30.5Z"
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth=".8"
            strokeLinejoin="round"
          />
          {/* Center matte touchpad with crisp thin cyan side glow */}
          <path d="M55.5 24.5h29l-2 15.5h-25z" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth=".6" />
          <line
            x1="55.2"
            y1="25.5"
            x2="57.2"
            y2="39.5"
            stroke="#38bdf8"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <line
            x1="84.8"
            y1="25.5"
            x2="82.8"
            y2="39.5"
            stroke="#38bdf8"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          {/* Dual symmetrical concave analog thumbsticks */}
          <circle cx="56" cy="48.5" r="6.4" fill="#151a22" />
          <circle cx="56" cy="48.5" r="4.6" fill="#2c3545" stroke="#475569" strokeWidth=".7" />
          <circle cx="84" cy="48.5" r="6.4" fill="#151a22" />
          <circle cx="84" cy="48.5" r="4.6" fill="#2c3545" stroke="#475569" strokeWidth=".7" />
          {/* Crisp 4-way D-pad */}
          <path d="M44 31v11M38.5 36.5h11" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
          {/* Clean unbranded circular Home button */}
          <circle cx="70" cy="48.5" r="3" fill="#334155" stroke="#94a3b8" strokeWidth=".7" />
          <circle cx="70" cy="48.5" r="1.1" fill="#e2e8f0" />
          {/* Four symmetrical face action buttons */}
          <circle cx="96" cy="31.5" r="2.2" fill="#475569" />
          <circle cx="101.2" cy="36.5" r="2.2" fill="#475569" />
          <circle cx="96" cy="41.5" r="2.2" fill="#475569" />
          <circle cx="90.8" cy="36.5" r="2.2" fill="#475569" />
        </>
      ) : kind === 'pegboard' ? (
        <>
          {/* Translucent desk-edge slice so desk-clamped pegboard mounting is physically clear */}
          <rect x="24" y="71.5" width="92" height="3.2" rx="1.2" fill="#cbd5e1" opacity=".6" />
          {/* Metal C-clamp desk base feet gripping the desk edge */}
          <path
            d="M39 68.5v7.5h11v-2.2h-7.8v-5.3zm51 0v7.5h11v-2.2h-7.8v-5.3z"
            fill="#475569"
            stroke="#334155"
            strokeWidth=".5"
            strokeLinejoin="round"
          />
          {/* Board side thickness & clean rounded front panel */}
          <rect x="33.5" y="10" width="76" height="59.5" rx="4.5" fill="#d2cbbd" />
          <rect
            x="31"
            y="10"
            width="75"
            height="59.5"
            rx="4.5"
            fill="#f6f2e9"
            stroke="#c6beb0"
            strokeWidth=".95"
          />
          {/* Staggered clean pill pegboard slots */}
          {Array.from({ length: 5 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => (
              <rect
                key={`${r}-${c}`}
                x={38 + c * 8.2}
                y={16 + r * 9.6 + (c % 2) * 4.4}
                width="2.1"
                height="5.4"
                rx="1.05"
                fill="#9ca3af"
              />
            )),
          )}
          {/* Mounted small organizer tray with subtle cast shadow & 2 sleek hooks */}
          <rect x="44.5" y="47" width="28" height="9.2" rx="2" fill="#cbd5e1" opacity=".55" />
          <rect
            x="43.5"
            y="45"
            width="28"
            height="9"
            rx="2"
            fill="#ffffff"
            stroke="#94a3b8"
            strokeWidth=".9"
          />
          <line x1="46.5" y1="47.2" x2="68.5" y2="47.2" stroke="#cbd5e1" strokeWidth=".8" />
          <path
            d="M84 25.5v7.5a2.5 2.5 0 0 0 5 0v-2M92.5 25.5v7.5a2.5 2.5 0 0 0 5 0v-2"
            stroke="#334155"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      ) : kind === 'gamingLaptop' ? (
        <>
          {/* 3/4 open 16" stealth gaming notebook with realistic 16:10 proportions & rear exhaust vents */}
          {/* Lower base deck with angled chamfer */}
          <path
            d="m24 55 56-10 34 17-57 12.5z"
            fill={`url(#${darkGrad})`}
            stroke="#11161d"
            strokeWidth=".7"
            strokeLinejoin="round"
          />
          <path d="m24 55 33 19.5v3.2L24 58.2z" fill="#10151c" />
          <path d="m57 74.5 57-12.5v3.2L57 77.7z" fill="#1e2633" />
          {/* Backlit keyboard recess + subtle cyan key rows + trackpad */}
          <path d="m34 55.2 44-8 16.5 8.5-44 8.6z" fill="#121821" />
          <path
            d="m38 56.2 39-7.1m-35 9.2 39-7.1m-35 9.2 39-7.1"
            stroke="#38bdf8"
            strokeWidth=".95"
            strokeLinecap="round"
            opacity=".62"
          />
          <path
            d="m61 65.5 16.5-3.4 6.5 3.4-16.5 3.6z"
            fill="#2a3342"
            stroke="#3f4a5d"
            strokeWidth=".5"
          />
          {/* Thin-bezel matte screen lid open at realistic ~108° */}
          <path
            d="m24 55 56-10-6.5-33-56 9.5z"
            fill="#232b37"
            stroke="#0f141c"
            strokeWidth=".7"
            strokeLinejoin="round"
          />
          <path d="m26.5 52.5 50.8-9.1-5.6-28.5-50.8 8.7z" fill={`url(#${screenGrad})`} />
          <path d="m21 23.6 26-4.5-11 31.5-9.5 1.9z" fill="#38bdf8" opacity=".12" />
        </>
      ) : kind === 'macbook' ? (
        <>
          {/* 3/4 open sleek silver unibody aluminum laptop (accurate thin slab + black key well + notch) */}
          <path
            d="m25 56 56-10 33 16.8-56 12z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".7"
            strokeLinejoin="round"
          />
          <path d="m25 56 33 18.8v2.2L25 58.2z" fill="#cbd5e1" />
          <path d="m58 74.8 56-12v2.2L58 77z" fill="#94a3b8" />
          {/* Subtle front thumb-opening scoop */}
          <path d="m82 69.8 9-1.9" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
          {/* Recessed black keyboard well with subtle keycap rows */}
          <path d="m35 56.2 43.5-7.8 15 7.8-43.5 8.4z" fill="#181c24" />
          <path
            d="m38.5 57.1 39-7m-35.5 8.8 39-7m-35.5 8.8 39-7"
            stroke="#334155"
            strokeWidth=".85"
            strokeLinecap="round"
          />
          {/* Generous centered glass trackpad */}
          <path
            d="m62 65.4 17.5-3.5 6.8 3.6-17.5 3.6z"
            fill="#dbe3ee"
            stroke="#94a3b8"
            strokeWidth=".55"
          />
          {/* Ultra-slim silver aluminum display lid */}
          <path
            d="m25 56 56-10-6.2-33.5-56 9.5z"
            fill="#dce3ed"
            stroke="#94a3b8"
            strokeWidth=".7"
            strokeLinejoin="round"
          />
          <path d="m27.3 53.5 51.2-9.1-5.4-29.2-51.2 8.7z" fill="#0f141c" />
          <path d="m28.6 52.1 48.6-8.6-5-27-48.6 8.2z" fill={`url(#${screenGrad})`} />
          {/* Subtle camera notch on top display bezel */}
          <path d="m45.5 21 6.8-1.1.5 2.4-6.8 1.1z" fill="#0f141c" />
          <path d="m23.6 24.7 22-3.7-10 29.2-7 1.9z" fill="#ffffff" opacity=".065" />
        </>
      ) : kind === 'macMini' ? (
        <>
          {/* Compact square CNC aluminum desktop (127 × 127 × 50 mm, clean unbranded aluminum top!) */}
          {/* Recessed circular dark thermal base tucked under body */}
          <ellipse cx="70" cy="69.5" rx="20" ry="5.5" fill="#1e242e" />
          {/* Rounded-squircle anodized silver aluminum body */}
          <path
            d="M44 47.5c0-2 1.8-3.8 5-4.8l16-5.2c3.2-1 6.8-1 10 0l16 5.2c3.2 1 5 2.8 5 4.8v14.5c0 2-1.8 3.8-5 4.8l-16 5.2c-3.2 1-6.8 1-10 0l-16-5.2c-3.2-1-5-2.8-5-4.8Z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".75"
          />
          {/* Crisp top chamfer highlight plane (pure clean aluminum, zero logo) */}
          <path
            d="M46.5 47.2 66 40.8c2.6-.8 5.4-.8 8 0l19.5 6.4-19.5 6.4c-2.6.8-5.4.8-8 0Z"
            fill="#f8fafc"
            opacity=".85"
          />
          {/* Right shaded side facet for 3D depth */}
          <path d="M70 54.4 95.8 46.5v15.8L70 71.8z" fill="#94a3b8" opacity=".32" />
          {/* Front-left face ports: 2× vertical USB-C + tiny white power LED + 3.5mm audio jack */}
          <line
            x1="51.5"
            y1="56.5"
            x2="51.5"
            y2="60.5"
            stroke="#1e293b"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <line
            x1="55.8"
            y1="58"
            x2="55.8"
            y2="62"
            stroke="#1e293b"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="60.2" cy="61.2" r="1.2" fill="#1e293b" />
          <circle cx="64.5" cy="62.7" r=".95" fill="#ffffff" />
        </>
      ) : kind === 'macStudio' ? (
        <>
          {/* Tall anodized aluminum workstation cube (197 × 197 × 95 mm, zero top logo!) */}
          <ellipse cx="70" cy="70.5" rx="23" ry="6" fill="#1b2029" />
          {/* Rounded-squircle tall CNC chassis */}
          <path
            d="M41 31.5c0-2.2 2-4.2 5.4-5.3l18.2-5.8c3.5-1.1 7.3-1.1 10.8 0l18.2 5.8c3.4 1.1 5.4 3.1 5.4 5.3v30.5c0 2.2-2 4.2-5.4 5.3l-18.2 5.8c-3.5 1.1-7.3 1.1-10.8 0l-18.2-5.8c-3.4-1.1-5.4-3.1-5.4-5.3Z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".8"
          />
          {/* Clean brushed top deck (pure aluminum, zero logo) */}
          <path
            d="M43.5 31.2 65.5 24c2.9-.9 6.1-.9 9 0l22 7.2-22 7.2c-2.9.9-6.1.9-9 0Z"
            fill="#f8fafc"
            opacity=".88"
          />
          {/* Right shaded aluminum face */}
          <path d="M70 39.2 98.8 30.2v32.2L70 73.5z" fill="#94a3b8" opacity=".32" />
          {/* Front lower I/O: 2× horizontal Type-C + SDXC card slot + power LED */}
          <rect x="46.5" y="55" width="4.4" height="1.7" rx=".85" fill="#1e293b" />
          <rect x="52.4" y="56.9" width="4.4" height="1.7" rx=".85" fill="#1e293b" />
          <rect x="58.6" y="58.8" width="7.2" height="1.9" rx=".7" fill="#0f172a" />
          <circle cx="67.5" cy="62.2" r="1" fill="#ffffff" />
        </>
      ) : kind === 'laptopStand' ? (
        <>
          {/* Clear architectural Z-fold anodized aluminum dual-hinge laptop stand */}
          {/* Grounded flat U-baseplate */}
          <path
            d="M36 69.5 82 61l22 7.5-46 8.5Z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".8"
            strokeLinejoin="round"
          />
          <path d="M47 69 78 63.2l11 3.8-31 5.8Z" fill="#eef2f7" opacity=".85" />
          {/* Sturdy rear angled aluminum lift strut connecting base hinge to top cradle hinge */}
          <path
            d="M84 63.5 64 36l9.5-2 20 27.5Z"
            fill={`url(#${aluSide})`}
            stroke="#64748b"
            strokeWidth=".7"
            strokeLinejoin="round"
          />
          {/* Precision metallic cylindrical hinge barrels */}
          <ellipse cx="89" cy="62.8" rx="4.8" ry="2.2" fill="#334155" />
          <ellipse cx="68.5" cy="34.8" rx="4.6" ry="2.1" fill="#334155" />
          {/* Slanted open-frame top laptop cradle tray with silicone anti-slip strips & front lips */}
          <path
            d="M33 43.5 85 26l22 9.5-52 17.5Z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".8"
            strokeLinejoin="round"
          />
          <path d="M45 42.5 81 30.3l10.5 4.6-36 12.2Z" fill="#eef2f7" opacity=".9" />
          {/* Silicone grip pads on cradle rails */}
          <line
            x1="40"
            y1="43"
            x2="77"
            y2="30.6"
            stroke="#334155"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <line
            x1="56"
            y1="49.5"
            x2="94"
            y2="36.8"
            stroke="#334155"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Curved front anti-slip catch hooks */}
          <path
            d="M33 43.5 31 38.5M55 53 53 48"
            stroke="#475569"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </>
      ) : kind === 'monitorArm' ? (
        <>
          {/* Realistic gas-spring single monitor arm clamped to translucent desk edge (zero brand badge) */}
          {/* Subtle desk-edge cross-section slice showing physical C-clamp attachment */}
          <path d="M74 63.5h48v4.5H74z" fill="#cbd5e1" opacity=".7" />
          {/* Heavy-duty desk C-clamp + bottom tightening screw */}
          <path
            d="M94 56h15v16h-15v-3.5h11v-9h-11Z"
            fill={`url(#${darkGrad})`}
            stroke="#11161d"
            strokeWidth=".6"
            strokeLinejoin="round"
          />
          <line x1="99" y1="72" x2="99" y2="76.5" stroke="#64748b" strokeWidth="1.6" />
          <line
            x1="95.5"
            y1="76.5"
            x2="102.5"
            y2="76.5"
            stroke="#475569"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Lower turret pillar */}
          <rect x="97.5" y="45" width="8" height="12" rx="1.6" fill="#2c3545" />
          {/* Lower articulating arm link */}
          <path d="M101 48 73 41.5" stroke="#334155" strokeWidth="7.2" strokeLinecap="round" />
          <path
            d="M100 46.8 74 40.6"
            stroke="#64748b"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity=".55"
          />
          {/* Upper gas-spring pneumatic arm link */}
          <path d="M73 41.5 47 23.5" stroke="#1e2633" strokeWidth="7.8" strokeLinecap="round" />
          <path
            d="M71.5 40 48.5 24"
            stroke="#64748b"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity=".5"
          />
          {/* Precision cylindrical elbow pivot joint */}
          <circle cx="73" cy="41.5" r="5" fill="#18202c" stroke="#94a3b8" strokeWidth="1" />
          <circle cx="73" cy="41.5" r="1.8" fill="#64748b" />
          {/* Tilted 3/4 VESA 100×100 mounting head with 4 screw holes */}
          <path
            d="m31 15 16.5-2.5 2.5 18.5-16.5 2.5z"
            fill={`url(#${darkGrad})`}
            stroke="#475569"
            strokeWidth=".8"
            strokeLinejoin="round"
          />
          <circle cx="35.5" cy="18.2" r="1" fill="#94a3b8" />
          <circle cx="43.8" cy="16.9" r="1" fill="#94a3b8" />
          <circle cx="37.2" cy="29.4" r="1" fill="#94a3b8" />
          <circle cx="45.5" cy="28.1" r="1" fill="#94a3b8" />
        </>
      ) : kind === 'monitorArmDual' ? (
        <>
          {/* Symmetrical dual gas-spring monitor arm clamped to translucent desk edge (zero brand badges) */}
          <path d="M22 64.5h96v4.2H22z" fill="#cbd5e1" opacity=".68" />
          {/* Twin C-clamp base */}
          <rect
            x="53"
            y="57"
            width="34"
            height="7.5"
            rx="2"
            fill={`url(#${darkGrad})`}
            stroke="#11161d"
            strokeWidth=".6"
          />
          <rect x="57.5" y="64.5" width="7" height="10.5" rx="1.4" fill="#18202c" />
          <rect x="75.5" y="64.5" width="7" height="10.5" rx="1.4" fill="#18202c" />
          {/* Left & right articulated arms */}
          <path
            d="M62 57V46L41 34 32 21M78 57V46L99 34 108 21"
            stroke="#2b3444"
            strokeWidth="5.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M62 46 41 34 32 21M78 46 99 34 108 21"
            stroke="#64748b"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity=".5"
          />
          {/* Cylindrical elbow joints */}
          <circle cx="41" cy="34" r="4.2" fill="#18202c" stroke="#94a3b8" strokeWidth=".9" />
          <circle cx="99" cy="34" r="4.2" fill="#18202c" stroke="#94a3b8" strokeWidth=".9" />
          {/* Symmetrical left & right VESA plates with 4 screw holes */}
          <rect
            x="20"
            y="12.5"
            width="15.5"
            height="15.5"
            rx="2"
            fill={`url(#${darkGrad})`}
            stroke="#475569"
            strokeWidth=".75"
          />
          <circle cx="23.5" cy="16" r=".85" fill="#94a3b8" />
          <circle cx="32" cy="16" r=".85" fill="#94a3b8" />
          <circle cx="23.5" cy="24.5" r=".85" fill="#94a3b8" />
          <circle cx="32" cy="24.5" r=".85" fill="#94a3b8" />
          <rect
            x="104.5"
            y="12.5"
            width="15.5"
            height="15.5"
            rx="2"
            fill={`url(#${darkGrad})`}
            stroke="#475569"
            strokeWidth=".75"
          />
          <circle cx="108" cy="16" r=".85" fill="#94a3b8" />
          <circle cx="116.5" cy="16" r=".85" fill="#94a3b8" />
          <circle cx="108" cy="24.5" r=".85" fill="#94a3b8" />
          <circle cx="116.5" cy="24.5" r=".85" fill="#94a3b8" />
        </>
      ) : kind === 'laptopTray' ? (
        <>
          {/* Ventilated powder-coated steel VESA laptop cradle tray with side grips & bottom stops */}
          {/* Rear VESA mount hub peeking underneath */}
          <path d="M62 56h16l2 10H60z" fill="#334155" />
          {/* Main tilted perforated steel tray */}
          <path
            d="m28 45.5 52-17.5 32 21-52 18.5z"
            fill={`url(#${darkGrad})`}
            stroke="#475569"
            strokeWidth=".8"
            strokeLinejoin="round"
          />
          <path d="m28 45.5 32 22v2.8L28 48.3z" fill="#10141b" />
          <path d="m60 67.5 52-18.5v2.8L60 70.3z" fill="#1b222d" />
          {/* Cooling ventilation slots */}
          {[0, 1, 2, 3].map((r) => (
            <path
              key={r}
              d={`m${43 + r * 5.2} ${45.5 + r * 3.4} 13-4.4m5-1.7 13-4.4`}
              stroke="#0c1016"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          ))}
          {/* Side adjustable spring retention arms */}
          <path
            d="m36 39-7 3 6 4.5M101 41l7 3-6 4.5"
            stroke="#64748b"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Bottom front curved laptop stopper lips */}
          <path
            d="m43 56-2.5-4.5M79 59.5 77 55"
            stroke="#94a3b8"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </>
      ) : kind === 'mouse' ? (
        <>
          {/* Elevated 3/4 ergonomic matte obsidian wireless gaming mouse (unmistakable silhouette, ZERO logo!) */}
          <g transform="translate(70, 44) rotate(24) translate(-70, -44)">
            {/* 3D lower flank / side skirt thickness */}
            <path
              d="M52 29c0-10.5 7.6-17.5 18-17.5s18 7 18 17.5v22c0 12.5-7.6 22.5-18 22.5S52 63.5 52 51V29Z"
              transform="translate(-3.4, 3.6)"
              fill="#0f131a"
            />
            {/* Main sculpted upper shell (ergonomic tapered nose & smooth rounded palm back) */}
            <path
              d="M53.2 28.5c0-10 7.2-16.5 16.8-16.5s16.8 6.5 16.8 16.5l.8 21.5c.3 12-7.2 21.5-17.6 21.5S52.1 62 52.4 50l.8-21.5Z"
              fill={`url(#${darkTop})`}
              stroke="#1e2633"
              strokeWidth=".85"
            />
            {/* Subtle palm contour specular rim highlight */}
            <path
              d="M57 52c1 8.5 6 14 13 14s12-5.5 13-14"
              stroke="#94a3b8"
              strokeWidth=".95"
              strokeLinecap="round"
              opacity=".25"
            />
            {/* Crisp LMB / RMB split center seam & horizontal button separation curve */}
            <line
              x1="70"
              y1="12.2"
              x2="70"
              y2="34.5"
              stroke="#0c1016"
              strokeWidth="1.35"
              strokeLinecap="round"
            />
            <path
              d="M53 35.5c5.5-2.2 11.2-3.2 17-3.2s11.5 1 17 3.2"
              stroke="#11161e"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            {/* Recessed scroll wheel housing + metallic knurled scroll wheel */}
            <rect x="66.6" y="18.2" width="6.8" height="13.2" rx="3.4" fill="#0b0f15" />
            <rect x="67.8" y="19.6" width="4.4" height="10.4" rx="2.2" fill={`url(#${aluGrad})`} />
            <path
              d="M68.4 22.4h3.2M68.4 24.8h3.2M68.4 27.2h3.2"
              stroke="#475569"
              strokeWidth=".75"
              strokeLinecap="round"
            />
            {/* Tiny neutral DPI status pinhole */}
            <circle cx="70" cy="36.2" r="1.05" fill="#e2e8f0" />
            {/* Dual crisp side thumb buttons along left flank */}
            <path
              d="M51 37.5v7.5M50.7 47v7.5"
              stroke="#64748b"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          </g>
        </>
      ) : kind === 'powerStrip' ? (
        <>
          {/* Clean 3/4 isometric rectangular desktop power strip with realistic AC 5-pin + USB-A/C */}
          {/* Integrated power cord stub exiting left */}
          <path
            d="M21 53.5c-6.5 1.5-10 4.5-9.5 8.5"
            stroke="#94a3b8"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          {/* 3D extruded rounded power strip casing */}
          <path
            d="m20 45 77-15.5c2.8-.6 6 .2 8 2l14 12.2c1.8 1.6 1.5 4.2-1.4 4.8l-77 15.8c-2.8.6-6-.2-8-2L18.6 50c-1.8-1.6-1.4-4.4 1.4-5Z"
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth=".9"
          />
          <path
            d="m17.8 49.5 14.5 12.8c2 1.8 5.2 2.5 8 1.9l77.2-15.8v4.8l-77.2 15.8c-2.8.6-6-.1-8-1.9L17.8 54.3Z"
            fill="#dce3ed"
            stroke="#94a3b8"
            strokeWidth=".65"
          />
          {/* Left master rocker switch + blue power LED */}
          <path
            d="m26 48.5 7-1.4 6.5 5.6-7 1.4z"
            fill="#e0f2fe"
            stroke="#38bdf8"
            strokeWidth=".8"
          />
          <circle cx="32.5" cy="50.5" r="1.2" fill="#0284c7" />
          {/* Three crisp GB 5-hole AC socket recesses */}
          {[0, 1, 2].map((idx) => {
            const ox = 43 + idx * 17.5;
            const oy = 45.2 - idx * 3.5;
            return (
              <g key={idx}>
                <path
                  d={`m${ox - 4} ${oy - 1.5} 10.5-2.1 7 6.2-10.5 2.1z`}
                  fill="#eef2f7"
                  stroke="#cbd5e1"
                  strokeWidth=".5"
                />
                {/* 2-pin slots */}
                <line
                  x1={ox}
                  y1={oy - 0.5}
                  x2={ox + 2.4}
                  y2={oy - 1}
                  stroke="#1e293b"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <line
                  x1={ox + 4}
                  y1={oy - 1.3}
                  x2={ox + 6.4}
                  y2={oy - 1.8}
                  stroke="#1e293b"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                {/* 3-pin grounded cluster */}
                <line
                  x1={ox + 5.2}
                  y1={oy + 1}
                  x2={ox + 6.8}
                  y2={oy + 2.4}
                  stroke="#1e293b"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <line
                  x1={ox + 3.2}
                  y1={oy + 3.1}
                  x2={ox + 5.4}
                  y2={oy + 2.7}
                  stroke="#1e293b"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                />
                <line
                  x1={ox + 7.6}
                  y1={oy + 2.2}
                  x2={ox + 9.6}
                  y2={oy + 1.8}
                  stroke="#1e293b"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          {/* Right USB-A & Type-C fast-charge ports */}
          <path d="m94.5 34.5 5.2-1.1 1.8 1.6-5.2 1.1z" fill="#1e293b" />
          <path d="m98.2 38 5.2-1.1 1.8 1.6-5.2 1.1z" fill="#1e293b" />
          <path d="m102.5 41.2 4.2-.9 1.2 1.1-4.2.9z" fill="#2563eb" />
        </>
      ) : kind === 'wallOutlet' ? (
        <>
          {/* 1:1 frameless 86-type wall outlet matching WallOutletModel (86 × 86 mm) */}
          {/* Outer back mounting frame (#cbd2dc / slate rim) */}
          <rect
            x="41"
            y="14"
            width="58"
            height="58"
            rx="2.8"
            fill="#94a0b2"
            stroke="#8490a3"
            strokeWidth=".8"
          />
          {/* Subtle bottom thickness lip of the raised frameless faceplate */}
          <rect x="42.4" y="16.4" width="55.2" height="54.4" rx="2.4" fill="#b8c1ce" />
          {/* Full-panel matte frameless faceplate (82 × 82 mm) */}
          <rect
            x="42.4"
            y="15.2"
            width="55.2"
            height="54.4"
            rx="2.4"
            fill="#dcdfe5"
            stroke="#eceff4"
            strokeWidth=".7"
          />
          {/* Top-left ice-blue micro power indicator LED */}
          <circle cx="50.6" cy="23.4" r="1.9" fill="#38bdf8" opacity=".28" />
          <circle cx="50.6" cy="23.4" r="1.25" fill="#7dd3fc" />

          {/* Centered 1:1 GB 5-hole combo receptacle (exact AcReceptacleSocket proportions) */}
          {/* Upper 2-pin vertical slots + inner brass contacts */}
          <g transform="translate(65.62, 37.3)">
            <rect x="-.9" y="-2.65" width="1.8" height="5.3" rx=".3" fill="#181c22" />
            <rect x="-.42" y="-1.85" width=".84" height="3.7" fill="#8b622e" />
          </g>
          <g transform="translate(74.38, 37.3)">
            <rect x="-.9" y="-2.65" width="1.8" height="5.3" rx=".3" fill="#181c22" />
            <rect x="-.42" y="-1.85" width=".84" height="3.7" fill="#8b622e" />
          </g>

          {/* Center vertical Ground (E) slot */}
          <rect x="69.1" y="40.1" width="1.8" height="5.4" rx=".3" fill="#181c22" />

          {/* Lower 28° V-angled Neutral / Live slots (\ /) + inner brass contacts */}
          <g transform="translate(65.14, 49.75) rotate(-28)">
            <rect x="-.9" y="-2.65" width="1.8" height="5.3" rx=".3" fill="#181c22" />
            <rect x="-.42" y="-1.85" width=".84" height="3.7" fill="#8b622e" />
          </g>
          <g transform="translate(74.86, 49.75) rotate(28)">
            <rect x="-.9" y="-2.65" width="1.8" height="5.3" rx=".3" fill="#181c22" />
            <rect x="-.42" y="-1.85" width=".84" height="3.7" fill="#8b622e" />
          </g>
        </>
      ) : kind === 'mousepad' ? (
        <>
          {/* Ultra-thin 4mm stitched woven cloth desk mat in crisp 3/4 view */}
          <path
            d="m16 49 77-16.5 31 23-77 17.5Z"
            fill={`url(#${padGrad})`}
            stroke="#0f131a"
            strokeWidth=".7"
            strokeLinejoin="round"
          />
          {/* Realistic thin 2px side rubber base thickness */}
          <path d="m16 49 31 24v2.1L16 51.1Z" fill="#0d1117" />
          <path d="m47 73 77-17.5v2.1L47 75.1Z" fill="#19202b" />
          {/* Subtle diagonal cloth sheen */}
          <path d="m22 49.5 35-7.5 18 23.5-26 5.8Z" fill="#ffffff" opacity=".045" />
          {/* Fine micro-stitched edge perimeter */}
          <path
            d="m20.5 49.4 71.5-15.3 26.8 19.9-71.5 16.3Z"
            stroke="#64748b"
            strokeWidth=".85"
            strokeDasharray="2.2 1.8"
            opacity=".75"
          />
        </>
      ) : (
        <>
          {/* Clean architectural studio cube for imported models */}
          <path d="m70 15 35 17-35 17-35-17z" fill="#f8fafc" stroke="#94a3b8" strokeWidth=".8" />
          <path
            d="m35 32 35 17v27L35 59z"
            fill={`url(#${aluGrad})`}
            stroke="#94a3b8"
            strokeWidth=".8"
          />
          <path
            d="m70 49 35-17v27L70 76z"
            fill={`url(#${aluSide})`}
            stroke="#94a3b8"
            strokeWidth=".8"
          />
        </>
      )}
    </svg>
  );
}

import type { BuiltinKind } from '../domain/project';
export function ModelThumbnail({ kind }: { kind: BuiltinKind | 'imported' }) {
  return (
    <svg
      viewBox="0 0 140 88"
      fill="none"
      aria-hidden="true"
      className={`model-illustration ${kind}`}
    >
      <ellipse cx="72" cy="76" rx="44" ry="5" fill="#243449" opacity=".07" />
      {kind === 'monitor' ? (
        <>
          <path d="M64 58v13l-17 5 29 3 17-5-19-3V58" fill="#778699" />
          <path d="M24 15 109 8l7 51-85 8z" fill="#354559" />
          <path d="m29 19 76-6 6 41-75 7z" fill="#315884" />
          <path d="m65 16 40-3 3 21-40 3z" fill="#7ca3ad" />
          <path d="m68 41 40-3 3 16-40 3z" fill="#263e5a" />
          <path d="m31 65 84-7 3 2-85 8z" fill="#738396" />
        </>
      ) : kind === 'speaker' ? (
        <>
          <path d="m48 11 38-5 21 11-39 7z" fill="#dbcbb1" />
          <path d="m86 6 21 11v55l-21-8z" fill="#baa68a" />
          <path d="m48 11 38 9v54l-38-9z" fill="#3e4b5a" />
          <ellipse cx="67" cy="49" rx="13" ry="15" fill="#1d2938" />
          <ellipse cx="67" cy="49" rx="8" ry="10" fill="#536175" />
          <ellipse cx="67" cy="49" rx="4" ry="5" fill="#2a3544" />
          <ellipse cx="67" cy="29" rx="5" ry="6" fill="#1d2938" />
          <circle cx="79" cy="67" r="1.5" fill="#d1b483" />
        </>
      ) : kind === 'keyboard' ? (
        <>
          <path d="m19 39 86-17 22 34-84 19z" fill="#9caec3" />
          <path d="m19 39 24 36v5l-24-35z" fill="#72859d" />
          <path d="m43 75 84-19v5L43 80z" fill="#8296ac" />
          {Array.from({ length: 4 }, (_, r) =>
            Array.from({ length: 11 }, (_, c) => (
              <path
                key={`${r}${c}`}
                d={`m${25 + c * 7.2 + r * 4.5} ${40 - c * 1.45 + r * 7} 5.7-1.2 3.5 5-5.7 1.2z`}
                fill={r === 3 ? '#cbbda8' : c === 0 ? '#657d99' : '#eaf0f4'}
              />
            )),
          )}
        </>
      ) : kind === 'controller' ? (
        <>
          <path
            d="M34 29c7-7 16-6 23-2l24-4c7-5 17-5 23 2 9 11 20 36 12 43-6 6-18-5-24-13l-31 5c-7 10-19 21-26 15-8-8-9-32-1-46Z"
            fill="#bdc9d7"
          />
          <path
            d="M34 29c7-7 16-6 23-2l24-4c7-5 17-5 23 2 5 6 8 16 6 23l-21-4-29 5-26 10c-5-12-4-23 0-30Z"
            fill="#e6edf3"
          />
          <ellipse cx="59" cy="47" rx="8" ry="6" fill="#3d5069" />
          <ellipse cx="84" cy="42" rx="8" ry="6" fill="#3d5069" />
          <path d="M43 30v15m-7-7 14-1" stroke="#60738a" strokeWidth="4" />
          <circle cx="96" cy="28" r="3" fill="#8ca794" />
          <circle cx="102" cy="35" r="3" fill="#bd8b80" />
          <circle cx="91" cy="38" r="3" fill="#899cbd" />
        </>
      ) : kind === 'pegboard' ? (
        <>
          <path d="m36 15 69-8 3 61-69 9z" fill="#d9d7cf" />
          <path d="m105 7 5 4 3 60-5-3z" fill="#b5b9b6" />
          {Array.from({ length: 6 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => (
              <circle
                key={`${r}${c}`}
                cx={43 + c * 8}
                cy={22 + r * 8 - c * 0.8}
                r="1.25"
                fill="#9fa9a9"
              />
            )),
          )}
          <path d="m43 50 25-3 9 7-25 3z" fill="#9caaa5" />
          <path d="m83 28 15-2 1 21-15 2z" fill="#bc9f77" />
          <path d="m46 74-8 5 17 2 11-5m27-7-5 5 17 2 9-5" stroke="#b8bfbd" strokeWidth="3" />
        </>
      ) : kind === 'lightbar' ? (
        <>
          <rect x="21" y="16" width="98" height="13" rx="6.5" fill="#aeb6c2" />
          <rect x="27" y="21" width="86" height="4" rx="2" fill="#eef2f7" />
          <rect x="19" y="14" width="7" height="17" rx="3" fill="#3c4450" />
          <rect x="114" y="14" width="7" height="17" rx="3" fill="#3c4450" />
          <rect x="64" y="29" width="8" height="30" rx="3" fill="#4a525e" />
          <path d="M64 59h9v6h9l4 4-4 4h-18z" fill="#39414d" />
        </>
      ) : (
        <>
          <path d="m70 12 38 21v35L70 81 33 61V27z" fill="#c3d2e6" />
          <path d="m33 27 37 20 38-14M70 47v34" stroke="#7f9aba" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

import { Cable, LayoutGrid, Layers, PanelTop, Ruler } from 'lucide-react';
import {
  DESK_CORNER_RADIUS_PRESETS,
  deskBounds,
  deskCornerRadius,
  deskOutlineRoundedPoints,
  deskShelfRect,
  deskSupportRects,
  GROMMET_DEFAULT_DIAMETER,
  GROMMET_DIAMETERS,
  grommetPosition,
  PARTITION_DEFAULT_HEIGHT,
  PARTITION_MAX_HEIGHT,
  PARTITION_MIN_HEIGHT,
  RETURN_MAX_EXTENSION,
  RETURN_MIN_EXTENSION,
  RETURN_MIN_WIDTH,
  returnWidthMax,
  setDeskDepth,
  setDeskShape,
  setDeskWidth,
  SHELF_DEFAULT_DEPTH,
  SHELF_DEFAULT_HEIGHT,
  SHELF_MAX_HEIGHT,
  SHELF_MIN_DEPTH,
  SHELF_MIN_HEIGHT,
  shelfDepthMax,
  WALL_DEFAULT_COLOR,
  WALL_DEFAULT_GAP,
  WALL_DEFAULT_HEIGHT,
  WALL_MAX_GAP,
  WALL_MAX_HEIGHT,
  WALL_MIN_GAP,
  WALL_MIN_HEIGHT,
  type DeskShape,
  type GrommetSide,
} from '../domain/desk';
import { computeWallOutletSize } from '../domain/power';
import { cm, meters, type Desk } from '../domain/project';
import { useEditor } from '../store/editorStore';
import { NumberField } from './NumberField';

const SHAPES: { value: DeskShape; label: string }[] = [
  { value: 'rectangle', label: '矩形' },
  { value: 'left', label: '左侧 L 形' },
  { value: 'right', label: '右侧 L 形' },
];

const GROMMET_SIDES: { value: GrommetSide; label: string }[] = [
  { value: 'left', label: '左侧' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右侧' },
];

const WALL_COLOR_SWATCHES = ['#ebe9e2', '#dfe4ea', '#d5ddd8', '#3a414c'];

function DeskTopDiagram({ desk }: { desk: Desk }) {
  const bounds = deskBounds(desk);
  const [main, wing] = deskSupportRects(desk);
  const outlinePts = deskOutlineRoundedPoints(desk, 6);
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const scale = Math.min(168 / spanX, 98 / spanZ);
  const ox = 120;
  const oy = 24 + (98 - spanZ * scale) / 2 - bounds.minZ * scale;
  const px = (x: number) => ox + x * scale;
  const pz = (z: number) => oy + z * scale;

  const shapePath =
    outlinePts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x).toFixed(1)} ${pz(p.z).toFixed(1)}`)
      .join(' ') + ' Z';

  const seatX = !wing
    ? ox
    : desk.return!.side === 'left'
      ? px((wing.maxX + main.maxX) / 2)
      : px((main.minX + wing.minX) / 2);
  const seatY = pz(main.maxZ) + 17;
  const mainDepthSide = desk.return?.side === 'right' ? 'left' : 'right';
  const mainDepthX = mainDepthSide === 'left' ? px(main.minX) - 6 : px(main.maxX) + 6;
  const totalDepthCm = cm(desk.depth + (desk.return?.extension ?? 0));
  const grommet = grommetPosition(desk);
  const shelfRect = deskShelfRect(desk);
  const partitions = !desk.return ? desk.partitions : undefined;

  const cornerRadiusM = deskCornerRadius(desk);

  return (
    <div className="desk-diagram" aria-label="桌面俯视尺寸示意">
      <svg viewBox="0 0 240 164" role="img" aria-label="桌子俯视布局与坐席方向示意图">
        <path d={shapePath} className="desk-diagram-shape" />
        {shelfRect && (
          <rect
            x={px(shelfRect.minX)}
            y={pz(shelfRect.minZ)}
            width={(shelfRect.maxX - shelfRect.minX) * scale}
            height={(shelfRect.maxZ - shelfRect.minZ) * scale}
            className="desk-diagram-shelf"
          />
        )}
        {partitions?.back && (
          <line
            x1={px(main.minX)}
            y1={pz(main.minZ) - 2}
            x2={px(main.maxX)}
            y2={pz(main.minZ) - 2}
            className="desk-diagram-partition"
          />
        )}
        {partitions?.left && (
          <line
            x1={px(main.minX) - 2}
            y1={pz(main.minZ)}
            x2={px(main.minX) - 2}
            y2={pz(main.maxZ)}
            className="desk-diagram-partition"
          />
        )}
        {partitions?.right && (
          <line
            x1={px(main.maxX) + 2}
            y1={pz(main.minZ)}
            x2={px(main.maxX) + 2}
            y2={pz(main.maxZ)}
            className="desk-diagram-partition"
          />
        )}
        {grommet && (
          <circle
            cx={px(grommet.x)}
            cy={pz(grommet.z)}
            r={Math.max(2.6, (grommet.diameter / 2) * scale)}
            className="desk-diagram-grommet"
          />
        )}
        {wing && (
          <line
            x1={px(wing.minX)}
            y1={pz(main.maxZ)}
            x2={px(wing.maxX)}
            y2={pz(main.maxZ)}
            className="desk-diagram-seam"
          />
        )}
        <text x={px(0)} y={pz(0) + 3} textAnchor="middle" className="desk-diagram-tag">
          主桌
        </text>
        {wing && (
          <text
            x={px((wing.minX + wing.maxX) / 2)}
            y={pz((wing.minZ + wing.maxZ) / 2) + 3}
            textAnchor="middle"
            className="desk-diagram-tag"
          >
            侧翼
          </text>
        )}
        <text x={ox} y={pz(bounds.minZ) - 7} textAnchor="middle" className="desk-diagram-dim">
          {wing ? `主桌宽 ${cm(desk.width)} cm` : `${cm(desk.width)} cm`}
        </text>
        <text
          x={mainDepthX}
          y={pz(0) + 3}
          textAnchor={mainDepthSide === 'left' ? 'end' : 'start'}
          className="desk-diagram-dim"
        >
          {cm(desk.depth)}
        </text>
        {wing && desk.return && (
          <>
            <text
              x={desk.return.side === 'left' ? px(wing.minX) - 6 : px(wing.maxX) + 6}
              y={pz((wing.minZ + wing.maxZ) / 2) + 3}
              textAnchor={desk.return.side === 'left' ? 'end' : 'start'}
              className="desk-diagram-dim"
            >
              +{cm(desk.return.extension)}
            </text>
            <text
              x={px((wing.minX + wing.maxX) / 2)}
              y={pz(wing.maxZ) + 12}
              textAnchor="middle"
              className="desk-diagram-dim"
            >
              翼宽 {cm(desk.return.width)}
            </text>
          </>
        )}
        <g transform={`translate(${seatX.toFixed(1)}, ${seatY.toFixed(1)})`}>
          <path d="M 0 -10 L -3 -5 M 0 -10 L 3 -5 M 0 -10 L 0 -1" className="desk-diagram-arrow" />
          <text x="0" y="9" textAnchor="middle" className="desk-diagram-seat">
            坐席
          </text>
        </g>
      </svg>
      <div className="desk-diagram-caption">
        {desk.return ? (
          <>
            <span>总深度 {totalDepthCm} cm</span>
            <small>
              {cornerRadiusM > 0 ? `前角与内转角 R${cm(cornerRadiusM)} cm 倒圆角` : '直角桌角'}
            </small>
          </>
        ) : (
          <>
            <span>
              桌面 {cm(desk.width)} × {cm(desk.depth)} cm
            </span>
            <small>
              {cornerRadiusM > 0 ? `人侧前角 R${cm(cornerRadiusM)} cm 倒圆角` : '直角桌角'}
            </small>
          </>
        )}
      </div>
    </div>
  );
}

export default function DeskInspector({
  desk,
  onSafe,
}: {
  desk: Desk;
  onSafe: (fn: () => void) => void;
}) {
  const commit = useEditor((s) => s.commit);
  const shape: DeskShape = desk.return ? desk.return.side : 'rectangle';
  const maxWingWidthCm = cm(returnWidthMax(desk.width));
  const maxShelfDepthCm = cm(shelfDepthMax(desk.depth));
  const grommet = desk.grommet;
  const partitions = desk.partitions;
  const shelf = desk.shelf;
  const backWall = desk.backWall;

  function toggleBackWall(enabled: boolean) {
    useEditor.getState().endGesture();
    onSafe(() =>
      commit((p) => {
        if (!enabled) {
          delete p.desk.backWall;
          for (const it of p.items) {
            if (it.kind === 'pegboard' && it.surface === 'wall') {
              delete it.surface;
              delete it.wallY;
              it.z = Math.max(-p.desk.depth / 2 + it.size.depth / 2 + 0.04, it.z);
            } else if (it.kind === 'wallOutlet' && it.surface !== 'floor') {
              const nextOutlet = {
                mount: 'floor' as const,
                outletType: it.wallOutlet?.outletType ?? ('combo5' as const),
                gangs: 1 as const,
                usbA: it.wallOutlet?.usbA ?? 0,
                usbC: 0 as const,
              };
              it.wallOutlet = nextOutlet;
              it.surface = 'floor';
              delete it.wallY;
              it.size = computeWallOutletSize(nextOutlet);
              it.z = Math.max(-p.desk.depth / 2, it.z);
            }
          }
        } else {
          p.desk.backWall = {
            enabled: true,
            height: p.desk.backWall?.height ?? WALL_DEFAULT_HEIGHT,
            gap: p.desk.backWall?.gap ?? WALL_DEFAULT_GAP,
            color: p.desk.backWall?.color ?? WALL_DEFAULT_COLOR,
          };
        }
      }),
    );
  }

  function toggleGrommet(enabled: boolean) {
    useEditor.getState().endGesture();
    onSafe(() =>
      commit((p) => {
        if (!enabled) {
          delete p.desk.grommet;
        } else {
          p.desk.grommet = {
            enabled: true,
            side: p.desk.grommet?.side ?? 'center',
            diameter: p.desk.grommet?.diameter ?? GROMMET_DEFAULT_DIAMETER,
          };
        }
      }),
    );
  }

  function updatePartition(key: 'back' | 'left' | 'right', value: boolean) {
    useEditor.getState().endGesture();
    onSafe(() =>
      commit((p) => {
        const next = {
          back: p.desk.partitions?.back ?? false,
          left: p.desk.partitions?.left ?? false,
          right: p.desk.partitions?.right ?? false,
          height: p.desk.partitions?.height ?? PARTITION_DEFAULT_HEIGHT,
          ...(p.desk.partitions?.material ? { material: p.desk.partitions.material } : {}),
          [key]: value,
        };
        if (!next.back && !next.left && !next.right) {
          delete p.desk.partitions;
          // 平行层架依附于后侧或两侧挡板存在，移除全部挡板时同步关闭层架
          delete p.desk.shelf;
        } else {
          p.desk.partitions = next;
        }
      }),
    );
  }

  function toggleShelf(enabled: boolean) {
    useEditor.getState().endGesture();
    onSafe(() =>
      commit((p) => {
        if (!enabled) {
          delete p.desk.shelf;
        } else {
          const nextHeight = p.desk.shelf?.height ?? SHELF_DEFAULT_HEIGHT;
          p.desk.shelf = {
            enabled: true,
            depth: Math.min(SHELF_DEFAULT_DEPTH, shelfDepthMax(p.desk.depth)),
            height: nextHeight,
          };
          const cur = p.desk.partitions;
          const hasSupport = Boolean(cur?.back || (cur?.left && cur?.right));
          if (!hasSupport) {
            p.desk.partitions = {
              back: true,
              left: cur?.left ?? false,
              right: cur?.right ?? false,
              height: Math.min(
                PARTITION_MAX_HEIGHT,
                Math.max(cur?.height ?? PARTITION_DEFAULT_HEIGHT, nextHeight + 0.04),
              ),
              ...(cur?.material ? { material: cur.material } : {}),
            };
          } else if (cur && cur.height < nextHeight + 0.03) {
            cur.height = Math.min(PARTITION_MAX_HEIGHT, Math.max(cur.height, nextHeight + 0.04));
          }
        }
      }),
    );
  }

  return (
    <>
      <section className="property-section">
        <h4>
          <LayoutGrid size={15} /> 桌型布局
        </h4>
        <div className="desk-shape-presets" role="group" aria-label="桌型">
          {SHAPES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={shape === option.value ? 'active' : ''}
              aria-pressed={shape === option.value}
              onClick={() => {
                useEditor.getState().endGesture();
                onSafe(() =>
                  commit((p) => {
                    setDeskShape(p.desk, option.value);
                  }),
                );
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="field-note">
          人侧前角及 L 形内凹转角均支持倒圆角（默认 R5 cm）；左／右以坐在桌前、面向主桌为准。
        </p>
        <div style={{ marginTop: 10 }}>
          <span className="field-label-small">人侧与内转角倒圆角半径</span>
          <div className="monitor-presets" role="group" aria-label="桌角倒圆角预设">
            {DESK_CORNER_RADIUS_PRESETS.map((rM) => {
              const active = Math.abs(deskCornerRadius(desk) - rM) < 1e-4;
              return (
                <button
                  key={rM}
                  type="button"
                  className={active ? 'active' : ''}
                  aria-pressed={active}
                  onClick={() =>
                    onSafe(() =>
                      commit((p) => {
                        p.desk.cornerRadius = rM;
                      }),
                    )
                  }
                >
                  {rM === 0 ? '直角' : `R${cm(rM)}`}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8 }}>
            <NumberField
              label="倒圆角半径"
              value={cm(deskCornerRadius(desk))}
              min={0}
              max={12}
              step={0.5}
              onChange={(v) =>
                onSafe(() =>
                  commit((p) => {
                    p.desk.cornerRadius = meters(v);
                  }),
                )
              }
            />
          </div>
        </div>
        <DeskTopDiagram desk={desk} />
      </section>

      <section className="property-section">
        <h4>
          <Ruler size={15} /> 桌面尺寸
        </h4>
        <div className="field-grid">
          <NumberField
            label={desk.return ? '主桌宽度' : '宽度'}
            value={cm(desk.width)}
            min={60}
            max={300}
            onChange={(v) =>
              onSafe(() =>
                commit((p) => {
                  setDeskWidth(p.desk, meters(v));
                }),
              )
            }
          />
          <NumberField
            label={desk.return ? '主桌深度' : '深度'}
            value={cm(desk.depth)}
            min={35}
            max={150}
            onChange={(v) =>
              onSafe(() =>
                commit((p) => {
                  setDeskDepth(p.desk, meters(v));
                }),
              )
            }
          />
          {desk.return && (
            <>
              <NumberField
                label="侧翼宽度"
                value={cm(desk.return.width)}
                min={cm(RETURN_MIN_WIDTH)}
                max={maxWingWidthCm}
                onChange={(v) =>
                  onSafe(() =>
                    commit((p) => {
                      if (p.desk.return) p.desk.return.width = meters(v);
                    }),
                  )
                }
              />
              <NumberField
                label="向前延伸"
                value={cm(desk.return.extension)}
                min={cm(RETURN_MIN_EXTENSION)}
                max={cm(RETURN_MAX_EXTENSION)}
                onChange={(v) =>
                  onSafe(() =>
                    commit((p) => {
                      if (p.desk.return) p.desk.return.extension = meters(v);
                    }),
                  )
                }
              />
            </>
          )}
          <NumberField
            label="桌面离地高度"
            value={cm(desk.height)}
            min={40}
            max={130}
            onChange={(v) =>
              onSafe(() =>
                commit((p) => {
                  p.desk.height = meters(v);
                }),
              )
            }
          />
          <NumberField
            label="桌板厚度"
            value={cm(desk.thickness)}
            min={1.5}
            max={10}
            step={0.1}
            onChange={(v) =>
              onSafe(() =>
                commit((p) => {
                  p.desk.thickness = meters(v);
                }),
              )
            }
          />
        </div>
        <p className="field-note">
          {desk.return
            ? `缩小主桌宽度时，侧翼宽度会同步缩小以保留缺口；向前延伸不包含主桌深度（总深度 ${cm(desk.depth + desk.return.extension)} cm）。高度以桌面上表面为准，桌上物品会随之移动。`
            : '高度以桌面上表面为准，桌上物品会随之移动。'}
        </p>
      </section>

      <section className="property-section">
        <h4>
          <Cable size={15} /> 桌面走线孔
        </h4>
        <label className="lamp-switch">
          <span>开启标准走线孔</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="开启标准走线孔"
            checked={Boolean(grommet?.enabled)}
            onChange={(e) => toggleGrommet(e.target.checked)}
          />
        </label>
        {grommet?.enabled && (
          <>
            <div className="desk-shape-presets" role="group" aria-label="走线孔位置">
              {GROMMET_SIDES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={grommet.side === opt.value ? 'active' : ''}
                  aria-pressed={grommet.side === opt.value}
                  onClick={() =>
                    onSafe(() =>
                      commit((p) => {
                        if (p.desk.grommet) p.desk.grommet.side = opt.value;
                      }),
                    )
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div
              className="desk-shape-presets"
              role="group"
              aria-label="走线孔径"
              style={{ marginTop: 8 }}
            >
              {GROMMET_DIAMETERS.map((d) => {
                const mm = Math.round(d * 1000);
                const active = (grommet.diameter ?? GROMMET_DEFAULT_DIAMETER) === d;
                return (
                  <button
                    key={mm}
                    type="button"
                    className={active ? 'active' : ''}
                    aria-pressed={active}
                    onClick={() =>
                      onSafe(() =>
                        commit((p) => {
                          if (p.desk.grommet) p.desk.grommet.diameter = d;
                        }),
                      )
                    }
                  >
                    {mm} mm
                  </button>
                );
              })}
            </div>
            <p className="field-note">
              默认市面标准 60 mm 护线孔，位于主桌后方，供线缆穿孔垂落桌下。
            </p>
          </>
        )}
      </section>

      <section className="property-section">
        <h4>
          <PanelTop size={15} /> 工位挡板与一体层架
        </h4>
        {desk.return ? (
          <p className="field-note">工位隔断挡板与桌体一体等宽层架仅支持矩形桌面。</p>
        ) : (
          <>
            <div className="desk-toggle-row">
              <label className="desk-check">
                <input
                  type="checkbox"
                  aria-label="后挡板"
                  checked={Boolean(partitions?.back)}
                  onChange={(e) => updatePartition('back', e.target.checked)}
                />
                <span>后挡板</span>
              </label>
              <label className="desk-check">
                <input
                  type="checkbox"
                  aria-label="左侧挡板"
                  checked={Boolean(partitions?.left)}
                  onChange={(e) => updatePartition('left', e.target.checked)}
                />
                <span>左侧挡板</span>
              </label>
              <label className="desk-check">
                <input
                  type="checkbox"
                  aria-label="右侧挡板"
                  checked={Boolean(partitions?.right)}
                  onChange={(e) => updatePartition('right', e.target.checked)}
                />
                <span>右侧挡板</span>
              </label>
            </div>
            {partitions && (partitions.back || partitions.left || partitions.right) && (
              <div style={{ marginTop: 12 }}>
                <NumberField
                  label="挡板高度"
                  value={cm(partitions.height)}
                  min={cm(PARTITION_MIN_HEIGHT)}
                  max={cm(PARTITION_MAX_HEIGHT)}
                  step={1}
                  onChange={(v) =>
                    onSafe(() =>
                      commit((p) => {
                        if (p.desk.partitions) p.desk.partitions.height = meters(v);
                      }),
                    )
                  }
                />
                <div style={{ marginTop: 10 }}>
                  <span className="field-label-small">挡板材质（侧板 / 后板）</span>
                  <div className="desk-shape-presets" role="group" aria-label="挡板材质">
                    {(
                      [
                        { value: 'matchDesk', label: '同桌面材质' },
                        { value: 'frosted', label: '透明磨砂' },
                      ] as const
                    ).map((opt) => {
                      const active = (partitions.material ?? 'matchDesk') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={active ? 'active' : ''}
                          aria-pressed={active}
                          onClick={() =>
                            onSafe(() =>
                              commit((p) => {
                                if (p.desk.partitions) p.desk.partitions.material = opt.value;
                              }),
                            )
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="field-note">
                  {partitions.material === 'frosted'
                    ? '半透明哑光磨砂板材，保留通透采光同时兼顾桌底包边密封与底部固定卡扣。'
                    : '材质与桌面一致，与桌体倒角及包边密封裙边一体成型，拐角连续圆角包覆。'}
                </p>
              </div>
            )}

            <label className="lamp-switch" style={{ marginTop: 16 }}>
              <span>
                <Layers size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                桌体等宽平行层架
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="桌体等宽平行层架"
                checked={Boolean(shelf?.enabled)}
                onChange={(e) => toggleShelf(e.target.checked)}
              />
            </label>
            {shelf?.enabled && (
              <>
                <div className="field-grid">
                  <NumberField
                    label="层架纵深"
                    value={cm(shelf.depth)}
                    min={cm(SHELF_MIN_DEPTH)}
                    max={maxShelfDepthCm}
                    step={1}
                    onChange={(v) =>
                      onSafe(() =>
                        commit((p) => {
                          if (p.desk.shelf) p.desk.shelf.depth = meters(v);
                        }),
                      )
                    }
                  />
                  <NumberField
                    label="架面高度"
                    value={cm(shelf.height)}
                    min={cm(SHELF_MIN_HEIGHT)}
                    max={cm(SHELF_MAX_HEIGHT)}
                    step={1}
                    onChange={(v) =>
                      onSafe(() =>
                        commit((p) => {
                          if (!p.desk.shelf) return;
                          const nextH = meters(v);
                          p.desk.shelf.height = nextH;
                          if (p.desk.partitions && p.desk.partitions.height < nextH + 0.03) {
                            p.desk.partitions.height = Math.min(PARTITION_MAX_HEIGHT, nextH + 0.04);
                          }
                        }),
                      )
                    }
                  />
                </div>
                <p className="field-note">
                  {partitions?.back
                    ? partitions.left || partitions.right
                      ? `与主桌等宽（${cm(desk.width)} cm），材质与桌面一致并直接嵌合于后板及侧板内侧（桌底悬空无立柱）。`
                      : `与主桌等宽（${cm(desk.width)} cm），材质与桌面一致并一体嵌合于后板内侧（桌底悬空无立柱）。`
                    : partitions?.left && partitions?.right
                      ? `与主桌等宽（${cm(desk.width)} cm），材质与桌面一致并一体嵌合于两侧侧板内侧（桌底悬空无立柱）。`
                      : `与主桌等宽（${cm(desk.width)} cm），材质与桌面一致；建议开启后挡板或双侧挡板提供更稳固连接。`}
                </p>
              </>
            )}
          </>
        )}
      </section>

      <section className="property-section">
        <h4>
          <PanelTop size={15} /> 桌后墙面（壁挂环境）
        </h4>
        <label className="lamp-switch">
          <span>桌后整面墙体</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="桌后墙面"
            checked={Boolean(backWall?.enabled)}
            onChange={(e) => toggleBackWall(e.target.checked)}
          />
        </label>
        {backWall?.enabled && (
          <>
            <div className="field-grid" style={{ marginTop: 10 }}>
              <NumberField
                label="墙面高出桌面"
                value={cm(backWall.height)}
                min={cm(WALL_MIN_HEIGHT)}
                max={cm(WALL_MAX_HEIGHT)}
                step={5}
                onChange={(v) =>
                  onSafe(() =>
                    commit((p) => {
                      if (p.desk.backWall) p.desk.backWall.height = meters(v);
                    }),
                  )
                }
              />
              <NumberField
                label="墙桌后距"
                value={cm(backWall.gap ?? WALL_DEFAULT_GAP)}
                min={cm(WALL_MIN_GAP)}
                max={cm(WALL_MAX_GAP)}
                step={0.5}
                onChange={(v) =>
                  onSafe(() =>
                    commit((p) => {
                      if (p.desk.backWall) p.desk.backWall.gap = meters(v);
                    }),
                  )
                }
              />
            </div>
            <div className="swatches" style={{ marginTop: 10 }}>
              {WALL_COLOR_SWATCHES.map((wc) => (
                <button
                  key={wc}
                  title={`墙面色 ${wc}`}
                  aria-label={`选择墙面颜色 ${wc}`}
                  aria-pressed={(backWall.color ?? WALL_DEFAULT_COLOR) === wc}
                  style={{ backgroundColor: wc }}
                  onClick={() =>
                    onSafe(() =>
                      commit((p) => {
                        if (p.desk.backWall) p.desk.backWall.color = wc;
                      }),
                    )
                  }
                />
              ))}
            </div>
            <p className="field-note">
              开启后可在桌后直接壁挂洞洞板，并保留踢脚线与桌后理线/支架夹持间隙。
            </p>
          </>
        )}
      </section>

      <section className="property-section">
        <h4>
          <Cable size={15} /> 物理避障与 3D 理线约束
        </h4>
        <PhysicalConstraintsPanel />
      </section>
    </>
  );
}

function PhysicalConstraintsPanel() {
  const { collisionEnabled, setCollisionEnabled, wiringMode, setWiringMode, project } = useEditor();
  return (
    <>
      <label className="lamp-switch">
        <span>模型物理防穿模约束</span>
        <input
          type="checkbox"
          role="switch"
          aria-label="模型物理防穿模约束"
          checked={collisionEnabled}
          onChange={(e) => setCollisionEnabled(e.target.checked)}
        />
      </label>
      <p className="field-note">
        启用后桌面、层架、地面与墙面物品拖动时会自动防穿透避让，走线也将自动绕行固体障碍并可穿过走线孔。
      </p>
      <button
        type="button"
        className={wiringMode ? 'active' : ''}
        aria-pressed={wiringMode}
        style={{ marginTop: 8, width: '100%' }}
        onClick={() => setWiringMode(!wiringMode)}
      >
        {wiringMode
          ? '退出 3D 点击端口连线模式'
          : `进入 3D 点选端口连线（已连接 ${project.cables?.length ?? 0} 根线缆）`}
      </button>
    </>
  );
}

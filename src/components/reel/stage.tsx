"use client";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { bubbleContent, center, lineAt, wordAt, type Frame } from "./timeline";
import { formatMetric, NodeGlyph } from "./v2-elements";
import { fitScene, labelRect, routeArrow, type Rect } from "./stage-layout";
export const palette = {
  blue: "#8bb9df",
  green: "#b5c5b8",
  orange: "#c9bca8",
  red: "#d9a6a6",
  purple: "#bab5c5",
  gray: "#b6bfcd",
};
const DEFAULT_WIDTH: Record<string, number> = { node: 22, bubble: 76, alert: 88, metric: 40 };
const METRIC_COUNT_MS = 900;
const FLOW_SECONDS = 1.8;
function FlowDots({
  path,
  color,
  count,
  unit,
  still,
  at,
}: {
  path: string;
  color: string;
  count: number;
  unit: number;
  still: boolean;
  at: (t: number) => { x: number; y: number };
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const dot = (
          <>
            <circle r={unit * 2.2} fill={color} opacity={0.22} />
            <circle r={unit * 1.1} fill={color} className="flow-dot" style={{ color }} />
          </>
        );
        if (still) {
          const p = at((i + 1) / (count + 1));
          return <g key={i} transform={`translate(${p.x} ${p.y})`}>{dot}</g>;
        }
        const begin = `${-(i * FLOW_SECONDS) / count}s`;
        return (
          <g key={path + i}>
            {dot}
            <animateMotion dur={`${FLOW_SECONDS}s`} begin={begin} repeatCount="indefinite" path={path} />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.12;0.88;1"
              dur={`${FLOW_SECONDS}s`}
              begin={begin}
              repeatCount="indefinite"
            />
          </g>
        );
      })}
    </>
  );
}
function Code({ text }: { text: string }) {
  return (
    <pre>
      {text
        .split(
          /(\b(?:const|let|return|if|else|for|class|import|from|sudo|adb|make|ninja|int|void|struct)\b|"[^"\n]*"|'[^'\n]*'|\b\d+\b)/g,
        )
        .map((part, i) => (
          <span key={i} className={i % 2 ? "syntax" : ""}>
            {part}
          </span>
        ))}
    </pre>
  );
}

function Captions({ frame, elapsed }: { frame: Frame; elapsed: number }) {
  if (!frame.lines.length)
    return (
      <div className="captions" aria-label={frame.caption}>
        <div className="cap-text">{frame.caption}</div>
      </div>
    );
  // One whole line at a time; only the current word inside it is highlighted.
  const index = lineAt(frame, elapsed),
    line = frame.lines[index],
    word = wordAt(line, elapsed),
    member = frame.cast.find((c) => c.id === line.speaker),
    color = member ? palette[member.color] : undefined;
  return (
    <div className="captions" aria-label={line.text}>
      <div
        className="cap-line"
        key={index}
        style={color ? ({ "--spk": color } as React.CSSProperties) : undefined}
      >
        {member && <span className="cap-chip">{member.name}</span>}
        <div className="cap-text">
          {line.words.map((w, i) => (
            <span key={i} className={i === word ? "spoken" : ""}>
              {w.w}{" "}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
export function Stage({ frame, elapsed }: { frame: Frame; elapsed: number }) {
  const marker = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{
    bounds: Record<string, Rect>;
    width: number;
    height: number;
    labels: Record<string, number>;
  }>({ bounds: {}, width: 0, height: 0, labels: {} });
  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    const measure = () => {
      // Measure every authored element, including later entrances, to avoid layout jumps.
      const bounds: Record<string, Rect> = Object.create(null);
      root
        .querySelectorAll<HTMLElement>("[data-element-id]")
        .forEach((node) => {
          bounds[node.dataset.elementId!] = {
            x: node.offsetLeft,
            y: node.offsetTop,
            w: node.offsetWidth,
            h: node.offsetHeight,
          };
        });
      const labels: Record<string, number> = Object.create(null);
      root
        .querySelectorAll<HTMLElement>("[data-arrow-label]")
        .forEach((node) => {
          labels[node.dataset.arrowLabel!] = node.offsetHeight;
        });
      const next = {
        bounds,
        width: root.clientWidth,
        height: root.clientHeight,
        labels,
      };
      setLayout((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root
      .querySelectorAll("[data-element-id], [data-arrow-label]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [frame]);
  const { width, height } = layout,
    unit = width / 100;
  const { resolve, arrows, fit } = useMemo(() => {
    const { bounds, width, height } = layout,
      unit = width / 100;
    const resolve = (id: string, visited = new Set<string>()): Rect => {
      if (bounds[id]) return bounds[id];
      const e = frame.elements.find((e) => e.id === id);
      if (e?.type === "highlight" && !visited.has(id)) {
        visited.add(id);
        return resolve(e.target, visited);
      }
      const p = center(id, frame.elements);
      return { x: (p.x * width) / 100, y: (p.y * height) / 100, w: 0, h: 0 };
    };
    const rects = Object.values(bounds);
    const arrows = frame.elements
      .filter((e) => e.type === "arrow" || e.type === "flow")
      .map((e) => {
        const source = resolve(e.from),
          target = resolve(e.to);
        const route = routeArrow(
          source,
          target,
          rects.filter((r) => r !== source && r !== target),
          unit || 1,
        );
        const label = e.label
          ? labelRect(
              route.point(0.5),
              route.normal,
              Math.min(80, e.label.length * 1.9 + 5) * unit,
              layout.labels[e.id] ||
                (Math.ceil(e.label.length / 38) * 4.3 + 2) * unit,
              rects,
            )
          : undefined;
        return { e, route, label };
      });
    const fit = fitScene(
      [
        ...rects,
        ...arrows.flatMap((a) => [
          ...a.route.points.map((p) => ({ ...p, w: unit * 2, h: unit * 2 })),
          ...(a.label ? [a.label] : []),
        ]),
      ],
      width,
      height,
    );
    return { resolve, arrows, fit };
  }, [layout, frame.elements]);
  return (
    <div className="stage" ref={stage}>
      {frame.card ? (
        <motion.div
          className={`hook-card ${frame.card}`}
          initial={reduced ? false : { scale: 0.86, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
        >
          <span>
            {frame.card === "hook"
              ? "A question worth a minute"
              : frame.card === "next"
                ? "Next in this series"
                : "Take this with you"}
          </span>
          <h2>{frame.text}</h2>
          {frame.card === "takeaway" && (
            <span className="completion"><Check size={14} strokeWidth={2} aria-hidden /> Concept unlocked</span>
          )}
        </motion.div>
      ) : (
        <div
          className="scene-content"
          style={{
            transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`,
          }}
        >
          <svg
            className="diagram-arrow"
            width={width}
            height={height}
            aria-hidden="true"
          >
            {arrows.map(({ e, route, label }, index) => {
              const color = palette[e.color ?? "blue"];
              const flow = e.type === "flow";
              return (
                <g
                  key={e.id}
                  visibility={elapsed < e.at ? "hidden" : "visible"}
                >
                  <defs>
                    <marker
                      id={marker + index}
                      markerWidth="6"
                      markerHeight="6"
                      refX="6"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0 0 L6 3 L0 6 Z" fill={color} />
                    </marker>
                  </defs>
                  <motion.path
                    d={route.d}
                    stroke={color}
                    strokeWidth={unit * (flow ? 0.4 : 0.55)}
                    strokeOpacity={flow ? 0.3 : 1}
                    strokeDasharray={flow ? `${unit * 1.2} ${unit * 1.2}` : undefined}
                    strokeLinecap={flow ? "round" : undefined}
                    fill="none"
                    markerEnd={flow ? undefined : `url(#${marker + index})`}
                    initial={false}
                    animate={{ pathLength: elapsed < e.at ? 0 : 1 }}
                    transition={{ duration: reduced ? 0 : 0.35 }}
                  />
                  {flow && (
                    <FlowDots
                      path={route.d}
                      color={color}
                      count={e.count}
                      unit={unit}
                      still={Boolean(reduced)}
                      at={(t) => route.point(t)}
                    />
                  )}
                  {label && (
                    <foreignObject
                      x={label.x}
                      y={label.y}
                      width={label.w}
                      height={label.h}
                    >
                      <div
                        className={flow ? "arrow-label flow-pill" : "arrow-label"}
                        data-arrow-label={e.id}
                        style={{ color }}
                      >
                        {e.label}
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>
          {frame.elements.map((e) => {
            if (e.type === "arrow" || e.type === "flow") return null;
            const bubbleText = e.type === "bubble" ? bubbleContent(frame, e, elapsed) : null;
            const color = palette[e.color ?? "blue"],
              visible = e.type === "bubble" ? bubbleText !== null : elapsed >= e.at;
            if (e.type === "highlight") {
              const r = resolve(e.target);
              return (
                <motion.div
                  key={e.id}
                  className="highlight"
                  style={{
                    left: r.x,
                    top: r.y,
                    width: r.w,
                    height: r.h,
                    borderColor: color,
                    visibility: visible ? "visible" : "hidden",
                  }}
                  animate={
                    reduced ? { opacity: 1 } : { opacity: [0.3, 1, 0.3] }
                  }
                  transition={{ repeat: reduced ? 0 : Infinity, duration: 1.1 }}
                />
              );
            }
            const side = e.type === "bubble"
                ? frame.cast.findIndex((c) => c.id === e.speaker) % 2 === 1
                  ? "right"
                  : "left"
                : "left",
              speaker = e.type === "bubble" ? frame.cast.find((c) => c.id === e.speaker) : undefined,
              tone = e.type === "bubble" && !e.color && speaker ? palette[speaker.color]
                : e.type === "alert" && !e.color ? palette[e.level === "warning" ? "orange" : "red"]
                : color;
            const w0 = e.w ?? DEFAULT_WIDTH[e.type] ?? 100 - ("x" in e ? (e.x ?? 0) : 0);
            const x0 = e.type === "bubble" && e.x === undefined
              ? side === "right" ? 100 - w0 - 5 : 5
              : (e as { x: number }).x;
            return (
              <motion.div
                key={e.id}
                className={`element element-${e.type}${e.type === "bubble" ? ` side-${side}` : ""}`}
                data-element-id={e.id}
                aria-hidden={!visible}
                initial={false}
                animate={{
                  opacity: visible ? 1 : 0,
                  scale: !visible && e.enter === "pop" && !reduced ? 0.75 : 1,
                  y: !visible && e.enter === "slide-up" && !reduced ? 15 : 0,
                }}
                transition={{ duration: reduced ? 0 : 0.23 }}
                style={{
                  left: `${x0}%`,
                  top: `${e.y}%`,
                  width: `${Math.max(1, Math.min(w0, 100 - x0))}%`,
                  minHeight:
                    e.h && e.type !== "code" && e.type !== "list"
                      ? `${e.h}%`
                      : undefined,
                  color: tone,
                  borderColor: tone,
                  backgroundColor:
                    e.type === "box"
                      ? `color-mix(in srgb, ${color} 12%, #121212)`
                      : undefined,
                }}
              >
                {e.type === "code" ? (
                  <>
                    <small>{e.lang}</small>
                    <Code text={e.text} />
                  </>
                ) : e.type === "list" ? (
                  <ul>
                    {e.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                ) : e.type === "node" ? (
                  <>
                    <NodeGlyph icon={e.icon} />
                    <span className="node-label">{e.label}</span>
                  </>
                ) : e.type === "bubble" ? (
                  <>
                    {speaker && <span className="bubble-name">{speaker.name}</span>}
                    <span className="bubble-text">{bubbleText ?? e.text}</span>
                  </>
                ) : e.type === "alert" ? (
                  <div className="alert-shake">
                    <span className="alert-title">
                      <i />
                      {e.title ?? (e.level === "warning" ? "Warning" : "Incident")}
                    </span>
                    <span className="alert-text">{e.text}</span>
                  </div>
                ) : e.type === "metric" ? (
                  <>
                    <span className="metric-value">
                      {formatMetric(
                        e.value,
                        reduced ? 1 : (elapsed - e.at) / METRIC_COUNT_MS,
                      )}
                    </span>
                    <span className="metric-label">{e.label}</span>
                  </>
                ) : (
                  e.text
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      <Captions frame={frame} elapsed={elapsed} />
    </div>
  );
}

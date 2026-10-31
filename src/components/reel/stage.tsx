"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReelElement } from "@/lib/reel-schema";
import { center, type Frame } from "./timeline";
const palette = {
  blue: "#78b7ff",
  green: "#76e4b4",
  orange: "#ffb56c",
  red: "#ff7d93",
  purple: "#c5a1ff",
  gray: "#b6bfcd",
};
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
function Element({
  element: e,
  elements,
  elapsed,
  marker,
  bounds,
}: {
  element: ReelElement;
  elements: ReelElement[];
  elapsed: number;
  marker: string;
  bounds: Record<string, { x: number; y: number; w: number; h: number }>;
}) {
  const reduced = useReducedMotion();
  const position = (id: string) =>
    bounds[id]
      ? {
          x: bounds[id].x + bounds[id].w / 2,
          y: bounds[id].y + bounds[id].h / 2,
        }
      : center(id, elements);
  if (elapsed < e.at) return null;
  const color = palette[e.color ?? "blue"];
  if (e.type === "arrow") {
    const a = position(e.from),
      b = position(e.to);
    return (
      <svg className="diagram-arrow" viewBox="0 0 100 177.778">
        <defs>
          <marker
            id={marker + e.id}
            markerWidth="5"
            markerHeight="5"
            refX="4"
            refY="2.5"
            orient="auto"
          >
            <path d="M0 0 L5 2.5 L0 5" fill={color} />
          </marker>
        </defs>
        <motion.path
          d={`M${a.x} ${a.y * 1.77778} L${b.x} ${b.y * 1.77778}`}
          stroke={color}
          strokeWidth=".6"
          fill="none"
          markerEnd={`url(#${marker + e.id})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.35 }}
        />
        {e.label && (
          <text
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) * 0.88889 - 2}
            textAnchor="middle"
            fill={color}
            fontSize="3"
          >
            {e.label}
          </text>
        )}
      </svg>
    );
  }
  if (e.type === "highlight") {
    const target = elements.find((item) => item.id === e.target),
      pos = position(e.target);
    return (
      <motion.div
        className="highlight"
        style={{
          left: `${bounds[e.target]?.x ?? (target && "x" in target ? target.x : pos.x - 10)}%`,
          top: `${bounds[e.target]?.y ?? (target && "y" in target ? target.y : pos.y - 5)}%`,
          width: `${bounds[e.target]?.w ?? (target && "w" in target ? (target.w ?? 30) : 20)}%`,
          height: `${bounds[e.target]?.h ?? (target && "h" in target ? (target.h ?? 8) : 10)}%`,
          borderColor: color,
        }}
        animate={
          reduced
            ? { opacity: 1 }
            : { opacity: [0.3, 1, 0.3], scale: [1, 1.05, 1] }
        }
        transition={{ repeat: reduced ? 0 : Infinity, duration: 1.1 }}
      />
    );
  }
  const initial =
    e.enter === "pop"
      ? { opacity: 0, scale: 0.75 }
      : e.enter === "slide-up"
        ? { opacity: 0, y: 15 }
        : { opacity: 0 };
  return (
    <motion.div
      className={`element element-${e.type}`}
      data-element-id={e.id}
      initial={initial}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.23 }}
      style={{
        left: `${e.x}%`,
        top: `${e.y}%`,
        width: `${Math.min(e.w ?? 100 - e.x, 100 - e.x)}%`,
        ...(e.h ? { height: `${e.h}%` } : {}),
        color,
        borderColor: color,
        backgroundColor: e.type === "box" ? `${color}18` : undefined,
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
      ) : (
        e.text
      )}
    </motion.div>
  );
}
export function Stage({ frame, elapsed }: { frame: Frame; elapsed: number }) {
  const marker = useId().replace(/:/g, "");
  const stage = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});
  const visibleCount = frame.elements.filter((e) => e.at <= elapsed).length;
  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    const measure = () => {
      if (!root.clientWidth || !root.clientHeight) return;
      const next: typeof bounds = {};
      root
        .querySelectorAll<HTMLElement>("[data-element-id]")
        .forEach((node) => {
          next[node.dataset.elementId!] = {
            x: (node.offsetLeft / root.clientWidth) * 100,
            y: (node.offsetTop / root.clientHeight) * 100,
            w: (node.offsetWidth / root.clientWidth) * 100,
            h: (node.offsetHeight / root.clientHeight) * 100,
          };
        });
      setBounds((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root
      .querySelectorAll("[data-element-id]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [frame, visibleCount]);
  const current = Math.max(
    0,
    frame.words.findIndex(
      (w, i) =>
        elapsed >= w.start_ms &&
        (i === frame.words.length - 1 || elapsed < frame.words[i + 1].start_ms),
    ),
  );
  const start = Math.floor(current / 7) * 7;
  return (
    <>
      <div className="stage" ref={stage}>
        {frame.card ? (
          <motion.div
            className={`hook-card ${frame.card}`}
            initial={{ scale: 0.86, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.22 }}
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
              <span className="completion">✓ Concept unlocked</span>
            )}
          </motion.div>
        ) : (
          frame.elements.map((e) => (
            <Element
              key={e.id}
              element={e}
              elements={frame.elements}
              elapsed={elapsed}
              marker={marker}
              bounds={bounds}
            />
          ))
        )}
      </div>
      <div className="captions" aria-label={frame.caption}>
        {frame.words.slice(start, start + 7).map((word, i) => (
          <span
            key={start + i}
            className={start + i === current ? "spoken" : ""}
          >
            {word.w}{" "}
          </span>
        ))}
        {!frame.words.length && frame.caption}
      </div>
    </>
  );
}

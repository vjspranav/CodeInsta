import { creatorMark } from "../../packages/shared/src/creator-marks";

/**
 * Round tile with the creator's brand mark (inline SVG), or initials for an unknown creator.
 * Without `size` the tile takes its dimensions from the surrounding CSS (.avatar rules).
 * Marks: simple-icons v15.0.0, CC0 (see packages/shared/src/creator-marks.ts).
 */
export function CreatorAvatar({ creatorId, size }: { creatorId?: string; size?: number }) {
  const mark = creatorMark(creatorId);
  const box = size ? { width: size, height: size } : undefined;
  if (!mark)
    return (
      <span
        className="avatar creator-avatar"
        role="img"
        aria-label={creatorId ?? "Creator"}
        style={size ? { ...box, fontSize: Math.round(size * 0.45) } : undefined}
      >
        {(creatorId ?? "?").slice(0, 1).toUpperCase()}
      </span>
    );
  return (
    <span
      className="avatar creator-avatar"
      role="img"
      aria-label={mark.name}
      style={{ ...box, background: mark.tile }}
    >
      <svg viewBox="0 0 24 24" width="58%" height="58%" fill={mark.color} aria-hidden="true">
        <path d={mark.path} />
      </svg>
    </span>
  );
}

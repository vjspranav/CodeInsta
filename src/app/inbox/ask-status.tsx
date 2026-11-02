"use client";
import Link from "next/link";
import { CircleCheck, Clock, Film, MessageCircle, SquarePlay } from "lucide-react";
import { askStatusLabel, shortTime, type Ask } from "./asks";
import styles from "./inbox.module.css";

/** One question the member asked: the reel it was about, the question, when, and where the answer is. */
export function AskStatus({
  ask,
  creatorName,
  onOpenAnswer,
  compact = false,
}: {
  ask: Ask;
  creatorName: string;
  /** Opens the answer DM (omit inside the thread, where the answer sits right below). */
  onOpenAnswer?: (ask: Ask) => void;
  /** Clamp the question to a few lines (thread list). */
  compact?: boolean;
}) {
  const answered = ask.status === "answered";
  return (
    <article className={styles.ask} data-testid={`ask-status-${ask.id}`}>
      <div className={styles.top}>
        {ask.reelId ? (
          <Link className={styles.reel} href={`/reel/${ask.reelId}`}>
            <Film size={16} aria-hidden />
            <span>{ask.reelTitle ?? "Reel"}</span>
          </Link>
        ) : (
          <span className={styles.reel}>Question</span>
        )}
        <time dateTime={ask.createdAt}>{shortTime(ask.createdAt)}</time>
      </div>
      <p className={compact ? `${styles.body} ${styles.clamp}` : styles.body}>{ask.body}</p>
      <div className={styles.statusRow}>
        <span className={answered ? `${styles.status} ${styles.answered}` : styles.status}>
          {answered ? <CircleCheck size={16} aria-hidden /> : <Clock size={16} aria-hidden />}
          {askStatusLabel(ask, creatorName)}
        </span>
        {ask.answerReel ? (
          <Link className={styles.action} href={`/reel/${ask.answerReel.id}`} aria-label={`Watch answer reel: ${ask.answerReel.title}`}>
            <SquarePlay size={16} aria-hidden />
            Watch answer reel
          </Link>
        ) : ask.answerMessageId && onOpenAnswer ? (
          <button type="button" className={styles.action} onClick={() => onOpenAnswer(ask)}>
            <MessageCircle size={16} aria-hidden />
            Read answer
          </button>
        ) : null}
      </div>
    </article>
  );
}

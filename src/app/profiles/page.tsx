"use client";
import { Flame } from "lucide-react";
import { Profiles } from "@/components/catalog";
import { streakLabel, useData } from "@/components/data";

export default function Page() {
  const { streak } = useData();
  const label = streakLabel(streak);
  return (
    <>
      {label && (
        <p className="profile-streak">
          <Flame size={16} strokeWidth={1.75} aria-hidden />
          <span>{label}</span>
        </p>
      )}
      <Profiles />
    </>
  );
}

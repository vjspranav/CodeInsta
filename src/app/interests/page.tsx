"use client";
import { MyInterests, TopicRequests } from "@/components/interests";
import { useData, LoadState } from "@/components/data";
export default function InterestsPage() {
  const { loading, error } = useData();
  if (loading || error) return <LoadState />;
  return <main className="content-page"><h1>Interests</h1><MyInterests /><TopicRequests /></main>;
}

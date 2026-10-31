import { Feed } from "@/components/reel/feed";
export default async function ReelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Feed reelId={id} />;
}

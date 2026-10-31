import { Profiles } from "@/components/catalog";
export default async function Page({
  params,
}: {
  params: Promise<{ creator: string }>;
}) {
  const { creator } = await params;
  return <Profiles creatorId={creator} />;
}

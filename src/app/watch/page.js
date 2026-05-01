import WatchClient from "./WatchClient";

export default async function WatchPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const roomId = resolvedSearchParams?.room || null;

  return <WatchClient roomId={roomId} />;
}

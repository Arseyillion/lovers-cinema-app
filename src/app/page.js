"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const createRoom = () => {
    const roomId = crypto.randomUUID(); // unique session
    router.push(`/watch?room=${roomId}`);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Start Watch Session</h1>

      <button onClick={createRoom}>
        Create Watch Link
      </button>
    </div>
  );
}
import { messageFor } from "@/lib/messages";

type Params = Record<string, string | string[] | undefined>;

/** Renders ?notice=… or ?error=… from a fixed message table. */
export function Flash({ searchParams }: { searchParams: Params }) {
  const message = messageFor(searchParams.error) ?? messageFor(searchParams.notice);
  if (!message) return null;
  return (
    <p className={`flash flash-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
      {message.text}
    </p>
  );
}

// Local Supabase catches outgoing auth email with Mailpit instead of sending it —
// see supabase/config.toml's `[local_smtp]` (port 54324, same port for both the
// web UI and this JSON API).
const MAILPIT_URL = 'http://127.0.0.1:54324';

type MailpitMessageSummary = { ID: string; To: { Address: string }[] };
type MailpitMessage = { Text: string };

async function findMessageTo(email: string): Promise<MailpitMessageSummary | undefined> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages`);
  const { messages } = (await res.json()) as { messages: MailpitMessageSummary[] };
  return messages.find((m) => m.To.some((to) => to.Address === email));
}

// Polls Mailpit until the most recent email to `email` shows up, then returns
// the first http(s) link found in its plaintext body (the reset/verify link).
export async function waitForEmailLink(email: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const summary = await findMessageTo(email);
    if (summary) {
      const res = await fetch(`${MAILPIT_URL}/api/v1/message/${summary.ID}`);
      const message = (await res.json()) as MailpitMessage;
      const match = message.Text.match(/(https?:\/\/\S+)/);
      if (match) return match[1].replace(/[)\s]+$/, '');
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`No email arrived for ${email} within ${timeoutMs}ms`);
}

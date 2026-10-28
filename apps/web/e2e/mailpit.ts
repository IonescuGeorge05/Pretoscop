// Mailpit (http://localhost:8025) is shared by every test run on this machine: always filter by
// recipient and send time, never delete other people's mail.
const MAILPIT = process.env.MAILPIT_API ?? 'http://localhost:8025/api/v1';

export interface MailSummary {
  ID: string;
  Created: string;
  Subject: string;
}

export interface Mail extends MailSummary {
  Text: string;
  HTML: string;
}

/** Messages to `email` sent at or after `since` (ms), newest first. */
export async function mailsTo(email: string, since: number): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=50`);
  const list = (await res.json()) as { messages: MailSummary[] };
  return list.messages.filter((m) => Date.parse(m.Created) >= since - 2000);
}

/** Waits for the newest message to `email` since `since` whose subject matches. */
export async function latestMail(email: string, since: number, subject: RegExp, timeoutMs = 15_000): Promise<Mail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = (await mailsTo(email, since)).find((m) => subject.test(m.Subject));
    if (hit) return (await (await fetch(`${MAILPIT}/message/${hit.ID}`)).json()) as Mail;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`no email "${subject}" to ${email}`);
}

export async function mailHeaders(id: string): Promise<Record<string, string[]>> {
  return (await (await fetch(`${MAILPIT}/message/${id}/headers`)).json()) as Record<string, string[]>;
}

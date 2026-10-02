import { useState } from "react";
import { Send } from "lucide-react";
import type { ContactRequest, ContactResult } from "@shared/pages/public-core";
import { isEmail } from "@shared/validate";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { CONTACT_TOPICS } from "./topics";

export function ContactForm({ initialTopic }: { initialTopic: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>(initialTopic ?? CONTACT_TOPICS[0]);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real visitors never fill this
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) return setError("Please enter your name.");
    if (!isEmail(email)) return setError("Please enter a valid email address.");
    if (message.trim().length < 10) return setError("Please add a few more details to your message (at least 10 characters).");

    setBusy(true);
    try {
      const request: ContactRequest = { name, email, topic, message, website };
      await api.post<ContactResult>("/api/contact", request);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Notice tone="success" title="Message sent">
        Thanks — we&apos;ve got your message and usually reply within 24 hours. We&apos;ll write back to {email}.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Full name" htmlFor="contact-name">
        <Input
          id="contact-name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          disabled={busy}
        />
      </Field>
      <Field label="Email" htmlFor="contact-email" hint="We'll reply here.">
        <Input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={busy}
        />
      </Field>
      <Field label="What's this about?" htmlFor="contact-topic">
        <Select id="contact-topic" name="topic" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={busy}>
          {CONTACT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Message" htmlFor="contact-message">
        <Textarea
          id="contact-message"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you need — as much detail as helps."
          required
          minLength={10}
          rows={5}
          disabled={busy}
        />
      </Field>

      {/* Honeypot — hidden from real visitors, catches simple bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {!busy && <Send className="size-4" aria-hidden />}
        {busy ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}

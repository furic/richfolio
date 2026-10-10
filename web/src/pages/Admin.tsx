import { useCallback, useEffect, useState, type FormEvent } from "react";
import { InviteError, listInvites, sendInvite, type Invite } from "../db";
import { friendlyError } from "../lib/errors";

export function Admin() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setInvites(await listInvites());
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const target = email.trim();
    setBusy(true);
    setError(null);
    setSentTo(null);
    try {
      await sendInvite(target);
      setSentTo(target);
      setEmail("");
    } catch (err) {
      setError(err instanceof InviteError ? err.message : friendlyError(err));
    } finally {
      setBusy(false);
      await reload();
    }
  }

  return (
    <>
      <h1>Admin</h1>
      <section className="card">
        <h2>Invite someone</h2>
        <form className="row-form" onSubmit={invite}>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button disabled={busy}>{busy ? "Sending…" : "Send invite"}</button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {sentTo && (
          <p className="ok" role="status">
            Invite sent to {sentTo}.
          </p>
        )}
      </section>
      <section className="card">
        <h2>Invites</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Invited</th>
              <th scope="col">Accepted</th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No invites yet.
                </td>
              </tr>
            )}
            {invites.map((i) => (
              <tr key={i.email}>
                <td>{i.email}</td>
                <td>{new Date(i.invited_at).toLocaleDateString()}</td>
                <td>{i.accepted_at ? new Date(i.accepted_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

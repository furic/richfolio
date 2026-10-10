import type { TickerStatus } from "../db";

export function TickerBadge({ status }: { status: TickerStatus | undefined }) {
  if (!status) {
    return (
      <span className="badge muted" title="Not checked yet">
        unchecked
      </span>
    );
  }
  if (status.last_fetch_failed_at) {
    return (
      <span
        className="badge bad"
        title={`The daily run could not fetch this since ${new Date(status.last_fetch_failed_at).toLocaleDateString()}`}
      >
        fetch failed
      </span>
    );
  }
  if (!status.verified) {
    return (
      <span
        className="badge warn"
        title="The data source couldn't be reached to confirm this ticker. It will be checked again."
      >
        unverified
      </span>
    );
  }
  const detail = [status.name, status.exchange, status.quote_currency].filter(Boolean).join(" · ");
  return (
    <span className="badge good" title={detail}>
      ✓
    </span>
  );
}

import { Link } from "react-router-dom";
import { Footer } from "../components/Layout";

export function Privacy() {
  return (
    <div className="centered">
      <article className="card">
        <h1>Privacy</h1>
        <p>
          Richfolio is a small invite-only service run by Richard Fu. This is what it keeps and why.
        </p>
        <h2>What is stored</h2>
        <ul>
          <li>Your email address and name, to sign you in and send your briefs.</li>
          <li>
            Your target allocation, holdings and transactions, watchlist and alert settings, to
            produce your briefs.
          </li>
        </ul>
        <h2>Where, and who can see it</h2>
        <p>
          Data lives in a Supabase database in Sydney. Other users cannot see any of it; the
          database enforces that on every request. As the operator, Richard has administrative
          access to the database.
        </p>
        <h2>What it is not used for</h2>
        <p>
          It is never sold or shared. It is not used to train any model. If that ever changes, it
          will be opt-in, off by default, and asked for explicitly.
        </p>
        <h2>Deleting your data</h2>
        <p>Ask Richard and your account and everything attached to it will be deleted.</p>
        <p>
          <Link to="/login">Back</Link>
        </p>
      </article>
      <Footer />
    </div>
  );
}

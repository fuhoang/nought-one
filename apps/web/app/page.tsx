import Link from 'next/link';
export default function Home() {
  return <main className="account-shell home-shell">
    <span className="account-brand">nought.one</span>
    <section className="home-intro">
      <p className="eyebrow">LESS DISTANCE. MORE CONNECTION.</p>
      <h1>Your introduction.<br />Always with you.</h1>
      <p>Your details, your links, your next connection.<br />Together in one digital business card.</p>
      <div className="home-actions"><Link className="button button-primary" href="/register">Create an account</Link><Link className="button button-secondary" href="/login">Sign in</Link></div>
    </section>
    <footer className="account-footer">A simple way to stay connected.</footer>
  </main>;
}

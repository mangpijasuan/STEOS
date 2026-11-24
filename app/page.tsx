import { Icon } from "./icons";
import { PlatformFooter } from "./ui";
import "./ds.css";

export default function Home() {
  return (
    <div className="ds">
      <header className="topbar">
        <div className="container topbar-inner">
          <span className="brandmark">
            <span className="logo">S</span> STOS
          </span>
          <span className="grow" />
          <a className="btn btn-sm" href="/login">Staff sign in</a>
        </div>
      </header>
      <main className="container">
        <section className="hero">
          <h1>Direct ordering for independent restaurants</h1>
          <p>Take pickup orders on your own website, keep the customer, and keep more of every sale. Built for the kitchen line, not the boardroom.</p>
          <a className="btn btn-primary btn-lg" href="/login">Sign in to your restaurant</a>
        </section>
        <section className="features" aria-label="What you get">
          {[
            { icon: "store", title: "Your own storefront", body: "A fast menu page customers can order from on any phone, with pickup times that respect your hours." },
            { icon: "chef", title: "A kitchen screen that works", body: "New orders ring, show a countdown, and take one tap to accept. Built for a tablet on the pass." },
            { icon: "chart", title: "Honest numbers", body: "Sales, tax, tips and fees in one report. You see what you keep, down to the cent." },
          ].map((f) => (
            <div key={f.title} className="card stack" style={{ "--gap": "8px" } as React.CSSProperties}>
              <span className="logo" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><Icon name={f.icon as "store"} size={18} /></span>
              <h3>{f.title}</h3>
              <p className="muted small">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}

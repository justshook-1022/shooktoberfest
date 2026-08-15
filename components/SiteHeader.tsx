import HeaderAccount from "./HeaderAccount";
import Link from "next/link";

export function SiteHeader({ active }: { active?: string }) {
  const links = [
    ["Leaderboard", "/leaderboard"],
    ["Tee times", "/tee-times"],
    ["Photos", "/photos"],
    ["Score", "/score"],
  ];

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Shooktoberfest home">
        <span className="brand-mark">S</span><span>SHOOKTOBERFEST</span>
      </Link>
      <nav aria-label="Primary navigation">
        {links.map(([label, href]) => <a key={href} className={active === href ? "active" : ""} href={href}>{label}</a>)}
      </nav>
      <HeaderAccount />
    </header>
  );
}

export function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {copy ? <p>{copy}</p> : null}
    </div>
  );
}

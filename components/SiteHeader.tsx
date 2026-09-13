import Link from "next/link";
import HeaderAccount from "./HeaderAccount";
import PopoutMenu from "./PopoutMenu";

export function SiteHeader({ active }: { active?: string }) {
  return (
    <header className="site-header">
      <div className="header-actions header-actions-left">
        <PopoutMenu activePath={active} />
        <Link className="header-icon-link" href="/leaderboard" aria-label="View leaderboard">
          <svg className="leaderboard-icon" viewBox="0 0 36 36" aria-hidden="true">
            <path d="M5 7.5h26v17H5z" />
            <path d="M5 12.5h26M5 19.5h26M11 24.5v4h14v-4M18 28.5v3" />
          </svg>
        </Link>
      </div>
      <Link className="brand" href="/" aria-label="Shooktoberfest home">
        Shooktoberfest
      </Link>
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

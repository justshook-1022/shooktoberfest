import { PageIntro, SiteHeader } from "../../components/SiteHeader";
import AdminDashboard from "./AdminDashboard";

export default function AdminPage() {
  return <main className="admin-page"><SiteHeader /><div className="page-shell wide"><PageIntro eyebrow="Tournament control" title="Admin." copy="One place to fill the field, run the draw, open scoring, and settle up." /><AdminDashboard /></div></main>;
}

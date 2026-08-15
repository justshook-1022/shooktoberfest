import { SiteHeader } from "../../components/SiteHeader";
import ScoreEntry from "./ScoreEntry";

export default function ScorePage() {
  return <main className="score-page"><SiteHeader active="/score" /><div className="page-shell score-shell"><ScoreEntry /></div></main>;
}

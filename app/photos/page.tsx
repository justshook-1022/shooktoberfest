import { PageIntro, SiteHeader } from "../../components/SiteHeader";
import PhotoWall from "./PhotoWall";

export default function PhotosPage() {
  return <main><SiteHeader active="/photos" /><div className="page-shell wide"><PageIntro eyebrow="Event photos" title="Receipts." copy="Photos, reactions, and carefully documented bad decisions from the day." /><PhotoWall /></div></main>;
}

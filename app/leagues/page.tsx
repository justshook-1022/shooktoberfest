import type { Metadata } from 'next';
import LeagueApp from './LeagueApp';
export const metadata:Metadata={title:'League Starter · Your next great golf season',description:'Set up your league, build a season, and keep the golf moving.',robots:{index:false,follow:false},openGraph:{title:'League Starter',description:'A simpler way to run your golf league.',images:[]},twitter:{card:'summary',title:'League Starter',images:[]}};
export default function Page(){return <LeagueApp/>;}

import type { Assignment, Result } from './engine';
export type League = { id:string; owner_id:string; organization_id:string; name:string; course:string; season:string; timezone:string; holes:number; team_size:number; allowance:string; season_fee_cents:number; points:number[]; prizes:number[]; description:string; status:string; created_at:string };
export type RosterPlayer={id:string;league_id:string;name:string;email:string;handicap:number;active:boolean};
export type Round={id:string;league_id:string;name:string;round_date:string;first_time:string;interval_minutes:number;status:string;attendance:Record<string,boolean>;assignments:Assignment[];results:Result[];version:number};
export type Ledger={id:string;league_id:string;player_id:string;kind:'dues'|'payout';amount_cents:number;note:string;created_at:string};
export type Bundle={leagues:League[];players:RosterPlayer[];rounds:Round[];ledger:Ledger[];email:string};

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase/server';
import { makePairings, calculateResults, scheduleDates } from '../../../lib/leagues/engine';
import type { Assignment } from '../../../lib/leagues/engine';
export const dynamic='force-dynamic';
function text(v:unknown,name:string,max=160){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new Error(`${name} is required (maximum ${max} characters).`);return v.trim();}
function num(v:unknown,name:string,min=0,max=1000000){const n=Number(v);if(v===''||v===null||!Number.isFinite(n)||n<min||n>max)throw new Error(`${name} must be between ${min} and ${max}.`);return n;}
function integer(v:unknown,name:string,min=0,max=1000000){const n=num(v,name,min,max);if(!Number.isInteger(n))throw new Error(`${name} must be a whole number.`);return n;}
function uuid(v:unknown){const id=text(v,'Record ID',36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new Error('Invalid record ID.');return id;}
function list(v:unknown,name:string,cents=false){if(!Array.isArray(v)||v.length>50||v.length<1)throw new Error(`${name} requires 1–50 positions.`);return v.map(n=>cents?integer(n,name,0,10000000):num(n,name,0,10000));}
function check(error:{message:string}|null){if(error){console.error('League database operation failed:',error.message);throw new Error('The change could not be saved. Refresh and try again.');}}
async function session(){const db=await getServerClient();if(!db)return null;const {data:{user}}=await db.auth.getUser();return user?{db,user}:null;}
export async function GET(request:Request){
 const ctx=await session();if(!ctx)return NextResponse.json({error:'Please sign in.'},{status:401});
 const {db,user}=ctx;
 const {data:leagues,error}=await db.from('ls_leagues').select('*').order('created_at',{ascending:false});
 if(error)return NextResponse.json({error:'League services are not ready. Please try again shortly.'},{status:503});
 const wanted=new URL(request.url).searchParams.get('league');const id=(leagues||[]).find(l=>l.id===wanted)?.id||(leagues||[])[0]?.id;
 if(!id)return NextResponse.json({leagues:[],players:[],rounds:[],ledger:[],email:user.email});
 const rows=await Promise.all([db.from('ls_players').select('*').eq('league_id',id).order('name'),db.from('ls_rounds').select('*').eq('league_id',id).order('round_date'),db.from('ls_ledger').select('*').eq('league_id',id).order('created_at',{ascending:false})]);
 if(rows.some(r=>r.error))return NextResponse.json({error:'Could not load league data. Try again.'},{status:503});
 return NextResponse.json({leagues,players:rows[0].data,rounds:rows[1].data,ledger:rows[2].data,email:user.email,selected:id},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
 const ctx=await session();if(!ctx)return NextResponse.json({error:'Please sign in again.'},{status:401});
 const {db,user}=ctx;
 try {
  const raw=await request.text();if(raw.length>150000)throw new Error('This request is too large. Import a smaller roster.');
  const b=JSON.parse(raw);const command=b.command;
  if(command==='createLeague'){
   const name=text(b.name,'League name',100);const course=text(b.course,'Course',140);const season=text(b.season,'Season',40);
   const size=integer(b.team_size,'Team size',1,4);if(![1,2,4].includes(size))throw new Error('Choose individual, two-person, or four-person play.');
   const holes=integer(b.holes,'Holes',9,18);if(![9,18].includes(holes))throw new Error('Choose 9 or 18 holes.');
   const zone=text(b.timezone,'Time zone',80);try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{throw new Error('Choose a valid time zone.');}
   const allowance=b.allowance==='weighted'?'weighted':'average';const fee=integer(b.season_fee_cents,'Season dues',0,10000000);
   const points=list(b.points,'Points');const prizes=list(b.prizes,'Prizes',true);
   const {data:org,error:orgErr}=await db.from('ls_organizations').upsert({owner_id:user.id,name:'My golf workspace'},{onConflict:'owner_id'}).select('id').single();check(orgErr);
   const {data,error}=await db.from('ls_leagues').insert({owner_id:user.id,organization_id:org!.id,name,course,season,team_size:size,holes,timezone:zone,allowance,season_fee_cents:fee,points,prizes}).select('id').single();check(error);
   return NextResponse.json({ok:true,leagueId:data!.id});
  }
  if(command==='feedback'){
   const {error}=await db.from('ls_feedback').insert({owner_id:user.id,body:text(b.body,'Feedback',4000)});check(error);return NextResponse.json({ok:true});
  }
  const leagueId=uuid(b.leagueId);const {data:league,error:le}=await db.from('ls_leagues').select('*').eq('id',leagueId).single();
  if(le||!league)return NextResponse.json({error:'League not found or access denied.'},{status:404});
  if(command==='addPlayers'){
   if(!Array.isArray(b.players)||!b.players.length||b.players.length>100)throw new Error('Add 1–100 players at a time.');
   const {count,error:ce}=await db.from('ls_players').select('id',{count:'exact',head:true}).eq('league_id',leagueId);check(ce);
   if((count||0)+b.players.length>500)throw new Error('This beta supports 500 roster entries per league.');
   const players=b.players.map((p:{name:unknown;email:unknown;handicap:unknown})=>{
    const email=typeof p.email==='string'?p.email.trim().toLowerCase():'';if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))throw new Error('One of the email addresses is invalid.');
    return {owner_id:user.id,league_id:leagueId,name:text(p.name,'Player name',100),email,handicap:num(p.handicap,'Playing handicap',-10,72)};
   });const {error}=await db.from('ls_players').insert(players);check(error);
  } else if(command==='editPlayer') {
   const id=uuid(b.playerId);const {error}=await db.from('ls_players').update({name:text(b.name,'Name',100),handicap:num(b.handicap,'Playing handicap',-10,72),active:!!b.active}).eq('league_id',leagueId).eq('id',id);check(error);
  } else if(command==='createRounds') {
   const dates=scheduleDates(b.start,integer(b.count,'Number of rounds',1,52),integer(b.interval,'Repeat interval',7,28));
   const time=text(b.first_time,'First tee time',5);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Choose a valid tee time.');
   const interval=integer(b.interval_minutes,'Tee interval',5,30);
   const rows=dates.map((date,i)=>({owner_id:user.id,league_id:leagueId,name:`Round ${i+1}`,round_date:date,first_time:time,interval_minutes:interval}));
   const {error}=await db.from('ls_rounds').insert(rows);if(error?.code==='23505')throw new Error('A round already exists on one of those dates. Choose a different start date or fewer rounds.');check(error);
  } else if(command==='ledger') {
   const playerId=uuid(b.playerId);if(!['dues','payout'].includes(b.kind))throw new Error('Choose dues or payout.');
   const {error}=await db.from('ls_ledger').insert({owner_id:user.id,league_id:leagueId,player_id:playerId,kind:b.kind,amount_cents:integer(b.amount_cents,'Amount',1,10000000),note:typeof b.note==='string'?b.note.trim().slice(0,300):''});check(error);
  } else if(command==='settings') {
   const {count}=await db.from('ls_rounds').select('id',{head:true,count:'exact'}).eq('league_id',leagueId).neq('status','draft');
   if(count)throw new Error('Scoring rules are locked once a round is published. Create a new league for different rules.');
   const {error}=await db.from('ls_leagues').update({name:text(b.name,'League name',100),course:text(b.course,'Course',140),description:typeof b.description==='string'?b.description.slice(0,2000):'',points:list(b.points,'Points'),prizes:list(b.prizes,'Prizes',true),season_fee_cents:integer(b.season_fee_cents,'Dues',0,10000000)}).eq('id',leagueId);check(error);
  } else {
   const roundId=uuid(b.roundId);const {data:round,error:re}=await db.from('ls_rounds').select('*').eq('id',roundId).eq('league_id',leagueId).single();
   if(re||!round)throw new Error('Round not found.');
   if(round.version!==b.version)throw new Error('This round changed in another session. Refresh before editing.');
   const patch:Record<string,unknown>={version:round.version+1};
   if(command==='attendance'){
    if(round.status!=='draft')throw new Error('Return this round to draft before changing attendance.');
    const playerId=uuid(b.playerId);const {data:p}=await db.from('ls_players').select('id').eq('id',playerId).eq('league_id',leagueId).single();if(!p)throw new Error('Player not found.');
    patch.attendance={...round.attendance,[playerId]:!!b.available};patch.assignments=[];
   } else if(command==='draw') {
    if(round.status!=='draft')throw new Error('Only draft rounds can be paired.');
    const [pr,hr]=await Promise.all([db.from('ls_players').select('*').eq('league_id',leagueId).eq('active',true),db.from('ls_rounds').select('assignments').eq('league_id',leagueId).lt('round_date',round.round_date).neq('status','cancelled')]);check(pr.error);check(hr.error);
    const eligible=(pr.data||[]).filter(p=>round.attendance[p.id]!==false);
    patch.assignments=makePairings(eligible,league.team_size,round.first_time,round.interval_minutes,(hr.data||[]).map(r=>r.assignments as Assignment[]));
   } else if(command==='publish') {
    if(round.status!=='draft'||!round.assignments.length)throw new Error('Generate pairings for this draft first.');patch.status='published';
   } else if(command==='unpublish') {
    if(round.status!=='published')throw new Error('Only published, unscored rounds can return to draft.');patch.status='draft';
   } else if(command==='cancel') {
    if(round.status==='completed')throw new Error('Completed rounds cannot be cancelled.');patch.status=round.status==='cancelled'?'draft':'cancelled';patch.assignments=[];
   } else if(command==='scores') {
    if(round.status!=='published')throw new Error('Publish the pairings before recording results. Completed results are locked.');
    if(!Array.isArray(b.scores))throw new Error('Enter scores for all teams.');
    patch.results=calculateResults(round.assignments,b.scores,league.allowance,league.points,league.prizes);patch.status='completed';
   } else throw new Error('Unknown action.');
   const {data:updated,error}=await db.from('ls_rounds').update(patch).eq('id',roundId).eq('league_id',leagueId).eq('version',round.version).select('id');check(error);if(!updated?.length)throw new Error('Another change was saved first. Refresh and try again.');
  }
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not save the change.'},{status:400});}
}

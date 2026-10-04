export type Player = { id: string; name: string; handicap: number; email?: string; active?: boolean };
export type Assignment = { player_id: string; name: string; handicap: number; team: number; group: number; time: string };
export type Result = { team: number; gross: number; handicap: number; net: number; points: number; prize_cents: number; place: number };
export function scheduleDates(start: string, count: number, interval: number) {
  const date = new Date(`${start}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(+date) || date.toISOString().slice(0,10)!==start || !Number.isInteger(count) || count<1 || count>52 || ![7,14,28].includes(interval)) throw new Error('Choose a valid start date, 1–52 rounds, and a weekly, fortnightly, or four-week interval.');
  return Array.from({length:count},(_,i)=>new Date(+date+i*interval*86400000).toISOString().slice(0,10));
}
export function makePairings(players: Player[], teamSize: number, firstTime: string, interval: number, history: Assignment[][]): Assignment[] {
  if (![1,2,4].includes(teamSize) || players.length<teamSize || players.length%teamSize!==0) throw new Error(`The available roster must have a multiple of ${teamSize} players. Mark a substitute in or a player out first.`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(firstTime) || !Number.isInteger(interval) || interval<5 || interval>30) throw new Error('Choose a valid tee time and a 5–30 minute interval.');
  const met = new Map<string,number>(); const partnered=new Map<string,number>();
  const key=(a:string,b:string)=>[a,b].sort().join(':');
  for(const round of history) for(let i=0;i<round.length;i++) for(let j=i+1;j<round.length;j++) {
    if(round[i].group===round[j].group) met.set(key(round[i].player_id,round[j].player_id),(met.get(key(round[i].player_id,round[j].player_id))||0)+1);
    if(round[i].team===round[j].team) partnered.set(key(round[i].player_id,round[j].player_id),(partnered.get(key(round[i].player_id,round[j].player_id))||0)+1);
  }
  let best:Player[]=[];let cost=Infinity;
  // Search different balanced team orders; penalize repeated partners most heavily.
  for(let attempt=0;attempt<160;attempt++) {
    const ordered=[...players];
    for(let i=ordered.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
    let score=0; const averages:number[]=[];
    for(let i=0;i<ordered.length;i+=teamSize) averages.push(ordered.slice(i,i+teamSize).reduce((s,p)=>s+Number(p.handicap),0)/teamSize);
    const mean=averages.reduce((s,n)=>s+n,0)/averages.length;
    score+=averages.reduce((s,n)=>s+(n-mean)**2,0)*0.025;
    for(let i=0;i<ordered.length;i++) for(let j=i+1;j<ordered.length;j++) {
      const k=key(ordered[i].id,ordered[j].id);
      if(Math.floor(i/teamSize)===Math.floor(j/teamSize))score+=(partnered.get(k)||0)*15;
      if(Math.floor(i/4)===Math.floor(j/4))score+=(met.get(k)||0)*3;
    }
    if(score<cost){cost=score;best=ordered;}
  }
  const [h,m]=firstTime.split(':').map(Number);
  return best.map((p,i)=>{
    const minutes=h*60+m+Math.floor(i/4)*interval;
    if(minutes>=1440) throw new Error('Tee times extend past midnight. Choose an earlier start.');
    return {player_id:p.id,name:p.name,handicap:Number(p.handicap),team:Math.floor(i/teamSize)+1,group:Math.floor(i/4)+1,time:`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`};
  });
}
export function calculateResults(assignments: Assignment[], scores: {team:number;gross:number}[], allowance: string, points: number[], prizes: number[]): Result[] {
  const teams=[...new Set(assignments.map(a=>a.team))];
  if(!teams.length || scores.length!==teams.length || new Set(scores.map(s=>s.team)).size!==teams.length)throw new Error('Enter one gross score for every team.');
  const rows=scores.map(s=>{
    if(!teams.includes(s.team)||!Number.isInteger(s.gross)||s.gross<1||s.gross>300)throw new Error('Scores must be whole numbers from 1 to 300.');
    const hcps=assignments.filter(a=>a.team===s.team).map(a=>a.handicap).sort((a,b)=>a-b);
    let handicap=hcps.reduce((a,b)=>a+b,0)/hcps.length;
    if(allowance==='weighted'&&hcps.length===2)handicap=hcps[0]*.35+hcps[1]*.15;
    if(allowance==='weighted'&&hcps.length===4)handicap=hcps[0]*.25+hcps[1]*.2+hcps[2]*.15+hcps[3]*.1;
    handicap=Math.round(handicap);
    return {...s,handicap,net:s.gross-handicap,points:0,prize_cents:0,place:0};
  }).sort((a,b)=>a.net-b.net||a.team-b.team);
  for(let i=0;i<rows.length;) {
    let end=i+1;while(end<rows.length&&rows[end].net===rows[i].net)end++;
    const count=end-i;
    const pts=Array.from({length:count},(_,j)=>points[i+j]||0).reduce((a,b)=>a+b,0)/count;
    const pot=Array.from({length:count},(_,j)=>prizes[i+j]||0).reduce((a,b)=>a+b,0);
    for(let j=i;j<end;j++) Object.assign(rows[j],{place:i+1,points:Math.round(pts*100)/100,prize_cents:Math.floor(pot/count)+(j-i<pot%count?1:0)});
    i=end;
  }
  return rows;
}
export function splitCents(total:number,count:number,index:number){return Math.floor(total/count)+(index<total%count?1:0);}

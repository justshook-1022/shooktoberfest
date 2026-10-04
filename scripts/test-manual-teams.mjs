import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const ok = ({data,error}) => { assert.equal(error,null,error?.message); return data; };
const suffix = crypto.randomUUID();
let eventId, userId, browser, page;
try {
  const email = `manual-team-test-${suffix}@example.com`, password = `Test-${suffix}-Aa9!`;
  userId = ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
  eventId = ok(await admin.from('events').insert({name:'Manual Teams Test',event_date:'2026-10-02',signups_open:false,scoring_open:false}).select('id').single()).id;
  ok(await admin.from('players').insert({event_id:eventId,auth_user_id:userId,first_name:'Test',last_name:'Admin',email,shirt_size:'L',is_admin:true,payment_status:'unpaid'}));
  const players = ok(await admin.from('players').insert([0,1,2,3].map(i=>({event_id:eventId,first_name:`Manual${i}`,last_name:`Player${i}`,email:`${i}-${suffix}@example.com`,shirt_size:'L',course_handicap:i*10,payment_status:'paid'}))).select('id,first_name').order('first_name'));
  const group = ok(await admin.from('tee_groups').insert({event_id:eventId,tee_time:'2026-10-02T15:40:00Z',sort_order:0}).select('id').single());
  let rows = [{teamId:null,aPlayerId:players[3].id,bPlayerId:players[0].id},{teamId:null,aPlayerId:players[1].id,bPlayerId:players[2].id}];
  ok(await admin.rpc('admin_apply_team_pairings',{p_event_id:eventId,p_pairings:rows}));
  let members = ok(await admin.from('players').select('id,team_id,flight').eq('event_id',eventId));
  rows = rows.map(r=>({...r,teamId:members.find(p=>p.id===r.aPlayerId).team_id}));
  ok(await admin.from('teams').update({tee_group_id:group.id}).eq('event_id',eventId));
  const before = ok(await admin.from('teams').select('id,tee_group_id').eq('event_id',eventId).order('id'));
  assert.equal(members.find(p=>p.id===players[3].id).flight,'A'); // higher HCP is explicitly A
  ok(await admin.from('players').delete().eq('id',players[1].id));
  rows[1].aPlayerId=null;
  ok(await admin.rpc('admin_apply_team_pairings',{p_event_id:eventId,p_pairings:rows}));
  assert.deepEqual(ok(await admin.from('teams').select('id,tee_group_id').eq('event_id',eventId).order('id')),before);
  members = ok(await admin.from('players').select('id,team_id,flight').eq('event_id',eventId));
  assert.equal(members.find(p=>p.id===players[2].id).flight,'B');
  const duplicate = await admin.rpc('admin_apply_team_pairings',{p_event_id:eventId,p_pairings:[rows[0],{...rows[1],bPlayerId:players[0].id}]});
  assert.match(duplicate.error?.message??'',/more than once/);
  const missingTeam = await admin.rpc('admin_apply_team_pairings',{p_event_id:eventId,p_pairings:[rows[0]]});
  assert.match(missingTeam.error?.message??'',/Reload/);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  assert.ok((await anon.rpc('admin_apply_team_pairings',{p_event_id:eventId,p_pairings:rows})).error);
  assert.ok((await admin.rpc('draw_teams',{p_event_id:eventId})).error);
  const base = process.env.MANUAL_TEST_URL;
  if (base) {
    browser = await chromium.launch({channel:'chrome',headless:true});
    page = await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(`${base}/login?next=/admin/draw`);
    await page.getByLabel('Email address', {exact:true}).fill(email);
    await page.getByLabel('Password', {exact:true}).fill(password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.waitForURL('**/admin/draw');
    await page.getByRole('button',{name:'Save teams',exact:true}).waitFor();
    const selects = page.locator('.draw-table select');
    assert.equal(await selects.count(),4);
    const values = await selects.evaluateAll(elements=>elements.map(e=>e.value));
    assert.ok(values.includes(players[3].id));
    assert.ok(values.includes(''));
    const b = page.locator('select').filter({has:page.locator(`option:checked[value="${players[2].id}"]`)});
    const a = b.locator('xpath=ancestor::tr').locator('select').first();
    await b.selectOption('');
    await a.selectOption(players[2].id); // move solo B to A manually
    page.on('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Save teams',exact:true}).click();
    await page.getByText('Team pairings were saved. Tee times were preserved.',{exact:true}).waitFor();
    await page.reload();
    await page.getByRole('button',{name:'Save teams',exact:true}).waitFor();
    assert.equal(ok(await admin.from('players').select('flight').eq('id',players[2].id).single()).flight,'A');
    assert.deepEqual(ok(await admin.from('teams').select('id,tee_group_id').eq('event_id',eventId).order('id')),before);
    await mkdir('work/manual-teams',{recursive:true});
    await page.screenshot({path:'work/manual-teams/desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'work/manual-teams/mobile.png',fullPage:true});
    console.log('Browser: manual A/B selectors, solo slot changes, save, reload, and tee-time preservation passed.');
  }
  ok(await admin.from('team_rounds').insert({team_id:rows[0].teamId,started_by:players[0].id}));
  assert.match((await admin.rpc('admin_apply_team_pairings',{p_event_id:eventId,p_pairings:rows})).error?.message??'',/round has started/);
  console.log('Database: manual flights, removal, stable teams/tee times, duplicate and stale-team rejection, permissions, and round lock passed.');
} catch (error) {
  if (page) console.error('Browser state:', await page.locator('body').innerText());
  throw error;
} finally {
  if(browser) await browser.close();
  if(eventId) ok(await admin.from('events').delete().eq('id',eventId));
  if(userId) ok(await admin.auth.admin.deleteUser(userId));
}

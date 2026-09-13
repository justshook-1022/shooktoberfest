import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { holes } from '../lib/event.ts';

const baseURL = process.env.RESET_TEST_URL || 'http://localhost:3014';
const output = process.env.RESET_TEST_OUTPUT || 'work/reset-e2e';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && anonKey && process.env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase test environment required');
const config = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, config);
const anonymous = createClient(url, anonKey, config);
const events = [], users = [], clients = [], errors = [], checks = [];
let browser;
const data = (r, label) => { assert.equal(r.error, null, `${label}: ${r.error?.message}`); return r.data; };
const check = label => { checks.push(label); console.log(`PASS ${label}`); };
const resetBody = teamId => ({ action: 'reset-scoring', teamId, clearGreenies: false, confirmation: 'RESET SCORES' });
async function request(token, body) {
  const r = await fetch(new URL('/api/admin', baseURL), { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function snapshot(eventId) {
  const teams = data(await service.from('teams').select('*').eq('event_id', eventId).order('id'), 'snapshot teams');
  return {
    event: data(await service.from('events').select('*').eq('id', eventId).single(), 'snapshot event'),
    players: data(await service.from('players').select('*').eq('event_id', eventId).order('id'), 'snapshot players'),
    course: data(await service.from('course_holes').select('*').eq('event_id', eventId).order('hole'), 'snapshot course'),
    groups: data(await service.from('tee_groups').select('*').eq('event_id', eventId).order('id'), 'snapshot groups'),
    greenies: data(await service.from('greenies').select('*').eq('event_id', eventId).order('hole'), 'snapshot greenies'),
    teams,
    scores: data(await service.from('scores').select('*').in('team_id', teams.map(t => t.id)).order('team_id').order('hole'), 'snapshot scores'),
    rounds: data(await service.from('team_rounds').select('*').in('team_id', teams.map(t => t.id)).order('team_id'), 'snapshot rounds'),
  };
}
await mkdir(output, { recursive: true });
try {
  for (const label of ['Reset QA', 'Other event QA']) {
    const event = data(await service.from('events').insert({ name: `${label} ${crypto.randomUUID()}`, event_date: '2026-10-02', scoring_open: true, signups_open: false }).select('id').single(), 'create test event');
    events.push(event.id);
    data(await service.from('course_holes').insert(holes.map(h => ({ event_id: event.id, hole: h.hole, par: h.par, stroke_index: h.strokeIndex, tee_name: h.tee, yardage: h.yards }))), 'create course');
  }
  const [eventId, foreignEventId] = events;
  const group = data(await service.from('tee_groups').insert({ event_id: eventId, starting_hole: 10, tee_time: '2026-10-02T16:00:00Z', sort_order: 1 }).select('id').single(), 'group');
  const teams = data(await service.from('teams').insert([
    { event_id: eventId, name: 'Reset Alpha', tee_group_id: group.id, status: 'active' },
    { event_id: eventId, name: 'Reset Bravo', tee_group_id: group.id, status: 'dq', playoff_rank: 2 },
    { event_id: foreignEventId, name: 'Other event team', status: 'wd', playoff_rank: 1 },
  ]).select('id,name'), 'teams');
  const alpha = teams.find(t => t.name === 'Reset Alpha');
  const bravo = teams.find(t => t.name === 'Reset Bravo');
  const foreign = teams.find(t => t.name === 'Other event team');
  const people = [];
  for (const [index, label] of ['Admin', 'Player'].entries()) {
    const suffix = crypto.randomUUID();
    const email = `reset-qa-${suffix}@example.com`, password = `Qa-${suffix}-Aa9!`;
    const user = data(await service.auth.admin.createUser({ email, password, email_confirm: true }), 'create auth user').user;
    users.push(user.id);
    const player = data(await service.from('players').insert({ event_id: eventId, auth_user_id: user.id, email, first_name: 'Reset QA', last_name: label, is_admin: index === 0, payment_status: 'comped', course_handicap: 10, handicap_index: 10, shirt_size: 'L', team_id: index === 0 ? bravo.id : alpha.id }).select('id,team_id').single(), 'create player');
    const client = createClient(url, anonKey, config); clients.push(client);
    const auth = data(await client.auth.signInWithPassword({ email, password }), 'sign in API');
    people.push({ email, password, player, client, token: auth.session.access_token });
  }
  const [organizer, player] = people;
  data(await service.from('team_rounds').insert(teams.map(t => ({ team_id: t.id }))), 'seed rounds');
  data(await service.from('scores').insert(teams.map(t => ({ team_id: t.id, hole: 1, strokes: 6, putts: 2 }))), 'seed scores');
  data(await service.from('greenies').insert({ event_id: eventId, hole: holes.find(h => h.par === 3).hole, player_id: player.player.id }), 'seed closest to pin');
  const before = await snapshot(eventId), foreignBefore = await snapshot(foreignEventId);
  const oldRound = before.rounds.find(r => r.team_id === alpha.id).started_at;
  const resetArgs = { p_event_id: eventId, p_team_id: alpha.id, p_clear_greenies: false };
  assert.ok((await anonymous.rpc('admin_reset_scoring', resetArgs)).error);
  assert.ok((await player.client.rpc('admin_reset_scoring', resetArgs)).error);
  assert.equal((await request(null, resetBody(alpha.id))).status, 401);
  assert.equal((await request(player.token, resetBody(alpha.id))).status, 401);
  assert.equal((await request(organizer.token, { ...resetBody(alpha.id), confirmation: '' })).status, 400);
  assert.equal((await request(organizer.token, { ...resetBody(alpha.id), teamId: undefined })).status, 400);
  assert.equal((await request(organizer.token, { ...resetBody(alpha.id), clearGreenies: true })).status, 400);
  assert.equal((await request(organizer.token, resetBody(foreign.id))).status, 409);
  assert.deepEqual(await snapshot(eventId), before);
  assert.deepEqual(await snapshot(foreignEventId), foreignBefore);
  check('Unauthorized, unconfirmed, malformed, and cross-event resets are rejected without changing data');

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL });
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL });
  const spectator = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL });
  for (const context of [adminContext, playerContext, spectator]) context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  const adminPage = await adminContext.newPage(), playerPage = await playerContext.newPage(), boardPage = await spectator.newPage();
  async function login(page, person, path) {
    await page.goto(`/login?next=${encodeURIComponent(path)}`);
    await page.getByLabel('Email address', { exact: true }).fill(person.email);
    await page.getByLabel('Password', { exact: true }).fill(person.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new URL(path, baseURL).href, { timeout: 30000 });
  }
  await login(adminPage, organizer, '/admin');
  await adminPage.locator('.admin-section-grid').getByRole('link', { name: /Reset scores/ }).click();
  await expect(adminPage).toHaveURL(/\/admin\/reset-scores$/);
  await expect(adminPage.getByRole('button', { name: 'Reset team scores', exact: true })).toBeDisabled();
  await adminPage.getByLabel('Reset scope', { exact: true }).selectOption(alpha.id);
  await expect(adminPage.getByText('Saved holes: 1 · Rounds started: 1 · Teams: 1', { exact: true })).toBeVisible();
  adminPage.once('dialog', dialog => dialog.dismiss());
  await adminPage.getByRole('button', { name: 'Reset team scores', exact: true }).click();
  assert.deepEqual(await snapshot(eventId), before);
  check('Admin dashboard links to reset controls; scope selection and cancel confirmation are safe');

  await login(playerPage, player, '/score');
  await expect(playerPage.getByRole('button', { name: 'Save hole 10', exact: true })).toBeVisible({ timeout: 20000 });
  await playerPage.getByRole('button', { name: 'Add one stroke', exact: true }).click();
  await expect(playerPage.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await boardPage.goto(`/leaderboard?event=${eventId}`);
  const row = boardPage.getByRole('row').filter({ hasText: 'Reset Alpha' });
  await expect(row.locator('td').nth(2)).toHaveText('1', { timeout: 20000 });
  adminPage.once('dialog', dialog => dialog.accept());
  await adminPage.getByRole('button', { name: 'Reset team scores', exact: true }).click();
  await expect(adminPage.getByText('Scores reset for Reset Alpha. Players can start a fresh round.', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(adminPage.getByText('Saved holes: 0 · Rounds started: 0 · Teams: 1', { exact: true })).toBeVisible();
  const afterOne = await snapshot(eventId);
  for (const field of ['event', 'players', 'course', 'groups', 'greenies']) assert.deepEqual(afterOne[field], before[field], `${field} preserved`);
  assert.deepEqual(afterOne.scores, before.scores.filter(s => s.team_id !== alpha.id));
  assert.deepEqual(afterOne.rounds, before.rounds.filter(r => r.team_id !== alpha.id));
  assert.deepEqual(afterOne.teams, before.teams);
  await expect(row.locator('td').nth(2)).toHaveText('—', { timeout: 20000 });
  await expect(playerPage.getByRole('button', { name: 'Start round', exact: true })).toBeVisible({ timeout: 20000 });
  check('Single-team reset clears scores and round progress, updates the live leaderboard, and preserves other data');
  await playerPage.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(playerPage.getByRole('button', { name: 'Save hole 10', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(playerPage.locator('output[aria-label="Gross score"]')).toHaveText(String(holes[9].par));
  await expect(playerPage.getByText('Not yet entered', { exact: true })).toBeVisible();
  const staleArgs = { p_team_id: alpha.id, p_player_id: player.player.id, p_hole: 10, p_strokes: 6, p_putts: 2, p_expected_updated_at: null, p_round_started_at: oldRound };
  assert.equal((await player.client.rpc('save_started_team_hole', staleArgs)).error?.code, 'PT410');
  assert.equal((await snapshot(eventId)).scores.filter(s => s.team_id === alpha.id).length, 0);
  await playerPage.getByRole('button', { name: 'Subtract one putt', exact: true }).click();
  await playerPage.getByRole('button', { name: 'Save hole 10', exact: true }).click();
  await expect(playerPage.getByText(/^Hole 10 saved\./)).toBeVisible({ timeout: 30000 });
  const fresh = (await snapshot(eventId)).scores.find(s => s.team_id === alpha.id);
  assert.equal(fresh.strokes, holes[9].par); assert.equal(fresh.putts, 1);
  await expect(row.locator('td').nth(2)).toHaveText('1', { timeout: 20000 });
  check('Fresh rounds discard unsaved drafts, reject delayed old-round saves, and accept new gross scores and putts');

  // A save already waiting on the network must not come back after reset.
  await playerPage.getByRole('button', { name: 'Hole 11, not entered', exact: true }).click();
  await playerPage.getByRole('button', { name: 'Add one stroke', exact: true }).click();
  let releaseRequest, capturedRequest;
  const held = new Promise(resolve => { capturedRequest = resolve; });
  const release = new Promise(resolve => { releaseRequest = resolve; });
  await playerPage.route('**/rest/v1/rpc/save_started_team_hole', async route => { capturedRequest(); await release; await route.continue(); }, { times: 1 });
  await playerPage.getByRole('button', { name: 'Save hole 11', exact: true }).click();
  await held;
  const inFlightReset = await request(organizer.token, resetBody(alpha.id));
  assert.equal(inFlightReset.status, 200);
  data(await player.client.from('team_rounds').insert({ team_id: alpha.id, started_by: player.player.id }), 'restart while old request pending');
  releaseRequest();
  await expect(playerPage.getByRole('button', { name: 'Save hole 10', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(playerPage.getByText('Not yet entered', { exact: true })).toBeVisible();
  assert.equal((await snapshot(eventId)).scores.filter(s => s.team_id === alpha.id).length, 0);
  check('An in-flight browser save cannot restore scores after reset and immediate restart');

  // Reset while scoring is closed and include optional result cleanup.
  data(await service.from('events').update({ scoring_open: false }).eq('id', eventId), 'close test scoring');
  data(await service.from('teams').update({ status: 'wd', playoff_rank: 1 }).eq('id', alpha.id), 'seed withdrawn result');
  await adminPage.reload();
  await adminPage.getByLabel('Reset scope', { exact: true }).selectOption('all');
  const greenieCheckbox = adminPage.getByRole('checkbox', { name: /Also clear closest-to-pin winners/ });
  await expect(greenieCheckbox).not.toBeChecked();
  await greenieCheckbox.check();
  await adminPage.screenshot({ path: `${output}/admin-reset-desktop.png`, fullPage: true });
  await adminPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile reset has no overflow');
  await adminPage.screenshot({ path: `${output}/admin-reset-mobile.png`, fullPage: true });
  adminPage.once('dialog', dialog => dialog.accept());
  await adminPage.getByRole('button', { name: 'Reset all scores', exact: true }).click();
  await expect(adminPage.getByText(/Scores reset for all teams in Reset QA/)).toBeVisible({ timeout: 20000 });
  await expect(adminPage.getByText('Saved holes: 0 · Rounds started: 0 · Teams: 2', { exact: true })).toBeVisible();
  const afterAll = await snapshot(eventId);
  assert.deepEqual(afterAll.scores, []); assert.deepEqual(afterAll.rounds, []); assert.deepEqual(afterAll.greenies, []);
  assert.ok(afterAll.teams.every(t => t.status === 'active' && t.playoff_rank === null));
  for (const field of ['players', 'course', 'groups']) assert.deepEqual(afterAll[field], before[field]);
  const teamSetup = team => Object.fromEntries(Object.entries(team).filter(([key]) => !['status', 'playoff_rank'].includes(key)));
  assert.deepEqual(afterAll.teams.map(teamSetup), before.teams.map(teamSetup));
  assert.deepEqual(afterAll.event, { ...before.event, scoring_open: false });
  assert.deepEqual(await snapshot(foreignEventId), foreignBefore);
  await expect(playerPage.getByRole('button', { name: 'Start round', exact: true })).toBeDisabled({ timeout: 20000 });
  check('Whole-event reset clears results and optional closest-to-pin winners; registrations, pairings, handicaps, tee times, scoring settings, and other events remain intact');
  const repeated = await request(organizer.token, { ...resetBody(null), eventId: foreignEventId });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.state.event.id, eventId);
  assert.deepEqual(await snapshot(eventId), afterAll);
  assert.deepEqual(await snapshot(foreignEventId), foreignBefore);
  check('Repeated reset is safe and request event IDs cannot override the signed-in admin’s event');
  assert.deepEqual(errors, [], 'No browser JavaScript errors');
  console.log(`Admin score reset verified at ${baseURL}: ${checks.length} checks passed.`);
} catch (error) {
  console.log('Browser JavaScript errors:', errors);
  if (browser) for (const [i, ctx] of browser.contexts().entries()) for (const [j, page] of ctx.pages().entries()) {
    console.log(`Failure page ${i}-${j}: ${page.url()}`);
    console.log((await page.locator('body').innerText()).slice(-2200));
    await page.screenshot({ path: `${output}/failure-${i}-${j}.png`, fullPage: true });
  }
  throw error;
} finally {
  if (browser) await browser.close();
  for (const client of clients) await client.auth.signOut();
  for (const id of events) data(await service.from('events').delete().eq('id', id), 'remove test event');
  for (const id of users) data(await service.auth.admin.deleteUser(id), 'remove test auth user');
  console.log('Temporary reset fixtures and accounts removed.');
}

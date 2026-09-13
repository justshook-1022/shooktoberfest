import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { holes, strokesReceived } from '../lib/event.ts';

const baseURL = process.env.SCORING_TEST_URL || 'http://localhost:3000';
const output = process.env.SCORING_TEST_OUTPUT || 'work/scoring-e2e';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && key && process.env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase test environment required');
const config = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, config);
const anon = createClient(url, key, config);
const userIds = [];
let eventId, browser;
const errors = [];
const network = [];
const pending = new Set();
const checked = [];
const check = label => { checked.push(label); console.log(`PASS ${label}`); };
const data = (result, label) => { assert.equal(result.error, null, `${label}: ${result.error?.message}`); return result.data; };
const fail = (result, label) => assert.ok(result.error, label);
const name = `Scoring QA ${crypto.randomUUID()}`;
const clients = [];
await mkdir(output, { recursive: true });

try {
  eventId = data(await admin.from('events').insert({ name, event_date: '2026-10-02', signups_open: false, scoring_open: false }).select('id').single(), 'event').id;
  data(await admin.from('course_holes').insert(holes.map(h => ({ event_id: eventId, hole: h.hole, par: h.par, stroke_index: h.strokeIndex, tee_name: h.tee, yardage: h.yards }))), 'course');
  const teams = data(await admin.from('teams').insert([{ event_id: eventId, name: 'QA Alpha' }, { event_id: eventId, name: 'QA Bravo' }]).select('id,name'), 'teams');
  const alpha = teams.find(t => t.name === 'QA Alpha');
  const bravo = teams.find(t => t.name === 'QA Bravo');
  const people = [];
  for (const [index, label] of ['Alpha', 'Partner', 'Bravo'].entries()) {
    const suffix = crypto.randomUUID();
    const email = `score-qa-${suffix}@example.com`;
    const password = `Qa-${suffix}-Aa9!`;
    const user = data(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'auth').user;
    userIds.push(user.id);
    const player = data(await admin.from('players').insert({ event_id: eventId, auth_user_id: user.id, first_name: 'QA', last_name: label, email, team_id: index < 2 ? alpha.id : bravo.id, handicap_index: index === 0 ? 10 : index === 1 ? 20 : 0, course_handicap: index === 0 ? 10 : index === 1 ? 20 : 0, shirt_size: 'L', payment_status: 'comped' }).select('id,team_id').single(), 'player');
    const client = createClient(url, key, config); clients.push(client);
    data(await client.auth.signInWithPassword({ email, password }), 'login api');
    people.push({ email, password, player, client });
  }
  const [one, partner, two] = people;
  const args = (person, hole, strokes, putts, expected = null) => ({ p_team_id: person.player.team_id, p_player_id: person.player.id, p_hole: hole, p_strokes: strokes, p_putts: putts, p_expected_updated_at: expected });
  fail(await one.client.from('team_rounds').insert({ team_id: alpha.id, started_by: one.player.id }), 'closed round cannot start');
  fail(await anon.rpc('save_team_hole', args(one, 1, 5, 2)), 'anonymous score denied');
  fail(await one.client.rpc('save_team_hole', args(one, 1, 5, 2)), 'score before start denied');
  check('Database rejects anonymous scoring, early starts, and scores before round start');

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL });
  const second = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL });
  const spectator = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL });
  for (const ctx of [context, second, spectator]) ctx.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if(req.url().includes('/rest/v1/rpc/save_started_team_hole')) { pending.add(req.url()); console.log('Browser saving hole', req.postDataJSON()?.p_hole); } });
    page.on('requestfinished', req => { if(req.url().includes('/rest/v1/rpc/save_started_team_hole')) pending.delete(req.url()); });
    page.on('requestfailed', req => network.push(`${req.method()} ${req.url()} ${req.failure()?.errorText}`));
    page.on('response', res => { if(res.status() >= 400) network.push(`${res.status()} ${res.url()}`); });
  });
  const playerPage = await context.newPage();
  const secondPage = await second.newPage();
  const boardPage = await spectator.newPage();
  async function login(page, person) {
    await page.goto('/login?next=/me');
    await page.getByLabel('Email address', { exact: true }).fill(person.email);
    await page.getByLabel('Password', { exact: true }).fill(person.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/me$/, { timeout: 30000 });
  }
  await playerPage.goto('/score');
  await expect(playerPage).toHaveURL(/\/login\?next=/, { timeout: 30000 });
  await login(playerPage, one);
  await expect(playerPage.getByRole('button', { name: 'Start round', exact: true })).toBeDisabled({ timeout: 15000 });
  check('Mobile sign-in returns to profile; Start round is disabled before organizer opens scoring');
  data(await admin.from('events').update({ scoring_open: true }).eq('id', eventId), 'open scoring');
  await expect(playerPage.getByRole('button', { name: 'Start round', exact: true })).toBeEnabled({ timeout: 15000 });
  fail(await one.client.from('team_rounds').insert({ team_id: bravo.id, started_by: one.player.id }), 'cannot start foreign team');
  await playerPage.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(playerPage.getByRole('button', { name: 'Save hole 1', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(playerPage.locator('output[aria-label="Gross score"]')).toHaveText('5');
  await expect(playerPage.getByLabel('Net score', { exact: true })).toHaveText('4');
  const grossBox = await playerPage.locator('output[aria-label="Gross score"]').boundingBox();
  const netBox = await playerPage.getByLabel('Net score', { exact: true }).boundingBox();
  assert.ok(netBox.y > grossBox.y, 'net renders below gross');
  check('Start round opens shared card; handicap-adjusted net appears under gross');
  await boardPage.goto(`/leaderboard?event=${eventId}`);
  const alphaRow = boardPage.getByRole('row').filter({ hasText: 'QA Alpha' });
  const bravoRow = boardPage.getByRole('row').filter({ hasText: 'QA Bravo' });
  await expect(alphaRow).toBeVisible({ timeout: 30000 });
  await playerPage.getByRole('button', { name: 'Subtract one putt', exact: true }).click({ clickCount: 2 });
  await expect(playerPage.locator('output[aria-label="Putts"]')).toHaveText('0');
  const save = async (page, hole) => {
    await page.getByRole('button', { name: new RegExp(`Save hole ${hole}$|Save failed · tap to retry`) }).click();
    await expect(page.getByText(new RegExp(`^Hole ${hole} saved\\.`))).toBeVisible({ timeout: 30000 });
  };
  await save(playerPage, 1);
  await expect(alphaRow.locator('td').nth(0)).toHaveText('1', { timeout: 10000 });
  await expect(alphaRow.locator('td').nth(1)).toHaveText('−1');
  await expect(alphaRow.locator('td').nth(2)).toHaveText('1');
  check('Saving gross and zero putts updates spectator leaderboard without refresh');
  await playerPage.reload();
  await expect(playerPage.getByRole('button', { name: 'Save hole 2', exact: true })).toBeVisible({ timeout: 20000 });
  await playerPage.getByRole('button', { name: 'Hole 1, saved', exact: true }).click();
  await expect(playerPage.locator('output[aria-label="Putts"]')).toHaveText('0');
  check('Reload resumes first unplayed hole and retains saved gross and putts');

  await login(secondPage, two);
  await secondPage.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(secondPage.getByRole('button', { name: 'Save hole 1', exact: true })).toBeVisible({ timeout: 20000 });
  await secondPage.getByRole('button', { name: 'Subtract one stroke', exact: true }).click({ clickCount: 2 });
  await save(secondPage, 1);
  await expect(bravoRow.locator('td').nth(0)).toHaveText('1', { timeout: 10000 });
  await expect(alphaRow.locator('td').nth(0)).toHaveText('2');
  check('A second team taking the lead automatically moves the first team to second');

  fail(await two.client.rpc('save_team_hole', { ...args(two, 1, 2, 1), p_team_id: alpha.id }), 'foreign scoring denied');
  fail(await one.client.rpc('save_team_hole', args(one, 2, 4, 5)), 'excessive putts denied');
  fail(await one.client.rpc('save_team_hole', args(one, 2, 0, 0)), 'zero gross denied');
  fail(await one.client.from('scores').insert({ team_id: alpha.id, hole: 2, strokes: 4, putts: null, entered_by: one.player.id }), 'missing putts denied');
  check('Database rejects foreign-team edits, invalid gross, missing putts, and putts exceeding gross');

  await playerPage.getByRole('button', { name: 'Add one stroke', exact: true }).click();
  const previous = data(await partner.client.from('scores').select('updated_at').eq('team_id', alpha.id).eq('hole', 1).single(), 'prior version');
  data(await partner.client.rpc('save_team_hole', args(partner, 1, 4, 1, previous.updated_at)), 'partner edit');
  const stale = await one.client.rpc('save_team_hole', args(one, 1, 6, 0, previous.updated_at));
  assert.equal(stale.error?.code, 'PT409', 'stale API conflict');
  console.log('PASS stale conflict at API boundary');
  await playerPage.getByRole('button', { name: 'Save hole 1', exact: true }).click();
  await expect(playerPage.getByText(/Another device changed this hole/)).toBeVisible({ timeout: 45000 });
  await expect(playerPage.locator('output[aria-label="Gross score"]')).toHaveText('4');
  check('Stale teammate edits are rejected and the latest saved hole is shown');
  const latest = data(await one.client.from('scores').select('updated_at').eq('team_id', alpha.id).eq('hole', 1).single(), 'latest version');
  const retry = data(await one.client.rpc('save_team_hole', args(one, 1, 4, 1, previous.updated_at)), 'idempotent retry');
  assert.equal(retry[0].updated_at, latest.updated_at);
  check('Retrying an already saved score is idempotent');

  await playerPage.getByRole('button', { name: 'Next hole', exact: false }).click();
  await playerPage.getByRole('button', { name: 'Add one stroke', exact: true }).click();
  await playerPage.getByRole('button', { name: 'Next hole', exact: false }).click();
  await playerPage.getByRole('button', { name: 'Previous', exact: false }).click();
  await expect(playerPage.locator('output[aria-label="Gross score"]')).toHaveText('5');
  check('Unsaved hole entries survive scorecard navigation');
  await context.setOffline(true);
  await playerPage.getByRole('button', { name: 'Save hole 2', exact: true }).click();
  await expect(playerPage.getByRole('button', { name: 'Signal dropped · retrying', exact: true })).toBeVisible({ timeout: 10000 });
  await context.setOffline(false);
  await expect(playerPage.getByText(/^Hole 2 saved\./)).toBeVisible({ timeout: 30000 });
  check('Dropped connection retains the hole and retries successfully after reconnection');

  for (let hole = 3; hole <= 18; hole++) {
    await playerPage.getByRole('button', { name: `Hole ${hole}, not entered`, exact: true }).click();
    await save(playerPage, hole);
  }
  await expect(playerPage.getByText(/Round complete · all 18 holes are saved/)).toBeVisible();
  await expect(alphaRow.locator('td').nth(2)).toHaveText('F', { timeout: 10000 });
  const saved = data(await anon.from('scores').select('hole,strokes,putts').eq('team_id', alpha.id), 'saved round');
  const board = data(await anon.from('leaderboard').select('gross,net,net_to_par,team_hcp,holes_played,position').eq('team_id', alpha.id).single(), 'round totals');
  assert.equal(saved.length, 18);
  const expectedNet = saved.reduce((sum, s) => sum + s.strokes - strokesReceived(board.team_hcp, holes[s.hole - 1].strokeIndex), 0);
  assert.equal(board.net, expectedNet);
  assert.equal(board.net_to_par, expectedNet - 70);
  assert.equal(board.gross, saved.reduce((sum, s) => sum + s.strokes, 0));
  assert.ok(saved.every(s => Number.isInteger(s.putts)));
  check('All 18 holes complete with correct gross, net, putt persistence, and final leaderboard status');

  await playerPage.getByRole('button', { name: 'Hole 1, saved', exact: true }).click();
  for (const target of [playerPage.getByLabel('Net score', { exact: true }), playerPage.getByText(/Round complete · all 18 holes are saved/)]) {
    const ratio = await target.evaluate(element => {
      const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = values => values.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      let background = element;
      while (background.parentElement && getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)') background = background.parentElement;
      const fg = luminance(rgb(getComputedStyle(element).color));
      const bg = luminance(rgb(getComputedStyle(background).backgroundColor));
      return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
    });
    assert.ok(ratio >= 4.5, `Readable net score and round notice contrast: ${ratio}`);
  }
  check('Net score and completion notice have readable contrast on mobile');
  await playerPage.evaluate(() => window.scrollTo(0, 0));
  await playerPage.screenshot({ path: `${output}/mobile-scorecard.png`, fullPage: true });
  await boardPage.screenshot({ path: `${output}/live-leaderboard.png`, fullPage: true });
  assert.equal(await playerPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'mobile card has no horizontal overflow');
  const cardDetail = data(await anon.from('team_scorecard').select('putts,net_hole').eq('team_id', alpha.id).eq('hole', 1).single(), 'public scorecard');
  assert.deepEqual(cardDetail, { putts: 1, net_hole: 3 });

  data(await admin.rpc('admin_save_scorecard', { p_event_id: eventId, p_team_id: alpha.id, p_scores: Object.fromEntries(saved.map(s => [s.hole, s.strokes])), p_entered_by: null }), 'admin correction');
  assert.equal(data(await anon.from('scores').select('putts').eq('team_id', alpha.id).eq('hole', 1).single(), 'preserved putts').putts, 1);
  check('Admin scorecard updates preserve valid recorded putts');
  data(await admin.from('events').update({ scoring_open: false }).eq('id', eventId), 'close scoring');
  fail(await one.client.rpc('save_team_hole', args(one, 1, 3, 1)), 'closed edit denied');
  await expect(playerPage.getByText('Scoring is closed. Your saved card is available to review.')).toBeVisible({ timeout: 15000 });
  await expect(playerPage.getByRole('button', { name: 'Add one stroke', exact: true })).toBeDisabled();
  await playerPage.goto('/me');
  await expect(playerPage.getByRole('link', { name: 'Review scorecard', exact: true })).toBeVisible({ timeout: 15000 });
  check('Closing scoring locks edits while profile and completed card remain reviewable');
  assert.deepEqual(errors, [], 'No browser JavaScript errors');
  console.log(`Live scoring verified at ${baseURL}: ${checked.length} checks passed; screenshots in ${output}.`);
} catch (error) {
  console.log('Browser errors', errors, 'Network failures', network, 'Pending saves', [...pending]);
  if (browser) for (const [i, ctx] of browser.contexts().entries()) for (const [j, page] of ctx.pages().entries()) {
    console.log(`Failure page ${i}-${j}: ${page.url()}`);
    console.log((await page.locator('body').innerText()).slice(-2400));
    await page.screenshot({path: `${output}/failure-${i}-${j}.png`, fullPage: true});
  }
  throw error;
} finally {
  if (browser) await browser.close();
  for (const client of clients) await client.auth.signOut();
  if (eventId) data(await admin.from('events').delete().eq('id', eventId), 'clean test event');
  for (const id of userIds) data(await admin.auth.admin.deleteUser(id), 'clean test user');
  console.log('Temporary scoring event and test accounts removed.');
}

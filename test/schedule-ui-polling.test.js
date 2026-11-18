import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../homebridge-ui/dashboard/app.js', import.meta.url), 'utf8');
const start = source.indexOf('async function refreshPendingEco()');
const end = source.indexOf('\nsetInterval(refreshPendingEco, 2000);', start);
assert.ok(start > 0 && end > start);
const makePoller = new Function('state', 'document', '$', 'ecoCommands', 'targetCommands', 'readStatus', 'renderLive',
  source.slice(start, end) + '\nreturn refreshPendingEco;');

for (const scenario of [
  { name: 'pending schedule', pending: { at: Date.now() }, reads: 1 },
  { name: 'failed schedule', pending: { at: Date.now(), failure: 'failed' }, reads: 0 },
  { name: 'timed-out schedule', pending: { at: Date.now() - 61000 }, reads: 0 },
  { name: 'confirmed schedule', reads: 0 },
  { name: 'hidden browser', pending: { at: Date.now() }, hidden: true, reads: 0 },
  { name: 'signed-out session', pending: { at: Date.now() }, signedOut: true, reads: 0 },
  { name: 'hidden app', pending: { at: Date.now() }, appHidden: true, reads: 0 },
  { name: 'restarting', pending: { at: Date.now() }, restarting: true, reads: 0 },
  { name: 'existing Eco command', eco: true, reads: 1 },
  { name: 'existing target command', target: true, reads: 1 },
]) {
  test('fast status polling handles ' + scenario.name, async () => {
    let reads = 0;
    let renders = 0;
    const state = { session: { authenticated: !scenario.signedOut }, restarting: scenario.restarting,
      status: { devices: [{ scheduleControls: { pending: scenario.pending } }] } };
    const poll = makePoller(state, { hidden: scenario.hidden }, () => ({ hidden: scenario.appHidden }),
      new Map(scenario.eco ? [['test', { phase: 'pending' }]] : []),
      new Map(scenario.target ? [['test', { phase: 'pending' }]] : []),
      async () => {
        reads++;
      }, () => {
        renders++;
      });
    await poll();
    assert.equal(reads, scenario.reads);
    assert.equal(renders, scenario.reads);
  });
}

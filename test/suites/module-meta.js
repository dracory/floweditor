// Per-module meta object: {id, label, role, enabled, env} — the groups
// id+name pattern applied to modules (stable id, mutable name key)
const { check, page } = require('../helpers');

module.exports = async function (browser, B) {
  // addModule assigns meta (uuid id, defaults); getModuleById resolves the name
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d')); df.start();
      df.addModule('Sub');
      const meta = df.getModuleMeta('Sub');
      const homeMeta = df.getModuleMeta('Home');
      const copy = JSON.parse(JSON.stringify(meta));
      meta.role = 'changed'; // returned copy: mutating it must not touch the store
      return {
        meta: copy,
        homeMeta,
        byId: df.getModuleById(copy.id),
        copyIsolated: df.getModuleMeta('Sub').role
      };
    }).catch(e => ({ err: e.message }));
    check(B, 'addModule assigns meta with uuid id and defaults',
      r.meta && /^[0-9a-f-]{36}$/.test(r.meta.id) && r.meta.label === 'Sub' &&
      r.meta.role === 'flow' && r.meta.enabled === true && r.meta.env && typeof r.meta.env === 'object', r);
    check(B, 'getModuleById resolves the module name', r.byId === 'Sub', r);
    check(B, 'getModuleMeta returns a deep copy', r.copyIsolated === 'flow', r);
    check(B, 'initial Home module also carries meta', r.homeMeta && /^[0-9a-f-]{36}$/.test(r.homeMeta.id), r);
    await p.close();
  } catch (e) { check(B, 'module meta: addModule', false, e.message.split('\n')[0]); }

  // renameModule keeps meta.id; getModuleById resolves the new name
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d')); df.start();
      df.addModule('Old');
      const before = df.getModuleMeta('Old');
      const renamed = df.renameModule('Old', 'New');
      const after = df.getModuleMeta('New');
      return { renamed, before, after, byId: df.getModuleById(before.id), gone: df.getModuleMeta('Old') };
    }).catch(e => ({ err: e.message }));
    check(B, 'renameModule preserves meta.id',
      r.renamed === true && r.after && r.after.id === r.before.id && r.byId === 'New' && r.gone === null, r);
    await p.close();
  } catch (e) { check(B, 'module meta: rename', false, e.message.split('\n')[0]); }

  // setModuleMeta patches whitelisted keys only and dispatches moduleMetaChanged
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d')); df.start();
      let event = null;
      df.on('moduleMetaChanged', m => event = m);
      const patched = df.setModuleMeta('Home', { role: 'subflow', enabled: false, env: { KEY: 'v' }, label: 'Home page', bogus: 'x' });
      const missing = df.setModuleMeta('Nope', { role: 'x' });
      return { patched, event, missing, stored: df.export().drawflow.Home.meta };
    }).catch(e => ({ err: e.message }));
    check(B, 'setModuleMeta patches whitelisted keys and dispatches moduleMetaChanged',
      r.patched && r.patched.role === 'subflow' && r.patched.enabled === false &&
      r.patched.env.KEY === 'v' && r.patched.label === 'Home page' &&
      r.patched.bogus === undefined && r.stored.bogus === undefined &&
      r.event && r.event.id === r.patched.id && r.missing === null, r);
    await p.close();
  } catch (e) { check(B, 'module meta: setModuleMeta', false, e.message.split('\n')[0]); }

  // export/import round-trips meta untouched; legacy modules without meta get back-filled
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d')); df.start();
      df.addModule('Sub');
      df.setModuleMeta('Sub', { role: 'subflow', enabled: false, env: { A: '1' } });
      const metaBefore = df.getModuleMeta('Sub');
      const exported = df.export();
      const df2 = new Drawflow(document.createElement('div'));
      df2.start();
      df2.import(exported, false);
      const roundTrip = df2.getModuleMeta('Sub');
      // legacy data: modules with no meta at all
      const legacy = { drawflow: { Legacy: { data: {} } } };
      let err = null;
      try { df2.import(JSON.parse(JSON.stringify(legacy)), false); } catch (e) { err = e.message; }
      const backfilled = df2.getModuleMeta('Legacy');
      return { metaBefore, roundTrip, err, backfilled };
    }).catch(e => ({ err: e.message }));
    check(B, 'export/import round-trips meta untouched',
      r.roundTrip && JSON.stringify(r.roundTrip) === JSON.stringify(r.metaBefore), r);
    check(B, 'import back-fills meta for legacy modules',
      !r.err && r.backfilled && /^[0-9a-f-]{36}$/.test(r.backfilled.id) &&
      r.backfilled.label === 'Legacy' && r.backfilled.role === 'flow' &&
      r.backfilled.enabled === true && r.backfilled.env && typeof r.backfilled.env === 'object', r);
    await p.close();
  } catch (e) { check(B, 'module meta: import/export', false, e.message.split('\n')[0]); }
};

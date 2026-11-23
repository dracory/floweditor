// Wireless (signal) connections: signal on both sides of the data, no SVG wire,
// port badges, signal events, export/import roundtrip
const { check, page } = require('../helpers');

module.exports = async function (browser, B) {
  // addConnection with a signal: data on both sides, no wire, badges connected
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 0, 1, 100, 100, 'n', {}, 'A');
      df.addNode('b', 1, 0, 400, 100, 'n', {}, 'B');
      const events = [];
      df.on('wirelessConnected', e => events.push(e));
      df.addConnection(1, 2, 'output_1', 'input_1', { signal: 'bus' });
      const data = df.drawflow.drawflow.Home.data;
      const out = data[1].outputs.output_1.connections[0];
      const inp = data[2].inputs.input_1.connections[0];
      return {
        signalOut: out.signal, signalIn: inp.signal,
        nodeOut: out.node, nodeIn: inp.node,
        wires: df.precanvas.querySelectorAll('svg.connection').length,
        badges: df.precanvas.querySelectorAll('.df-wireless-label').length,
        connectedBadges: df.precanvas.querySelectorAll('.df-wireless-label--connected').length,
        badgeText: (df.precanvas.querySelector('.df-wireless-label') || {}).textContent,
        events
      };
    }).catch(e => ({ err: e.message }));
    check(B, 'signal stored on both sides of the connection', r.signalOut === 'bus' && r.signalIn === 'bus', r);
    check(B, 'signal connection draws no SVG wire', r.wires === 0, r);
    check(B, 'both ports show a connected badge with the signal name',
      r.badges === 2 && r.connectedBadges === 2 && r.badgeText === 'bus', r);
    check(B, 'wirelessConnected event carries the signal', r.events && r.events.length === 1 && r.events[0].signal === 'bus', r);
    await p.close();
  } catch (e) { check(B, 'wireless: addConnection signal', false, e.message.split('\n')[0]); }

  // Plain addConnection stays backward compatible; skipDom draws nothing
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 0, 1, 100, 100, 'n', {}, 'A');
      df.addNode('b', 1, 0, 400, 100, 'n', {}, 'B');
      df.addNode('c', 1, 0, 400, 300, 'n', {}, 'C');
      df.addConnection(1, 2, 'output_1', 'input_1'); // no options
      df.addConnection(1, 3, 'output_1', 'input_1', { skipDom: true });
      const data = df.drawflow.drawflow.Home.data;
      return {
        wired: data[1].outputs.output_1.connections.length,
        wiredIn: data[3].inputs.input_1.connections.length,
        wires: df.precanvas.querySelectorAll('svg.connection').length,
        sig: data[1].outputs.output_1.connections[1].signal
      };
    }).catch(e => ({ err: e.message }));
    check(B, 'addConnection without options still draws and saves', r.wired === 2 && r.wires === 1, r);
    check(B, 'skipDom writes data without a wire and no signal', r.wiredIn === 1 && r.sig === undefined, r);
    await p.close();
  } catch (e) { check(B, 'wireless: options compatibility', false, e.message.split('\n')[0]); }

  // setPortSignal: pending badge (not connected), signalAssigned event; connectSignal links by name
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 0, 1, 100, 100, 'n', {}, 'A');
      df.addNode('b', 1, 0, 400, 100, 'n', {}, 'B');
      const events = [];
      df.on('signalAssigned', e => events.push(e));
      df.setPortSignal(1, 'output_1', 'output', 'clock');
      const pending = {
        signal: df.getPortSignal(1, 'output_1', 'output'),
        badge: !!df.precanvas.querySelector('#node-1 .df-wireless-label'),
        connected: !!df.precanvas.querySelector('#node-1 .df-wireless-label--connected')
      };
      const linked = df.connectSignal(2, 'input_1', 'input', 'clock');
      const after = {
        linkedCount: linked.length,
        linkedNode: linked[0] && linked[0].nodeId,
        connSignal: df.drawflow.drawflow.Home.data[2].inputs.input_1.connections[0].signal,
        wires: df.precanvas.querySelectorAll('svg.connection').length,
        connectedBadges: df.precanvas.querySelectorAll('.df-wireless-label--connected').length,
        signals: df.listSignals(),
        endpoints: df.listSignalEndpoints(1, 'output_1', 'output').length
      };
      return { pending, after, events };
    }).catch(e => ({ err: e.message }));
    check(B, 'setPortSignal assigns a pending badge, signalAssigned fires',
      r.pending && r.pending.signal === 'clock' && r.pending.badge && !r.pending.connected
      && r.events && r.events.length >= 1 && r.events[0].signal === 'clock', r);
    check(B, 'connectSignal links the named port to the matching endpoint',
      r.after && r.after.linkedCount === 1 && r.after.linkedNode === '1' && r.after.connSignal === 'clock', r);
    check(B, 'linked by signal: still no wire, both badges connected', r.after && r.after.wires === 0 && r.after.connectedBadges === 2, r);
    check(B, 'listSignals sees the signal', r.after && r.after.signals.includes('clock'), r);
    await p.close();
  } catch (e) { check(B, 'wireless: setPortSignal/connectSignal', false, e.message.split('\n')[0]); }

  // Badge click dispatches signalRequest for the app UI (no built-in dialog)
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 0, 1, 100, 100, 'n', {}, 'A');
      df.setPortSignal(1, 'output_1', 'output', 'req');
      return new Promise(resolve => {
        df.on('signalRequest', e => resolve(e));
        df.precanvas.querySelector('#node-1 .df-wireless-label').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        setTimeout(() => resolve(null), 1000);
      });
    }).catch(e => ({ err: e.message }));
    check(B, 'badge click dispatches signalRequest with the port ref',
      r && r.nodeId === '1' && r.portClass === 'output_1' && r.type === 'output' && r.signal === 'req', r);
    await p.close();
  } catch (e) { check(B, 'wireless: signalRequest', false, e.message.split('\n')[0]); }

  // export/import roundtrip: signal survives, badges restored, still no wire
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 0, 1, 100, 100, 'n', {}, 'A');
      df.addNode('b', 1, 0, 400, 100, 'n', {}, 'B');
      df.addConnection(1, 2, 'output_1', 'input_1', { signal: 'bus' });
      const exported = df.export();
      df.import(exported);
      const data = df.drawflow.drawflow.Home.data;
      return {
        signalOut: data[1].outputs.output_1.connections[0].signal,
        signalIn: data[2].inputs.input_1.connections[0].signal,
        exportedSignal: exported.drawflow.Home.data[1].outputs.output_1.connections[0].signal,
        wires: df.precanvas.querySelectorAll('svg.connection').length,
        badges: df.precanvas.querySelectorAll('.df-wireless-label').length,
        connectedBadges: df.precanvas.querySelectorAll('.df-wireless-label--connected').length
      };
    }).catch(e => ({ err: e.message }));
    check(B, 'signal survives export() and import()', r.signalOut === 'bus' && r.signalIn === 'bus' && r.exportedSignal === 'bus', r);
    check(B, 'import restores badges, draws no wire', r.wires === 0 && r.badges === 2 && r.connectedBadges === 2, r);
    await p.close();
  } catch (e) { check(B, 'wireless: export/import', false, e.message.split('\n')[0]); }

  // import of hand-written data (no port.wireless, only connection.signal)
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.import({ drawflow: { Home: { data: {
        '1': node(1, {}, { output_1: { connections: [{ node: '2', output: 'input_1', signal: 'x' }] } }, 100, 100),
        '2': node(2, { input_1: { connections: [{ node: '1', input: 'output_1', signal: 'x' }] } }, {}, 400, 100)
      }}}});
      return {
        badge: (df.precanvas.querySelector('#node-1 .df-wireless-label') || {}).textContent,
        connected: df.precanvas.querySelectorAll('.df-wireless-label--connected').length,
        wires: df.precanvas.querySelectorAll('svg.connection').length
      };
    }).catch(e => ({ err: e.message }));
    check(B, 'imported connection.signal alone renders connected badges',
      r && r.badge === 'x' && r.connected === 2 && r.wires === 0, r);
    await p.close();
  } catch (e) { check(B, 'wireless: import raw data', false, e.message.split('\n')[0]); }

  // Removing a signal connection: data cleaned, wirelessDisconnected, badge pending again
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 0, 1, 100, 100, 'n', {}, 'A');
      df.addNode('b', 1, 0, 400, 100, 'n', {}, 'B');
      const events = [];
      df.on('wirelessDisconnected', e => events.push(e));
      df.addConnection(1, 2, 'output_1', 'input_1', { signal: 'bus' });
      const ok = df.removeSingleConnection(1, 2, 'output_1', 'input_1');
      const data = df.drawflow.drawflow.Home.data;
      return {
        ok,
        outConns: data[1].outputs.output_1.connections.length,
        inConns: data[2].inputs.input_1.connections.length,
        badges: df.precanvas.querySelectorAll('.df-wireless-label').length,
        connectedBadges: df.precanvas.querySelectorAll('.df-wireless-label--connected').length,
        events
      };
    }).catch(e => ({ err: e.message }));
    check(B, 'removeSingleConnection removes a wireless connection', r.ok === true && r.outConns === 0 && r.inConns === 0, r);
    check(B, 'wirelessDisconnected fires; badges drop the connected state',
      r.events && r.events.length === 1 && r.events[0].signal === 'bus' && r.connectedBadges === 0, r);
    await p.close();
  } catch (e) { check(B, 'wireless: removeSingleConnection', false, e.message.split('\n')[0]); }

  // removeNodeId also removes wireless connections (no .connection element existed)
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 0, 1, 100, 100, 'n', {}, 'A');
      df.addNode('b', 1, 0, 400, 100, 'n', {}, 'B');
      df.addConnection(1, 2, 'output_1', 'input_1', { signal: 'bus' });
      df.removeNodeId(2);
      const data = df.drawflow.drawflow.Home.data;
      return {
        remaining: data[1].outputs.output_1.connections.length,
        nodeGone: data[2] === undefined
      };
    }).catch(e => ({ err: e.message }));
    check(B, 'removeNodeId cleans wireless connections from the data', r && r.remaining === 0 && r.nodeGone, r);
    await p.close();
  } catch (e) { check(B, 'wireless: removeNodeId', false, e.message.split('\n')[0]); }

  // Clearing a signal removes signal from both sides and drops the badge
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 0, 1, 100, 100, 'n', {}, 'A');
      df.addNode('b', 1, 0, 400, 100, 'n', {}, 'B');
      df.addConnection(1, 2, 'output_1', 'input_1', { signal: 'bus' });
      df.setPortSignal(1, 'output_1', 'output', null);
      const data = df.drawflow.drawflow.Home.data;
      return {
        outSig: data[1].outputs.output_1.connections[0].signal,
        inSig: data[2].inputs.input_1.connections[0].signal,
        conns: data[1].outputs.output_1.connections.length,
        badges: df.precanvas.querySelectorAll('.df-wireless-label').length,
        outBadge: !!df.precanvas.querySelector('#node-1 .df-wireless-label'),
        inBadge: !!df.precanvas.querySelector('#node-2 .df-wireless-label'),
        signals: df.listSignals()
      };
    }).catch(e => ({ err: e.message }));
    // The link data stays (no wire back either); the peer keeps its pending
    // name and badge, only the cleared port loses it
    check(B, 'clearing a port signal clears it on both sides, keeps the link data',
      r && r.outSig === undefined && r.inSig === undefined && r.conns === 1
      && !r.outBadge && r.inBadge && r.badges === 1 && r.signals.includes('bus'), r);
    await p.close();
  } catch (e) { check(B, 'wireless: clear signal', false, e.message.split('\n')[0]); }
};

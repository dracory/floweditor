// Edge auto-pan while dragging nodes/wires near the container edge
// (autoPanEdgeMargin/autoPanSpeed/autoPanMode) and zoomFit per-side padding
const { check, page } = require('../helpers');

module.exports = async function (browser, B) {
  // Dragging a node held at the right edge pans the canvas; mouseup stops it
  try {
    const p = await page(browser);
    await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.autoPanEdgeMargin = 60;
      df.autoPanSpeed = 40;
      df.start();
      df.addNode('a', 1, 1, 100, 100, 'n', {}, 'A');
      window.__df = df;
    });
    const node = await p.locator('#node-1').boundingBox();
    await p.mouse.move(node.x + node.width / 2, node.y + node.height / 2);
    await p.mouse.down();
    await p.mouse.move(995, 350, { steps: 4 }); // inside the 60px right margin
    const before = await p.evaluate(() => window.__df.canvas_x);
    await p.waitForTimeout(400);
    const during = await p.evaluate(() => window.__df.canvas_x);
    await p.mouse.up();
    const after = await p.evaluate(() => window.__df.canvas_x);
    await p.waitForTimeout(300);
    const still = await p.evaluate(() => window.__df.canvas_x);
    check(B, 'node drag near right edge auto-pans the canvas (canvas_x decreases)',
      during < before, { before, during });
    check(B, 'auto-pan stops on mouseup', still === after, { after, still });
    await p.close();
  } catch (e) { check(B, 'auto-pan: node drag', false, e.message.split('\n')[0]); }

  // Dragging a wire held at the bottom edge pans the canvas vertically
  try {
    const p = await page(browser);
    await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.autoPanEdgeMargin = 60;
      df.autoPanSpeed = 40;
      df.start();
      df.addNode('a', 1, 1, 100, 100, 'n', {}, 'A');
      df.addNode('b', 1, 1, 500, 500, 'n', {}, 'B');
      window.__df = df;
    });
    const out = await p.locator('#node-1 .output').boundingBox();
    await p.mouse.move(out.x + out.width / 2, out.y + out.height / 2);
    await p.mouse.down();
    await p.mouse.move(500, 695, { steps: 4 }); // inside the 60px bottom margin
    const before = await p.evaluate(() => window.__df.canvas_y);
    await p.waitForTimeout(400);
    const during = await p.evaluate(() => window.__df.canvas_y);
    await p.mouse.up();
    const after = await p.evaluate(() => window.__df.canvas_y);
    await p.waitForTimeout(300);
    const still = await p.evaluate(() => window.__df.canvas_y);
    check(B, 'wire drag near bottom edge auto-pans the canvas (canvas_y decreases)',
      during < before, { before, during });
    check(B, 'auto-pan stops after wire drop', still === after, { after, still });
    await p.close();
  } catch (e) { check(B, 'auto-pan: wire drag', false, e.message.split('\n')[0]); }

  // autoPanEdgeMargin 0 disables; autoPanMode 'node' skips wire drags
  try {
    const p = await page(browser);
    const r = await p.evaluate(async () => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 1, 1, 100, 100, 'n', {}, 'A');
      // margin 0: autoPanUpdate computes no delta
      df.autoPanEdgeMargin = 0;
      df.drag = true;
      df.autoPanUpdate(999, 350);
      const disabled = df.auto_pan_delta === null && df.auto_pan_raf === null;
      df.drag = false;
      // mode 'node': a wire drag is ignored
      df.autoPanEdgeMargin = 60;
      df.autoPanMode = 'node';
      df.connection = true;
      df.autoPanUpdate(999, 350);
      const wireSkipped = df.auto_pan_delta === null;
      // mode 'connection': a node drag is ignored
      df.autoPanMode = 'connection';
      df.connection = false;
      df.drag = true;
      df.autoPanUpdate(999, 350);
      const nodeSkipped = df.auto_pan_delta === null;
      df.drag = false;
      // back to 'all': a node drag at the edge pans right-edge direction (dx < 0)
      df.autoPanMode = 'all';
      df.drag = true;
      df.autoPanUpdate(999, 350);
      const right = df.auto_pan_delta && df.auto_pan_delta.dx < 0 && df.auto_pan_delta.dy === 0;
      df.autoPanUpdate(500, 5);
      const top = df.auto_pan_delta && df.auto_pan_delta.dy > 0;
      df.autoPanStop();
      return { disabled, wireSkipped, nodeSkipped, right, top };
    }).catch(e => ({ err: e.message }));
    check(B, 'autoPanEdgeMargin 0 disables auto-pan', r.disabled === true, r);
    check(B, "autoPanMode 'node' ignores wire drags; 'connection' ignores node drags",
      r.wireSkipped === true && r.nodeSkipped === true, r);
    check(B, 'auto-pan direction: right edge pans left, top edge pans up',
      r.right === true && r.top === true, r);
    await p.close();
  } catch (e) { check(B, 'auto-pan: options', false, e.message.split('\n')[0]); }

  // cancelPointer (window blur mid-drag) also stops the pan
  try {
    const p = await page(browser);
    const r = await p.evaluate(async () => {
      const df = new Drawflow(document.getElementById('d'));
      df.autoPanEdgeMargin = 60;
      df.autoPanSpeed = 40;
      df.start();
      df.addNode('a', 1, 1, 100, 100, 'n', {}, 'A');
      df.drag = true;
      df.ele_selected = df.container.querySelector('#node-1');
      df.autoPanUpdate(999, 350);
      const started = df.auto_pan_delta !== null;
      df.cancelPointer();
      return { started, delta: df.auto_pan_delta, raf: df.auto_pan_raf };
    }).catch(e => ({ err: e.message }));
    check(B, 'cancelPointer stops a running auto-pan',
      r.started === true && r.delta === null && r.raf === null, r);
    await p.close();
  } catch (e) { check(B, 'auto-pan: cancelPointer', false, e.message.split('\n')[0]); }

  // zoomFit() unchanged: symmetric padding; zoomFit(20,40,20,40) asymmetric
  try {
    const p = await page(browser);
    const r = await p.evaluate(() => {
      const df = new Drawflow(document.getElementById('d'));
      df.start();
      df.addNode('a', 1, 1, 100, 100, 'n', {}, 'A');
      df.addNode('b', 1, 1, 600, 400, 'n', {}, 'B');
      const measure = () => {
        const c = df.container.getBoundingClientRect();
        let l = Infinity, t = Infinity, rt = -Infinity, bt = -Infinity;
        df.precanvas.querySelectorAll('.drawflow-node').forEach(n => {
          const b = n.getBoundingClientRect();
          l = Math.min(l, b.left); t = Math.min(t, b.top);
          rt = Math.max(rt, b.right); bt = Math.max(bt, b.bottom);
        });
        return { left: l - c.left, right: c.right - rt, top: t - c.top, bottom: c.bottom - bt };
      };
      df.zoomFit();
      const sym = measure();
      df.zoomFit(10, 20, 30, 40); // top, right, bottom, left
      const asym = measure();
      df.zoomFit({ padding: 30, paddingLeft: 90 });
      const opt = measure();
      return { sym, asym, opt };
    }).catch(e => ({ err: e.message }));
    const close = (a, b) => Math.abs(a - b) < 3;
    check(B, 'zoomFit() keeps symmetric margins',
      r.sym && close(r.sym.left, r.sym.right) && close(r.sym.top, r.sym.bottom), r);
    check(B, 'zoomFit(10,20,30,40) leaves per-side margins (left-right=20, top-bottom=-20)',
      r.asym && close(r.asym.left - r.asym.right, 20) && close(r.asym.top - r.asym.bottom, -20), r);
    check(B, 'zoomFit({padding:30, paddingLeft:90}) mixes object and per-side padding',
      r.opt && close(r.opt.left - r.opt.right, 60), r);
    await p.close();
  } catch (e) { check(B, 'zoomFit padding', false, e.message.split('\n')[0]); }
};

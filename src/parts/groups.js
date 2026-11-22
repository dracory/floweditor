/* Node groups: per-module visual containers stored in
   drawflow.drawflow[module].groups = {id: {id, name, nodeIds[],
   x, y, w, h}}. They ride along in export()/import() like nodes. */
export default {
  groupStore(moduleName) {
    const mod = this.drawflow.drawflow[moduleName || this.module];
    if (!mod) return {};
    if (!mod.groups) mod.groups = {};
    return mod.groups;
  },

  groupList(moduleName) {
    return Object.values(this.groupStore(moduleName));
  },

  getModuleFromGroupId(id) {
    var nameModule;
    const editor = this.drawflow.drawflow;
    Object.keys(editor).map(function(moduleName, index) {
      const groups = editor[moduleName].groups || {};
      Object.keys(groups).map(function(gid, index2) {
        if(gid == id) {
          nameModule = moduleName;
        }
      })
    });
    return nameModule;
  },

  getGroupFromId(id) {
    var moduleName = this.getModuleFromGroupId(id);
    if (!moduleName) return null;
    return JSON.parse(JSON.stringify(this.groupStore(moduleName)[id]));
  },

  addGroup(name, nodeIds) {
    const id = this.getUuid();
    this.groupStore(this.module)[id] = {
      id: id,
      name: name || 'group',
      nodeIds: (nodeIds || []).map(String),
      x: null, y: null, w: null, h: null
    };
    this.renderGroups();
    this.dispatch('groupCreated', this.getGroupFromId(id));
    return id;
  },

  removeGroup(id) {
    var moduleName = this.getModuleFromGroupId(id);
    if (!moduleName) return false;
    delete this.groupStore(moduleName)[id];
    if (moduleName === this.module) this.renderGroups();
    this.dispatch('groupRemoved', id);
    return true;
  },

  updateGroup(id, patch) {
    var moduleName = this.getModuleFromGroupId(id);
    if (!moduleName) return null;
    const g = this.groupStore(moduleName)[id];
    ['name', 'x', 'y', 'w', 'h'].forEach(k => {
      if (patch[k] !== undefined) g[k] = patch[k];
    });
    if (patch.nodeIds !== undefined) g.nodeIds = patch.nodeIds.map(String);
    if (moduleName === this.module) this.renderGroups();
    this.dispatch('groupUpdated', this.getGroupFromId(id));
    return this.getGroupFromId(id);
  },

  addNodeToGroup(groupId, nodeId) {
    var moduleName = this.getModuleFromGroupId(groupId);
    if (!moduleName) return false;
    const g = this.groupStore(moduleName)[groupId];
    const id = String(nodeId);
    if (g.nodeIds.indexOf(id) === -1) {
      g.nodeIds.push(id);
      if (moduleName === this.module) this.renderGroups();
      this.dispatch('groupMembershipChanged', { groupId: groupId, nodeId: id, module: moduleName, member: true });
    }
    return true;
  },

  removeNodeFromGroup(groupId, nodeId) {
    var moduleName = this.getModuleFromGroupId(groupId);
    if (!moduleName) return false;
    const g = this.groupStore(moduleName)[groupId];
    const id = String(nodeId);
    const kept = g.nodeIds.filter(m => m !== id);
    if (kept.length === g.nodeIds.length) return true;
    if (kept.length === 0) {
      this.removeGroup(groupId);
      return true;
    }
    g.nodeIds = kept;
    if (moduleName === this.module) this.renderGroups();
    this.dispatch('groupMembershipChanged', { groupId: groupId, nodeId: id, module: moduleName, member: false });
    return true;
  },

  /* Membership cleanup on node removal: the deleted node leaves every
     group in its module; empty groups are dropped. */
  purgeGroupMember(moduleName, nodeId) {
    const groups = this.groupStore(moduleName);
    const id = String(nodeId);
    let changed = false;
    Object.keys(groups).forEach(gid => {
      const g = groups[gid];
      const kept = (g.nodeIds || []).filter(m => m !== id);
      if (kept.length !== (g.nodeIds || []).length) {
        changed = true;
        if (kept.length === 0) {
          delete groups[gid];
          this.dispatch('groupRemoved', gid);
        } else {
          g.nodeIds = kept;
          this.dispatch('groupMembershipChanged', { groupId: gid, nodeId: id, module: moduleName, member: false });
        }
      }
    });
    if (changed && moduleName === this.module) this.renderGroups();
  },

  /* Live extent (world coords) of a group's resolvable members, or
     null when none resolve. Keeps manual resizes from shrinking the
     box below its members. */
  groupMemberExtent(g, moduleName) {
    const data = (this.drawflow.drawflow[moduleName || this.module] || {}).data || {};
    const NODE_W = this.groupNodeSize.w, NODE_H = this.groupNodeSize.h;
    let right = -Infinity, bottom = -Infinity;
    (g.nodeIds || []).forEach(nid => {
      const n = data[nid];
      if (!n) return;
      right = Math.max(right, n.pos_x + NODE_W);
      bottom = Math.max(bottom, n.pos_y + NODE_H);
    });
    return right === -Infinity ? null : { right, bottom };
  },

  /* Group rectangle: stored geometry when manually resized, otherwise
     derived from member positions plus padding. */
  groupBounds(g, moduleName) {
    if (g.w && g.h) return { x: g.x || 0, y: g.y || 0, w: g.w, h: g.h };
    const data = (this.drawflow.drawflow[moduleName || this.module] || {}).data || {};
    const NODE_W = this.groupNodeSize.w, NODE_H = this.groupNodeSize.h, PAD = 24, LABEL_H = 26;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (g.nodeIds || []).forEach(nid => {
      const n = data[nid];
      if (!n) return;
      minX = Math.min(minX, n.pos_x);
      minY = Math.min(minY, n.pos_y);
      maxX = Math.max(maxX, n.pos_x + NODE_W);
      maxY = Math.max(maxY, n.pos_y + NODE_H);
    });
    if (minX === Infinity) {
      return { x: g.x || 0, y: g.y || 0, w: g.w || 120, h: g.h || 90 };
    }
    return {
      x: minX - PAD,
      y: minY - PAD - LABEL_H,
      w: (maxX - minX) + PAD * 2,
      h: (maxY - minY) + PAD * 2 + LABEL_H
    };
  },

  /* Paint layer for group boxes: first child of precanvas so it
     renders UNDER the module node divs. Never captures events. */
  groupPaintLayer() {
    if (this.groupPaintEl && this.groupPaintEl.isConnected) {
      return this.groupPaintEl;
    }
    const layer = document.createElement('div');
    layer.className = 'drawflow-group-layer';
    this.precanvas.prepend(layer);
    this.groupPaintEl = layer;
    return layer;
  },

  /* UI layer for the interactive handles (label bar, resize grip):
     kept as the last child of precanvas; pointer-events none except
     on the handle elements so member-node clicks pass through. */
  groupUiLayer() {
    if (this.groupUiEl && this.groupUiEl.isConnected) {
      return this.groupUiEl;
    }
    const layer = document.createElement('div');
    layer.className = 'drawflow-group-ui';
    this.precanvas.appendChild(layer);
    this.groupUiEl = layer;
    return layer;
  },

  /* Redraw the group layer for the active module. */
  renderGroups() {
    if (!this.precanvas) return;
    const paint = this.groupPaintLayer();
    const ui = this.groupUiLayer();
    this.precanvas.appendChild(ui); // keep the UI layer last
    paint.innerHTML = '';
    ui.innerHTML = '';
    Object.values(this.groupStore(this.module))
      .filter(g => this.groupMemberExtent(g) !== null)
      .forEach(g => {
        const b = this.groupBounds(g);
        const el = document.createElement('div');
        el.className = 'drawflow-group';
        el.style.left = b.x + 'px';
        el.style.top = b.y + 'px';
        el.style.width = b.w + 'px';
        el.style.height = b.h + 'px';
        paint.appendChild(el);

        // Interactive overlay: only the label bar and resize grip
        // take events; the rest of the box is transparent to clicks.
        const overlay = document.createElement('div');
        overlay.className = 'drawflow-group-overlay';
        overlay.style.left = b.x + 'px';
        overlay.style.top = b.y + 'px';
        overlay.style.width = b.w + 'px';
        overlay.style.height = b.h + 'px';
        const label = document.createElement('div');
        label.className = 'drawflow-group-label';
        label.textContent = g.name || 'group';
        label.title = 'Double-click to rename';
        label.addEventListener('dblclick', ev => {
          ev.stopPropagation();
          this.dispatch('groupLabelDblclick', JSON.parse(JSON.stringify(g)));
        });
        const handle = document.createElement('div');
        handle.className = 'drawflow-group-resize';
        overlay.appendChild(label);
        overlay.appendChild(handle);
        ui.appendChild(overlay);
        this.attachGroupDrag(label, g, el, overlay);
        this.attachGroupResize(handle, g, el, overlay);
      });
  },

  /* Dragging the group (by its label bar) moves every member node:
     update the data position and DOM style, then refresh the attached
     edges via updateConnectionNodes. */
  attachGroupDrag(el, g, paintEl, overlay) {
    el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 || ev.target.closest('.drawflow-group-resize')) return;
      ev.stopPropagation();
      ev.preventDefault();
      const zoom = this.zoom || 1;
      const data = (this.drawflow.drawflow[this.module] || {}).data || {};
      const members = (g.nodeIds || [])
        .filter(nid => data[nid])
        .map(nid => ({ id: nid, x: data[nid].pos_x, y: data[nid].pos_y }));
      const b = this.groupBounds(g);
      const start = { x: ev.clientX, y: ev.clientY, bx: b.x, by: b.y };
      const onMove = me => {
        const dx = (me.clientX - start.x) / zoom;
        const dy = (me.clientY - start.y) / zoom;
        members.forEach(m => {
          const n = data[m.id];
          n.pos_x = m.x + dx;
          n.pos_y = m.y + dy;
          const nodeEl = document.getElementById('node-' + m.id);
          if (nodeEl) {
            nodeEl.style.left = n.pos_x + 'px';
            nodeEl.style.top = n.pos_y + 'px';
          }
          this.updateConnectionNodes('node-' + m.id);
        });
        // Move the box in place; a full re-render on every
        // pointermove would churn DOM/listeners.
        if (g.w && g.h) { g.x = start.bx + dx; g.y = start.by + dy; }
        [paintEl, overlay].forEach(o => {
          o.style.left = (start.bx + dx) + 'px';
          o.style.top = (start.by + dy) + 'px';
        });
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        this.renderGroups();
        this.dispatch('groupMoved', this.getGroupFromId(g.id));
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  },

  /* Bottom-right handle: manual resize stores explicit w/h (auto
     bounds resume on the next member move). */
  attachGroupResize(handle, g, paintEl, overlay) {
    handle.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      ev.preventDefault();
      const zoom = this.zoom || 1;
      const b = this.groupBounds(g);
      const start = { x: ev.clientX, y: ev.clientY, w: b.w, h: b.h };
      const onMove = me => {
        // Keep the box (and its grip) clear of member nodes: never
        // shrink below their extent plus pad
        const ext = this.groupMemberExtent(g);
        const minW = ext ? Math.max(60, ext.right - b.x + 24) : 60;
        const minH = ext ? Math.max(60, ext.bottom - b.y + 24) : 60;
        g.x = b.x;
        g.y = b.y;
        g.w = Math.max(minW, start.w + (me.clientX - start.x) / zoom);
        g.h = Math.max(minH, start.h + (me.clientY - start.y) / zoom);
        [paintEl, overlay].forEach(o => {
          o.style.width = g.w + 'px';
          o.style.height = g.h + 'px';
        });
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        this.renderGroups();
        this.dispatch('groupResized', this.getGroupFromId(g.id));
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  },

  /* Drop-time group membership: the node's center decides. Inside a
     group rect it joins; a member whose center rests outside leaves.
     Smallest containing group wins when rects overlap. Runs from
     dragEnd, once per drop; a member drag also re-derives its group's
     bounds (clears any manual resize so the box hugs members again). */
  settleGroupMembership(nodeId) {
    const id = String(nodeId);
    const data = (this.drawflow.drawflow[this.module] || {}).data || {};
    const n = data[id];
    if (!n) return;
    const c = { x: n.pos_x + this.groupNodeSize.w / 2, y: n.pos_y + this.groupNodeSize.h / 2 };
    const groups = this.groupStore(this.module);
    const containing = Object.values(groups)
      .filter(g => {
        const b = this.groupBounds(g);
        return c.x >= b.x && c.x <= b.x + b.w &&
               c.y >= b.y && c.y <= b.y + b.h;
      })
      .sort((a, b) => {
        const ba = this.groupBounds(a), bb = this.groupBounds(b);
        return (ba.w * ba.h) - (bb.w * bb.h);
      });
    let changed = false;
    Object.values(groups).forEach(g => {
      const isMember = (g.nodeIds || []).indexOf(id) !== -1;
      if (isMember) {
        // A member drag re-derives the group's bounds
        g.x = g.y = null;
        g.w = g.h = null;
      }
      if (isMember && containing[0] !== g) {
        g.nodeIds = g.nodeIds.filter(m => m !== id);
        changed = true;
        this.dispatch('groupMembershipChanged', { groupId: g.id, nodeId: id, module: this.module, member: false });
      } else if (!isMember && containing[0] === g) {
        g.nodeIds = [...(g.nodeIds || []), id];
        changed = true;
        this.dispatch('groupMembershipChanged', { groupId: g.id, nodeId: id, module: this.module, member: true });
      }
    });
    // Empty groups are dropped, same rule as purgeGroupMember
    Object.keys(groups).forEach(gid => {
      if ((groups[gid].nodeIds || []).length === 0) {
        delete groups[gid];
        changed = true;
        this.dispatch('groupRemoved', gid);
      }
    });
    if (changed) this.renderGroups();
    else {
      // Manual resize may have been cleared above without a
      // membership change; repaint so the box hugs members again.
      const touched = Object.values(groups).some(g => (g.nodeIds || []).indexOf(id) !== -1);
      if (touched) this.renderGroups();
    }
  },
};

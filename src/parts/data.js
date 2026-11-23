// Modules, import and export
export default {
  /* Per-module metadata, same pattern as node groups (stable id +
     mutable name): drawflow.drawflow[name].meta = {id, label, role,
     enabled, env}. The id survives renameModule; the key stays a
     mutable name. Rides along in export()/import() untouched;
     legacy modules without meta get back-filled on import. */
  moduleMetaDefaults(name) {
    return {
      id: this.getUuid(),
      label: String(name),
      role: 'flow',
      enabled: true,
      env: {}
    };
  },

  /* Lazily creates/fills a module's meta, like groupStore does for
     the groups map. Returns the live meta object (or null when the
     module does not exist). */
  ensureModuleMeta(moduleName) {
    const mod = this.drawflow.drawflow[moduleName];
    if (!mod) return null;
    const defaults = this.moduleMetaDefaults(moduleName);
    if (!mod.meta) mod.meta = {};
    ['id', 'label', 'role', 'enabled', 'env'].forEach(k => {
      if (mod.meta[k] === undefined) mod.meta[k] = defaults[k];
    });
    return mod.meta;
  },

  getModuleMeta(name) {
    const mod = this.drawflow.drawflow[name];
    if (!mod) return null;
    return JSON.parse(JSON.stringify(this.ensureModuleMeta(name)));
  },

  setModuleMeta(name, patch) {
    const meta = this.ensureModuleMeta(name);
    if (!meta) return null;
    patch = patch || {};
    ['id', 'label', 'role', 'enabled', 'env'].forEach(k => {
      if (patch[k] !== undefined) meta[k] = patch[k];
    });
    this.dispatch('moduleMetaChanged', this.getModuleMeta(name));
    return this.getModuleMeta(name);
  },

  /* Module name by meta.id, mirror of getModuleFromGroupId. The id is
     stable across renameModule; the returned name is the current key. */
  getModuleById(id) {
    var nameModule;
    const editor = this.drawflow.drawflow;
    Object.keys(editor).map(function(moduleName, index) {
      const meta = editor[moduleName].meta;
      if (meta && meta.id == id) {
        nameModule = moduleName;
      }
    });
    return nameModule;
  },

  getModuleFromNodeId(id) {
    id = this.nodeKey(id);
    var nameModule;
    const editor = this.drawflow.drawflow
    Object.keys(editor).map(function(moduleName, index) {
      Object.keys(editor[moduleName].data).map(function(node, index2) {
        if(node == id) {
          nameModule = moduleName;
        }
      })
    });
    return nameModule;
  },

  addModule(name) {
    this.drawflow.drawflow[name] =  { "data": {}, "groups": {}, "meta": this.moduleMetaDefaults(name) };
    this.dispatch('moduleCreated', name);
  },

  changeModule(name) {
    this.dispatch('moduleChanging', name);
    this.module = name;
    this.precanvas.innerHTML = "";
    this.canvas_x = 0;
    this.canvas_y = 0;
    this.pos_x = 0;
    this.pos_y = 0;
    this.mouse_x = 0;
    this.mouse_y = 0;
    this.zoom = 1;
    this.zoom_last_value = 1;
    this.precanvas.style.transform = '';
    this.import(this.drawflow, false);
    this.dispatch('moduleChanged', name);
  },

  renameModule(oldName, newName) {
    oldName = String(oldName).trim();
    newName = String(newName).trim();
    if (newName === '' || newName === oldName || !this.drawflow.drawflow[oldName] || this.drawflow.drawflow[newName]) {
      return false;
    }
    const modules = {};
    // The module object rides along untouched: meta.id (and the rest
    // of meta) survives the rename. Display name = meta.label or key.
    for (const key in this.drawflow.drawflow) {
      modules[key === oldName ? newName : key] = this.drawflow.drawflow[key];
    }
    this.drawflow.drawflow = modules;
    if (this.module === oldName) {
      this.module = newName;
    }
    this.dispatch('moduleRenamed', { oldName: oldName, newName: newName });
    return true;
  },

  removeModule(name) {
    delete this.drawflow.drawflow[name];
    if(this.module === name) {
      // Removing the module on screen: show another one (or an empty 'Home')
      const modules = Object.keys(this.drawflow.drawflow);
      if(modules.length === 0) {
        this.drawflow.drawflow['Home'] = { "data": {}, "groups": {}, "meta": this.moduleMetaDefaults('Home') };
      }
      this.changeModule(modules.length > 0 ? modules[0] : 'Home');
    }
    this.dispatch('moduleRemoved', name);
  },

  clearModuleSelected() {
    if(this.resize_observer) {
      this.resize_observer.disconnect();
      this.resize_observer.observe(this.container);
    }
    this.precanvas.innerHTML = "";
    // Clearing the board keeps the module identity (meta.id survives)
    const meta = (this.drawflow.drawflow[this.module] || {}).meta || this.moduleMetaDefaults(this.module);
    this.drawflow.drawflow[this.module] =  { "data": {}, "groups": {}, "meta": meta };
  },

  clear () {
    if(this.resize_observer) {
      this.resize_observer.disconnect();
      this.resize_observer.observe(this.container);
    }
    this.precanvas.innerHTML = "";
    this.drawflow = { "drawflow": { "Home": { "data": {}, "groups": {}, "meta": this.moduleMetaDefaults('Home') }}};
    this.module = 'Home';
  },

  export () {
    const dataExport = JSON.parse(JSON.stringify(this.drawflow));
    this.dispatch('export', dataExport);
    return dataExport;
  },

  import (data, notifi = true) {
    const module = this.module; // clear() goes back to 'Home'
    this.clear();
    this.module = module;
    this.drawflow = JSON.parse(JSON.stringify(data));
    // Legacy modules without meta get back-filled (id + defaults)
    Object.keys(this.drawflow.drawflow).forEach(moduleName => this.ensureModuleMeta(moduleName));
    this.repairConnections();
    if(this.drawflow.drawflow[this.module] === undefined) {
      // Data without the current module (ex. without 'Home'): show the first one
      const modules = Object.keys(this.drawflow.drawflow);
      if(modules.length > 0) {
        this.module = modules[0];
      } else {
        this.drawflow.drawflow[this.module] = { "data": {}, "groups": {}, "meta": this.moduleMetaDefaults(this.module) };
      }
    }
    this.load();
    if(notifi) {
      this.dispatch('import', 'import');
    }
  },

  // Imported data: node ids as text, no duplicated connections, and every connection present on
  // both sides (output and input). The input side is the one drawn; reroute points live on the output side.
  repairConnections() {
    Object.keys(this.drawflow.drawflow).forEach(moduleName => {
      const data = this.drawflow.drawflow[moduleName].data || {};
      const valid = {};
      Object.keys(data).forEach(id => {
        Object.keys(data[id].inputs || {}).forEach(input_class => {
          const seen = {};
          data[id].inputs[input_class].connections = data[id].inputs[input_class].connections.filter(item => {
            const key = String(item.node) + ' ' + item.input;
            const source = data[item.node];
            if(seen[key] || source === undefined || source.outputs === undefined || source.outputs[item.input] === undefined) {
              return false;
            }
            seen[key] = true;
            item.node = String(item.node);
            valid[item.node + ' ' + item.input + ' ' + id + ' ' + input_class] = true;
            return true;
          });
        });
      });
      Object.keys(data).forEach(id => {
        Object.keys(data[id].outputs || {}).forEach(output_class => {
          const seen = {};
          data[id].outputs[output_class].connections = data[id].outputs[output_class].connections.filter(item => {
            const key = id + ' ' + output_class + ' ' + String(item.node) + ' ' + item.output;
            if(seen[key] || !valid[key]) {
              return false;
            }
            seen[key] = true;
            item.node = String(item.node);
            return true;
          });
        });
      });
      // Connections only listed on the input side
      Object.keys(data).forEach(id => {
        Object.keys(data[id].inputs || {}).forEach(input_class => {
          data[id].inputs[input_class].connections.forEach(item => {
            const outputs = data[item.node].outputs[item.input].connections;
            if(!outputs.some(out => out.node === String(id) && out.output === input_class)) {
              outputs.push({ "node": String(id), "output": input_class });
            }
          });
        });
      });
    });
  },
};

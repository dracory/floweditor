// Wireless (signal) connections: a port can carry a signal name; two ports
// sharing the same signal are connected in the data (both sides, exported like
// any connection) without an SVG wire. The port shows a badge instead — the
// Node-RED link-in/link-out pattern.
//
// Data model:
//   outputs.<port>.connections[i].signal and inputs.<port>.connections[i].signal
//   ports keep their pending name in outputs.<port>.wireless / inputs.<port>.wireless
//
// There is no built-in dialog. The app listens to 'signalRequest' (badge click)
// for its own "name a signal / connect to existing" UI, consistent with
// 'connectionDrop'. API: setPortSignal, getPortSignal, connectSignal,
// listSignals, listSignalEndpoints, removeSignalConnections, isPortWireless.
// Events: signalAssigned, wirelessConnected, wirelessDisconnected, signalRequest.

const LABEL_CLASS = 'df-wireless-label';
const LABEL_CONNECTED_CLASS = 'df-wireless-label--connected';
const WIRELESS_PORT_CLASS = 'has-wireless';
const WIRELESS_CONNECTED_ATTRIBUTE = 'data-wireless-connected';

function normalizeSignal(name) {
  return typeof name === 'string' ? name.trim() : '';
}

// The name a port answers to: its own pending name, or the signal of any of its connections
function resolvePortSignal(port) {
  if(!port) {
    return null;
  }
  if(typeof port.wireless === 'string' && port.wireless.trim() !== '') {
    return port.wireless.trim();
  }
  const withSignal = (port.connections || []).find(c => typeof c.signal === 'string' && c.signal.trim() !== '');
  return withSignal ? withSignal.signal.trim() : null;
}

function applySignal(connection, signal) {
  if(signal !== '') {
    connection.signal = signal;
  } else {
    delete connection.signal;
  }
}

export default {
  // Module data containing a node (nodes keep their own module)
  wirelessModuleData(nodeId) {
    const moduleName = this.getModuleFromNodeId(this.nodeKey(nodeId));
    return moduleName ? this.drawflow.drawflow[moduleName].data : null;
  },

  wirelessPortData(nodeId, portClass, type) {
    const data = this.wirelessModuleData(nodeId);
    const node = data && data[this.nodeKey(nodeId)];
    if(!node) {
      return null;
    }
    const ports = type === 'input' ? node.inputs : node.outputs;
    return (ports && ports[portClass]) || null;
  },

  wirelessPortElement(nodeId, portClass, type) {
    const node = this.container.querySelector('#' + this.nodeElementId(nodeId));
    if(!node) {
      return null;
    }
    return node.querySelector(type === 'input' ? '.inputs .' + portClass : '.outputs .' + portClass);
  },

  // True when the port can go fully wireless: no connections yet, or all of them carry a signal
  isPortWireless(nodeId, portClass, type) {
    const port = this.wirelessPortData(nodeId, portClass, type);
    if(!port) {
      return false;
    }
    if(resolvePortSignal(port) !== null) {
      return true;
    }
    return port.connections.length === 0 || port.connections.every(c => typeof c.signal === 'string' && c.signal.trim() !== '');
  },

  getPortSignal(nodeId, portClass, type) {
    return resolvePortSignal(this.wirelessPortData(nodeId, portClass, type));
  },

  /* Assigns (or clears, with null/'') a signal name on a port. The name is
     stored on the port (port.wireless, exported) and propagated to the signal
     of every existing connection on both sides. The badge is rendered or
     removed here. Dispatches 'signalAssigned' unless silent. */
  setPortSignal(nodeId, portClass, type, signal, silent = false) {
    nodeId = this.nodeKey(nodeId);
    const normalized = normalizeSignal(signal);
    const port = this.wirelessPortData(nodeId, portClass, type);
    if(port) {
      if(normalized !== '') {
        port.wireless = normalized;
      } else {
        delete port.wireless;
      }
      const data = this.wirelessModuleData(nodeId);
      (port.connections || []).forEach(connection => {
        applySignal(connection, normalized);
        if(!data) {
          return;
        }
        // Mirror the signal on the other side of the connection
        if(type === 'output') {
          const peer = data[connection.node] && data[connection.node].inputs[connection.output];
          const counterpart = peer && peer.connections.find(c => String(c.node) === String(nodeId) && c.input === portClass);
          if(counterpart) {
            applySignal(counterpart, normalized);
          }
        } else {
          const peer = data[connection.node] && data[connection.node].outputs[connection.input];
          const counterpart = peer && peer.connections.find(c => String(c.node) === String(nodeId) && c.output === portClass);
          if(counterpart) {
            applySignal(counterpart, normalized);
          }
        }
      });
    }
    this.updateWirelessBadge(nodeId, portClass, type, normalized, port);
    if(!silent) {
      this.dispatch('signalAssigned', { nodeId: nodeId, portClass: portClass, type: type, signal: normalized });
    }
  },

  /* Assigns a signal and connects the port to every eligible opposite port
     already carrying that name (the fork's "connect to existing" applied by
     name). Returns the endpoints it connected to. */
  connectSignal(nodeId, portClass, type, signal) {
    nodeId = this.nodeKey(nodeId);
    const name = normalizeSignal(signal);
    if(name === '') {
      this.setPortSignal(nodeId, portClass, type, null);
      return [];
    }
    const candidates = this.listSignalEndpoints(nodeId, portClass, type).filter(endpoint => endpoint.signal === name);
    this.setPortSignal(nodeId, portClass, type, name);
    candidates.forEach(endpoint => {
      if(type === 'output') {
        this.addConnection(nodeId, endpoint.nodeId, portClass, endpoint.portClass, { signal: name, skipDom: true });
      } else {
        this.addConnection(endpoint.nodeId, nodeId, endpoint.portClass, portClass, { signal: name, skipDom: true });
      }
    });
    return candidates;
  },

  /* Every signal name used in a module (all modules when omitted). Includes
     pending names (port.wireless) and connection signals. */
  listSignals(module) {
    const modules = module ? [this.drawflow.drawflow[module]].filter(Boolean) : Object.values(this.drawflow.drawflow);
    const seen = new Set();
    const names = [];
    modules.forEach(mod => {
      Object.values(mod.data || {}).forEach(node => {
        ['inputs', 'outputs'].forEach(kind => {
          Object.values(node[kind] || {}).forEach(port => {
            const name = resolvePortSignal(port);
            if(name && !seen.has(name)) {
              seen.add(name);
              names.push(name);
            }
          });
        });
      });
    });
    return names;
  },

  /* Opposite-type ports that already carry a signal — the candidates a "connect
     to existing" UI offers for this port. Each item: {nodeId, portClass, type,
     signal}. Input ports with connections are excluded (one wire per input);
     for an output, names already taken by another output are excluded. */
  listSignalEndpoints(nodeId, portClass, type) {
    nodeId = this.nodeKey(nodeId);
    const data = this.wirelessModuleData(nodeId);
    if(!data) {
      return [];
    }
    const opposite = type === 'input' ? 'output' : 'input';
    const takenByOtherOutput = name => {
      if(type !== 'output') {
        return false;
      }
      const lowered = name.toLowerCase();
      return Object.values(data).some(node =>
        Object.entries(node.outputs || {}).some(([otherClass, port]) => {
          if(String(node.id) === String(nodeId) && otherClass === portClass) {
            return false;
          }
          const portName = resolvePortSignal(port);
          return portName !== null && portName.toLowerCase() === lowered;
        })
      );
    };
    const endpoints = [];
    Object.values(data).forEach(node => {
      const ports = opposite === 'input' ? node.inputs : node.outputs;
      Object.entries(ports || {}).forEach(([otherClass, port]) => {
        const name = resolvePortSignal(port);
        if(!name) {
          return;
        }
        if(opposite === 'input' && port.connections.length > 0) {
          return;
        }
        if(takenByOtherOutput(name)) {
          return;
        }
        endpoints.push({ nodeId: String(node.id), portClass: otherClass, type: opposite, signal: name });
      });
    });
    return endpoints;
  },

  // Removes every signal connection of a port (wired connections stay)
  removeSignalConnections(nodeId, portClass, type) {
    nodeId = this.nodeKey(nodeId);
    const port = this.wirelessPortData(nodeId, portClass, type);
    if(!port) {
      return;
    }
    port.connections.slice().forEach(connection => {
      if(typeof connection.signal !== 'string' || connection.signal.trim() === '') {
        return;
      }
      if(type === 'output') {
        this.removeSingleConnection(nodeId, connection.node, portClass, connection.output);
      } else {
        this.removeSingleConnection(connection.node, nodeId, connection.input, portClass);
      }
    });
  },

  /* Badge on a port element: created when the port has a signal name, removed
     otherwise. '--connected' marks a live wireless link. Clicking the badge
     dispatches 'signalRequest' for the app to open its own UI. */
  updateWirelessBadge(nodeId, portClass, type, name, port) {
    const element = this.wirelessPortElement(nodeId, portClass, type);
    if(!element) {
      return;
    }
    if(name === null || name === undefined || name === '') {
      element.classList.remove(WIRELESS_PORT_CLASS);
      element.removeAttribute('data-wireless');
      element.removeAttribute(WIRELESS_CONNECTED_ATTRIBUTE);
      const stale = element.querySelector('.' + LABEL_CLASS);
      if(stale) {
        stale.remove();
      }
      return;
    }
    let label = element.querySelector('.' + LABEL_CLASS);
    if(!label) {
      label = document.createElement('span');
      label.classList.add(LABEL_CLASS);
      label.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.dispatch('signalRequest', {
          nodeId: String(nodeId),
          portClass: portClass,
          type: type,
          signal: this.getPortSignal(nodeId, portClass, type) || '',
          client_x: e.clientX,
          client_y: e.clientY
        });
      });
      element.appendChild(label);
    }
    label.textContent = name;
    label.setAttribute('title', name);
    element.classList.add(WIRELESS_PORT_CLASS);
    element.setAttribute('data-wireless', name);
    const connected = port ? port.connections.some(c => typeof c.signal === 'string' && c.signal.trim() === name) : false;
    label.classList.toggle(LABEL_CONNECTED_CLASS, connected);
    if(connected) {
      element.setAttribute(WIRELESS_CONNECTED_ATTRIBUTE, 'true');
    } else {
      element.removeAttribute(WIRELESS_CONNECTED_ATTRIBUTE);
    }
  },

  /* Rebuilds every badge from the data (after import, module change). Silent:
     it restores state, it does not assign anything. */
  refreshWirelessPorts() {
    Object.values(this.drawflow.drawflow).forEach(mod => {
      Object.values(mod.data || {}).forEach(node => {
        const nodeId = String(node.id);
        Object.keys(node.inputs || {}).forEach(portClass => {
          const port = node.inputs[portClass];
          this.updateWirelessBadge(nodeId, portClass, 'input', resolvePortSignal(port), port);
        });
        Object.keys(node.outputs || {}).forEach(portClass => {
          const port = node.outputs[portClass];
          this.updateWirelessBadge(nodeId, portClass, 'output', resolvePortSignal(port), port);
        });
      });
    });
  },
};

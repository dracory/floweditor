// Zoom, pan and fit
export default {
  zoom_enter(event, delta) {
    if (!this.zoom_use_ctrl_key || event.ctrlKey) {
      event.preventDefault()
      if(event.deltaY > 0) {
        // Zoom Out
        this.zoom_out();
      } else {
        // Zoom In
        this.zoom_in();
      }
    }
  },

  zoom_refresh(){
    this.dispatch('zoom', this.zoom);
    this.canvas_x = (this.canvas_x / this.zoom_last_value) * this.zoom;
    this.canvas_y = (this.canvas_y / this.zoom_last_value) * this.zoom;
    this.zoom_last_value = this.zoom;
    this.precanvas.style.transform = "translate("+this.canvas_x+"px, "+this.canvas_y+"px) scale("+this.zoom+")";
  },

  zoom_in() {
    if(this.zoom < this.zoom_max) {
      this.setZoom(this.zoom + this.zoom_value);
    }
  },

  zoom_out() {
    if(this.zoom > this.zoom_min) {
      this.setZoom(this.zoom - this.zoom_value);
    }
  },

  zoom_reset(){
    if(this.zoom != 1) {
      this.zoom = 1;
      this.zoom_refresh();
    }
  },

  setZoom(value) {
    // Rounded: 1.5 + 0.1 must not end up above zoom_max because of floating point
    this.zoom = Math.min(this.zoom_max, Math.max(this.zoom_min, Math.round(value * 1000) / 1000));
    this.zoom_refresh();
  },

  setCanvasPosition(x, y) {
    this.canvas_x = x;
    this.canvas_y = y;
    this.dispatch('translate', { x: x, y: y });
    this.precanvas.style.transform = "translate("+this.canvas_x+"px, "+this.canvas_y+"px) scale("+this.zoom+")";
  },

  // Edge auto-pan: while dragging a node or a wire, a pointer held near the
  // container edge pans the canvas every animation frame until it leaves the
  // margin or the drag ends (dragEnd/cancelPointer call autoPanStop).
  autoPanUpdate(clientX, clientY) {
    const margin = this.autoPanEdgeMargin;
    const active = margin > 0 && (
      (this.drag && this.autoPanMode !== 'connection') ||
      (this.connection && this.autoPanMode !== 'node'));
    const rect = active ? this.container.getBoundingClientRect() : null;
    let dx = 0, dy = 0;
    if (rect) {
      if (clientX - rect.left < margin) dx = this.autoPanSpeed;
      else if (rect.right - clientX < margin) dx = -this.autoPanSpeed;
      if (clientY - rect.top < margin) dy = this.autoPanSpeed;
      else if (rect.bottom - clientY < margin) dy = -this.autoPanSpeed;
    }
    this.auto_pan_delta = (dx || dy) ? { dx: dx, dy: dy } : null;
    if (this.auto_pan_delta && this.auto_pan_raf === null) {
      this.auto_pan_raf = requestAnimationFrame(() => this.autoPanStep());
    }
  },

  autoPanStep() {
    this.auto_pan_raf = null;
    const delta = this.auto_pan_delta;
    if (!delta || !(this.drag || this.connection)) {
      this.auto_pan_delta = null;
      return;
    }
    this.setCanvasPosition(this.canvas_x + delta.dx, this.canvas_y + delta.dy);
    if (this.drag) {
      // The pan moved the canvas under a still pointer: move the dragged
      // nodes the other way so they stay under the cursor (canvas units)
      this.dragNodes(delta.dx / this.zoom, delta.dy / this.zoom);
    }
    if (this.connection && this.last_pointer) {
      // The precanvas rect moved: redraw the wire to the same pointer
      this.updateConnection(this.last_pointer.x, this.last_pointer.y);
      this.setConnectionTarget(this.connectionTargetAt(this.last_pointer.x, this.last_pointer.y));
    }
    this.auto_pan_raf = requestAnimationFrame(() => this.autoPanStep());
  },

  autoPanStop() {
    this.auto_pan_delta = null;
    if (this.auto_pan_raf !== null) {
      cancelAnimationFrame(this.auto_pan_raf);
      this.auto_pan_raf = null;
    }
  },

  // Zoom and pan so that every node (with its ports and connections) fits in the editor.
  // Padding: zoomFit() uses 20px on every side; zoomFit({padding, paddingTop,
  // paddingRight, paddingBottom, paddingLeft, minZoom, maxZoom}) or the positional
  // form zoomFit(paddingTop, paddingRight, paddingBottom, paddingLeft) override
  // each side (a missing side falls back to `padding`, then 20).
  zoomFit(options = {}, paddingRight, paddingBottom, paddingLeft) {
    if (typeof options === 'number') {
      options = { paddingTop: options, paddingRight: paddingRight, paddingBottom: paddingBottom, paddingLeft: paddingLeft };
    }
    const padding = options.padding !== undefined ? options.padding : 20;
    const padTop = options.paddingTop !== undefined ? options.paddingTop : padding;
    const padRight = options.paddingRight !== undefined ? options.paddingRight : padding;
    const padBottom = options.paddingBottom !== undefined ? options.paddingBottom : padding;
    const padLeft = options.paddingLeft !== undefined ? options.paddingLeft : padding;
    const minZoom = options.minZoom !== undefined ? options.minZoom : this.zoom_min;
    const maxZoom = options.maxZoom !== undefined ? options.maxZoom : 1;
    const elements = this.precanvas.querySelectorAll('.drawflow-node, .drawflow-node .input, .drawflow-node .output, .connection .main-path, .connection .point');
    if(elements.length === 0 || this.container.clientWidth === 0 || this.container.clientHeight === 0) {
      return null;
    }
    // Bounds in canvas units: the canvas is drawn at canvas_x/y with scale zoom
    const canvasRect = this.precanvas.getBoundingClientRect();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    elements.forEach(ele => {
      const rect = ele.getBoundingClientRect();
      if(rect.width === 0 && rect.height === 0) {
        return;
      }
      left = Math.min(left, (rect.left - canvasRect.left) / this.zoom);
      top = Math.min(top, (rect.top - canvasRect.top) / this.zoom);
      right = Math.max(right, (rect.right - canvasRect.left) / this.zoom);
      bottom = Math.max(bottom, (rect.bottom - canvasRect.top) / this.zoom);
    });
    if(left === Infinity) {
      return null;
    }
    const width = Math.max(1, this.container.clientWidth - padLeft - padRight);
    const height = Math.max(1, this.container.clientHeight - padTop - padBottom);
    let zoom = Math.min(width / Math.max(1, right - left), height / Math.max(1, bottom - top));
    zoom = Math.round(Math.min(maxZoom, Math.max(minZoom, zoom)) * 1000) / 1000;
    // translate(x, y) scale(zoom) around transform-origin (o): screen = o + translate + zoom * (point - o)
    this.zoom = zoom;
    this.zoom_last_value = zoom;
    this.dispatch('zoom', zoom);
    this.placeCanvasPoint(left, top, padLeft + (width - zoom * (right - left)) / 2, padTop + (height - zoom * (bottom - top)) / 2);
    return { zoom: zoom, x: this.canvas_x, y: this.canvas_y };
  },

  // Pan so that a point of the canvas appears at a position of the container
  placeCanvasPoint(x, y, container_x, container_y) {
    const origin = getComputedStyle(this.precanvas).transformOrigin.split(' ').map(parseFloat);
    this.setCanvasPosition(
      container_x - this.precanvas.offsetLeft - origin[0] - this.zoom * (x - origin[0]),
      container_y - this.precanvas.offsetTop - origin[1] - this.zoom * (y - origin[1])
    );
  },

  centerCanvasOn(x, y) {
    this.placeCanvasPoint(x, y, this.container.clientWidth / 2, this.container.clientHeight / 2);
  },

  centerNode(id) {
    const node = this.container.querySelector('#' + this.nodeElementId(id));
    if(node) {
      const data = this.getNodeFromId(id);
      this.centerCanvasOn(data.pos_x + node.offsetWidth / 2, data.pos_y + node.offsetHeight / 2);
    }
  },
};

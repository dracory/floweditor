export default {
  zoom_enter(event, delta) {
    if (event.ctrlKey) {
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
};

/* Your aura: the player's feelings across all their songs, drawn with Matter.js.
   It looks like an aura photograph: each emotion is a glowing pastel field holding a cloud of faint sparkles
   (more sparkles = a stronger feeling), and songs that carry two feelings pull those feelings together, so their
   glows melt into each other. Your name and overall colour sit underneath, like a photo caption.
   Under the aura, a colour strip shows each song in its own colour, from your first song to your latest.
   The page also starts new auras, opens past ones, and exports the stats (written by Python).
   Python keeps the songs and works out every number (App.player.aura); this file only moves and draws. */

class AuraMap {
  // Soft pastel colour for each emotion family (the families come from Python's EMOTION_FAMILIES),
  // for the map's glows, sparkles and legend. Hovering a glow always shows its name, so colour is never the only clue.
  static PASTELS = { bright: "#F5CF7A", fiery: "#F4A3A0", tender: "#B3A6F2", calm: "#9DD6A6", heavy: "#8FDCCB" };
  static INK = "#161616";
  static GROW_MS = 700;                           // new things grow in over this long
  static MAX_CLOUD = 80;                          // sparkles in one emotion's glow

  constructor(stage, onHover) {
    const { Engine, Events, Mouse, MouseConstraint, Composite } = Matter;
    this.stage = stage;
    this.onHover = onHover;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "aura__canvas";
    stage.prepend(this.canvas);
    this.context = this.canvas.getContext("2d");
    this.aura = null;
    this.nodes = new Map();                 // key -> node { key, kind, body, data, dots, born }
    this.anchors = [];                      // springs between feelings that share songs
    this.zoom = 1;
    this.camera = { x: 0, y: 0 };
    this.focus = null;                      // the emotion that is lit up (or null)
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.engine = Engine.create({ gravity: { x: 0, y: 0 } });
    Events.on(this.engine, "beforeUpdate", () => this.applyForces());

    // Dragging (Matter.js), with the mouse adjusted for zoom and camera
    this.mouse = Mouse.create(this.canvas);
    for (const name of ["wheel", "mousewheel", "DOMMouseScroll"]) {
      this.mouse.element.removeEventListener(name, this.mouse.mousewheel);    // we handle zoom ourselves
    }
    Composite.add(this.engine.world, MouseConstraint.create(this.engine, {
      mouse: this.mouse, constraint: { stiffness: 0.15 },
    }));

    this.resize();
    this.listen();
    this.frame = this.frame.bind(this);
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  /* ---------- building the world ---------- */

  update(aura) {
    this.aura = aura;
    this.glow = aura.glow;                 // your overall colour, from Python
    this.build();
  }

  /* Make the bodies for the current view. Things that already exist keep their place,
     so adding a song makes the picture grow instead of starting again. */
  build() {
    const { Composite } = Matter;
    const old = new Map([...this.nodes].map(([key, node]) => [key, node]));
    this.anchors.forEach((anchor) => Composite.remove(this.engine.world, anchor));
    this.anchors = [];
    for (const node of this.nodes.values()) Composite.remove(this.engine.world, node.body);
    this.nodes = new Map();
    if (!this.aura || !this.aura.songs.length) return;
    this.buildAura(old);
    if (this.focus && ![...this.nodes.values()].some((n) => n.data.emotion === this.focus)) this.focus = null;
    if (this.reducedMotion) this.settle();
  }

  addNode(old, key, kind, data, radius, x, y, options = {}) {
    const previous = old.get(key);
    const body = Matter.Bodies.circle(previous ? previous.body.position.x : x, previous ? previous.body.position.y : y,
                                      radius, { frictionAir: 0.2, ...options });
    const node = { key, kind, data, body, born: previous ? previous.born : performance.now() };
    body.node = node;
    this.nodes.set(key, node);
    Matter.Composite.add(this.engine.world, body);
    return node;
  }

  /* A cloud of dots around an emotion: more dots for a stronger feeling. Each dot keeps its offset from the
     hub (spread like a soft glow: dense in the middle, thinning out), so the cloud moves with its hub.
     words: the emotion's words; the first dots carry them (bigger, with a hover tip). */
  static cloud(percent, radius, words = []) {
    const count = Math.min(AuraMap.MAX_CLOUD, Math.round(8 + percent * 1.4));
    const wordDots = [];
    words.forEach((word) => { for (let i = 0; i < word.count && wordDots.length < 12; i++) wordDots.push(word); });
    return Array.from({ length: count }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.min(2.8, Math.sqrt(-2 * Math.log(1 - Math.random() * 0.995)));   // a soft, glow-like falloff
      return {
        dx: Math.cos(angle) * spread * radius * 0.8,
        dy: Math.sin(angle) * spread * radius * 0.8,
        r: 0.8 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        word: wordDots[i] || null,
      };
    });
  }

  buildAura(old) {
    // Each emotion is a hub: hubs push apart, drift to the middle, and songs pull related feelings together
    this.aura.emotions.forEach((emotion, index) => {
      const radius = 30 + Math.sqrt(emotion.percent) * 11;
      const angle = index * 2.4;
      const node = this.addNode(old, `e:${emotion.emotion}`, "hub", emotion, radius,
                                Math.cos(angle) * 90 * Math.sqrt(index + 1), Math.sin(angle) * 90 * Math.sqrt(index + 1),
                                { frictionAir: 0.3, restitution: 0 });
      node.cloud = old.get(node.key)?.cloud && old.get(node.key).data.percent === emotion.percent
        ? old.get(node.key).cloud : AuraMap.cloud(emotion.percent, radius,
                                                   this.aura.words.filter((w) => w.emotion === emotion.emotion));
    });

    // Songs that carry two feelings pull those feelings together (more shared songs, a stronger pull),
    // so feelings that come together in your music melt into each other's glow
    const together = new Map();
    this.aura.songs.forEach((song) => {
      const feelings = song.top.map(([emotion]) => emotion).filter((e) => this.nodes.has(`e:${e}`));
      feelings.forEach((a, i) => feelings.slice(i + 1).forEach((b) => {
        const key = [a, b].sort().join("|");
        together.set(key, (together.get(key) || 0) + 1);
      }));
    });
    together.forEach((songs, key) => {
      const [a, b] = key.split("|").map((e) => this.nodes.get(`e:${e}`));
      // the pull grows with shared songs, but is capped so a big aura (many songs) still has room to breathe
      const spring = Matter.Constraint.create({ bodyA: a.body, bodyB: b.body, stiffness: 0.0006 * Math.min(songs, 4), damping: 0.05,
                                                length: (a.body.circleRadius + b.body.circleRadius) * 1.6 });
      Matter.Composite.add(this.engine.world, spring);
      this.anchors.push(spring);
    });
  }

  /* Aura: your hubs drift to the middle and push each other apart */
  applyForces() {
    const hubs = [...this.nodes.values()].filter((node) => node.kind === "hub");
    hubs.forEach((a, i) => hubs.slice(i + 1).forEach((b) => {
      const dx = b.body.position.x - a.body.position.x;
      const dy = b.body.position.y - a.body.position.y;
      const distance = Math.max(Math.hypot(dx, dy), 30);
      const push = (3 * a.body.mass * b.body.mass) / (distance * distance);
      Matter.Body.applyForce(a.body, a.body.position, { x: (-dx / distance) * push, y: (-dy / distance) * push });
      Matter.Body.applyForce(b.body, b.body.position, { x: (dx / distance) * push, y: (dy / distance) * push });
    }));
    for (const { body } of this.nodes.values()) {
      Matter.Body.applyForce(body, body.position, { x: -body.position.x * 0.00004 * body.mass,
                                                     y: -body.position.y * 0.00004 * body.mass });
    }
  }

  settle() {
    for (let step = 0; step < 400; step++) Matter.Engine.update(this.engine, 16);
  }

  /* ---------- view: size, zoom, camera ---------- */

  resize() {
    const ratio = window.devicePixelRatio || 1;
    this.width = this.stage.clientWidth;
    this.height = this.stage.clientHeight;
    this.canvas.width = this.width * ratio;
    this.canvas.height = this.height * ratio;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ratio = ratio;
    this.syncMouse();
  }

  syncMouse() {
    Matter.Mouse.setScale(this.mouse, { x: 1 / this.zoom, y: 1 / this.zoom });
    Matter.Mouse.setOffset(this.mouse, { x: this.camera.x - this.width / 2 / this.zoom,
                                         y: this.camera.y - this.height / 2 / this.zoom });
  }

  zoomBy(factor) {
    this.followUntil = 0;
    this.zoom = Math.min(3, Math.max(0.3, this.zoom * factor));
    this.syncMouse();
  }

  followFor(ms) {
    this.followUntil = performance.now() + ms;
  }

  /* Where the caption (your name and colour) goes: centred under your glow */
  captionSpot() {
    const mine = [...this.nodes.values()].filter((node) => node.kind === "hub");
    if (!mine.length) return null;
    return {
      x: mine.reduce((sum, n) => sum + n.body.position.x, 0) / mine.length,
      y: Math.max(...mine.map((n) => n.body.position.y + n.body.circleRadius * 2.2)) + 18,
    };
  }

  /* Everything that is drawn, as a box: the nodes with their aura clouds, and the caption underneath */
  bounds() {
    const reach = (node) => node.body.circleRadius * (node.cloud ? 2.2 : 1);
    const boxes = [...this.nodes.values()].map((node) => [node.body.position.x, node.body.position.y, reach(node)]);
    const caption = this.captionSpot();
    if (caption) boxes.push([caption.x, caption.y + 50, 20]);
    if (!boxes.length) return null;
    return {
      left: Math.min(...boxes.map(([x, , r]) => x - r)), right: Math.max(...boxes.map(([x, , r]) => x + r)),
      top: Math.min(...boxes.map(([, y, r]) => y - r)), bottom: Math.max(...boxes.map(([, y, r]) => y + r)),
    };
  }

  /* Zoom so everything fits, centred. smooth = move part of the way (called every frame) */
  fit(smooth = false) {
    const box = this.bounds();
    if (!box) return;
    const target = {
      // a little higher than the middle, leaving room for the caption, legend and switch at the bottom
      x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 - 30,
      zoom: Math.min(1.5, Math.max(0.3, Math.min(this.width / (box.right - box.left + 60),
                                                 this.height / (box.bottom - box.top + 110)))),
    };
    const step = smooth ? 0.08 : 1;
    this.camera = { x: this.camera.x + (target.x - this.camera.x) * step, y: this.camera.y + (target.y - this.camera.y) * step };
    this.zoom += (target.zoom - this.zoom) * step;
    this.syncMouse();
  }

  toWorld(clientX, clientY) {
    const box = this.canvas.getBoundingClientRect();
    return { x: (clientX - box.left - this.width / 2) / this.zoom + this.camera.x,
             y: (clientY - box.top - this.height / 2) / this.zoom + this.camera.y };
  }

  /* What's under the pointer: a word dot in an aura cloud if close enough, else the hub itself */
  hit(clientX, clientY) {
    const point = this.toWorld(clientX, clientY);
    for (const node of this.nodes.values()) {
      if (!node.cloud) continue;
      const { x, y } = node.body.position;
      const dot = node.cloud.find((d) => d.word && Math.hypot(x + d.dx - point.x, y + d.dy - point.y) <= 4 / this.zoom + 2);
      if (dot) return { node, word: dot.word };
    }
    const bodies = [...this.nodes.values()].map((node) => node.body);
    const body = Matter.Query.point(bodies, point).sort((a, b) => a.circleRadius - b.circleRadius)[0];
    if (!body) return null;
    return { node: body.node };
  }

  listen() {
    let pan = null;
    let moved = false;
    this.canvas.addEventListener("pointerdown", (event) => {
      moved = false;
      this.followUntil = 0;
      if (!this.hit(event.clientX, event.clientY)) {
        pan = { x: event.clientX, y: event.clientY, camera: { ...this.camera } };
        this.canvas.classList.add("is-panning");
      }
    });
    window.addEventListener("pointermove", (event) => {
      if (!pan) return;
      moved = true;
      this.camera = { x: pan.camera.x - (event.clientX - pan.x) / this.zoom,
                      y: pan.camera.y - (event.clientY - pan.y) / this.zoom };
      this.syncMouse();
    });
    window.addEventListener("pointerup", () => {
      pan = null;
      this.canvas.classList.remove("is-panning");
    });
    this.canvas.addEventListener("pointermove", (event) => {
      const found = this.hit(event.clientX, event.clientY);
      this.canvas.style.cursor = found ? "grab" : "default";
      this.onHover(found, event);
    });
    this.canvas.addEventListener("pointerleave", () => this.onHover(null));
    // Click an emotion to light it up everywhere; click again (or empty space) to show everything
    this.canvas.addEventListener("click", (event) => {
      if (moved) return;
      const found = this.hit(event.clientX, event.clientY);
      const emotion = found && found.node.data.emotion;
      this.focus = !emotion || this.focus === emotion ? null : emotion;
    });
    this.canvas.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;          // plain scrolling still scrolls the page
      event.preventDefault();
      this.zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08);
    }, { passive: false });
  }

  /* ---------- drawing ---------- */

  /* The pastel colour for shapes on the map */
  colour(family) {
    return AuraMap.PASTELS[family] || AuraMap.INK;
  }

  lit(emotion) {
    return !this.focus || emotion === this.focus;
  }

  growth(node, time) {
    if (this.reducedMotion) return 1;
    const t = Math.min(1, Math.max(0, (time - node.born) / AuraMap.GROW_MS));
    return 1 - (1 - t) ** 3;
  }

  frame(time) {
    if (!this.running) return;
    if (!this.reducedMotion) Matter.Engine.update(this.engine, 1000 / 60);
    if (time < (this.followUntil || 0)) this.fit(true);
    const c = this.context;
    c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.translate(this.width / 2, this.height / 2);
    c.scale(this.zoom, this.zoom);
    c.translate(-this.camera.x, -this.camera.y);
    if (this.nodes.size) {
      this.drawAura(c, time);
    }
    c.globalAlpha = 1;
    requestAnimationFrame(this.frame);
  }

  /* ---------- the aura ---------- */

  /* Where a cloud dot is right now: its hub, its offset, and a slow drift */
  dotAt(node, dot, time, grow) {
    const drift = this.reducedMotion ? 0 : 3;
    return {
      x: node.body.position.x + dot.dx * grow + Math.sin(time / 2100 + dot.phase) * drift,
      y: node.body.position.y + dot.dy * grow + Math.cos(time / 2600 + dot.phase) * drift,
    };
  }

  /* Like an aura photograph: one soft halo in your overall colour, the feelings melting into it as
     luminous pastel glows, a few twinkling sparkles, then the labels and your name with your colour */
  drawAura(c, time) {
    const clouds = [...this.nodes.values()].filter((node) => node.cloud);
    const mine = clouds.filter((node) => node.kind === "hub");
    const centre = mine.length ? {
      x: mine.reduce((sum, n) => sum + n.body.position.x, 0) / mine.length,
      y: mine.reduce((sum, n) => sum + n.body.position.y, 0) / mine.length,
    } : null;

    // 1. The halo: your overall colour, a wide soft cloud behind everything
    const reach = centre ? Math.max(...mine.map((n) => Math.hypot(n.body.position.x - centre.x, n.body.position.y - centre.y)
                                                       + n.body.circleRadius * 2.6), 200) : 0;
    if (centre && this.glow) {
      const breathe = this.reducedMotion ? 1 : 1 + 0.03 * Math.sin(time / 2400);
      const halo = c.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, reach * 1.25 * breathe);
      halo.addColorStop(0, this.glow.colour);
      halo.addColorStop(0.55, `${this.glow.colour}66`);
      halo.addColorStop(1, `${this.glow.colour}00`);
      c.globalAlpha = this.focus ? 0.25 : 0.55;
      c.fillStyle = halo;
      c.beginPath();
      c.arc(centre.x, centre.y, reach * 1.25 * breathe, 0, Math.PI * 2);
      c.fill();
    }

    // 2. Each feeling as a luminous pastel glow, melting into its neighbours
    for (const node of clouds) {
      const { x, y } = node.body.position;
      const radius = node.body.circleRadius * 3.4 * this.growth(node, time);
      const pulse = this.reducedMotion ? 1 : 1 + 0.05 * Math.sin(time / 1800 + node.key.length);
      const colour = this.colour(node.data.family);
      const glow = c.createRadialGradient(x, y, 0, x, y, radius * pulse);
      glow.addColorStop(0, colour);
      glow.addColorStop(0.45, `${colour}88`);
      glow.addColorStop(1, `${colour}00`);
      c.globalAlpha = this.lit(node.data.emotion) ? 0.8 : 0.06;
      c.fillStyle = glow;
      c.beginPath();
      c.arc(x, y, radius * pulse, 0, Math.PI * 2);
      c.fill();
      // a bright, light-filled heart in the strongest feelings
      if (node.data.percent >= 10 && this.lit(node.data.emotion)) {
        const core = c.createRadialGradient(x, y, 0, x, y, node.body.circleRadius * 1.1);
        core.addColorStop(0, "rgba(255, 255, 255, 0.75)");
        core.addColorStop(1, "rgba(255, 255, 255, 0)");
        c.globalAlpha = 1;
        c.fillStyle = core;
        c.beginPath();
        c.arc(x, y, node.body.circleRadius * 1.1, 0, Math.PI * 2);
        c.fill();
      }
    }

    // 3. Sparkles: faint white specks with a soft coloured glow, twinkling (kept subtle so the aura leads);
    //    the ones holding words are a little bigger, so they can still be hovered
    c.save();
    for (const node of clouds) {
      const grow = this.growth(node, time);
      const on = this.lit(node.data.emotion);
      c.shadowColor = this.colour(node.data.family);
      c.shadowBlur = 8;
      c.fillStyle = "#FFFFFF";
      for (const dot of node.cloud) {
        const p = this.dotAt(node, dot, time, grow);
        const twinkle = this.reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(time / 700 + dot.phase * 3);
        c.globalAlpha = (on ? 0.35 : 0.05) * twinkle;
        c.beginPath();
        c.arc(p.x, p.y, dot.word ? 1.8 : dot.r * 0.7, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();

    // 4. Labels in soft, slightly see-through white, floating in the light (in the page's serif, sized by
    //    strength, with the % in small mono underneath). Plain text: no outline, no glow.
    //    Hidden until the "Show emotions" switch is on, so the aura is just colour at first.
    c.save();
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    c.fillStyle = "#FFFFFF";
    // sized against your strongest feeling, so the top feelings stay big however many songs there are
    const strongest = Math.max(...clouds.map((node) => node.data.percent), 1);
    for (const node of this.showLabels ? clouds : []) {
      const { x, y } = node.body.position;
      const on = this.lit(node.data.emotion);
      c.globalAlpha = on ? 0.92 : 0.15;
      const size = 15 + 19 * Math.sqrt(node.data.percent / strongest);
      c.font = `400 ${size}px 'Iowan Old Style', 'Baskerville', Georgia, serif`;
      c.fillText(node.data.emotion.replace("_", " "), x, y - 10);
      c.globalAlpha = on ? 0.75 : 0.12;
      c.font = "11px ui-monospace, Menlo, monospace";
      c.fillText(`${node.data.percent}%`, x, y + 8);
    }
    c.restore();

    // 5. Like a caption under an aura photo: your name, and your overall colour in small lowercase
    const caption = this.captionSpot();
    if (caption && this.ownerName) {
      c.globalAlpha = 1;
      c.fillStyle = AuraMap.INK;
      c.textBaseline = "top";
      c.font = "italic 400 30px 'Iowan Old Style', 'Baskerville', Georgia, serif";
      c.fillText(this.ownerName, caption.x, caption.y);
      if (this.glow) {
        c.globalAlpha = 0.7;
        c.font = "400 17px system-ui, -apple-system, sans-serif";
        c.fillText(this.glow.name, caption.x, caption.y + 40);
      }
    }
  }

  stop() {
    this.running = false;
  }
}

/* ---------- the aura page ---------- */

const Aura = (() => {
  const FAMILIES = ["bright", "fiery", "tender", "calm", "heavy"];
  const pretty = (emotion) => emotion.replace("_", " ");
  let map = null;

  function init() {
    document.getElementById("add-song").addEventListener("submit", (event) => {
      event.preventDefault();
      addSong();
    });
    document.getElementById("aura-zoom-in").addEventListener("click", () => map && map.zoomBy(1.25));
    document.getElementById("aura-zoom-out").addEventListener("click", () => map && map.zoomBy(1 / 1.25));
    document.getElementById("aura-fit").addEventListener("click", () => map && map.fit());
    document.getElementById("aura-labels").addEventListener("change", (event) => {
      if (map) map.showLabels = event.target.checked;
      document.getElementById("aura-stage").classList.toggle("is-labelled", event.target.checked);
    });
    document.getElementById("export-stats").addEventListener("click", exportStats);
    document.getElementById("stats-toggle").addEventListener("click", toggleStats);
    document.getElementById("stats-next").addEventListener("click", nextStatsCard);
    // A new aura, when your music has changed a lot: an optional name, no questions
    document.getElementById("aura-new").addEventListener("click", () => toggleNewAura(true));
    document.getElementById("new-aura-cancel").addEventListener("click", () => toggleNewAura(false));
    document.getElementById("new-aura-form").addEventListener("submit", (event) => {
      event.preventDefault();
      startNewAura();
    });
    document.getElementById("aura-back").addEventListener("click", () => openAura(null));
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (App.current !== "aura") return;
        if (map) map.resize();
        renderTimeline(App.player.aura.songs);
      }, 200);
    });
    renderLegend();
  }

  async function show() {
    if (!App.player) {
      try {
        await App.api("/api/player", { name: Survey.state.name });
      } catch (error) {
        App.toast(error.message);
        return;
      }
    }
    document.querySelector(".stats-card").hidden = !App.result;       // no cards until you've played
    closeStats();
    const stage = document.getElementById("aura-stage");
    if (typeof Matter === "undefined") {
      stage.querySelector(".aura__empty").textContent = "Your aura needs Matter.js, which didn't load.";
      return;
    }
    if (!map) map = new AuraMap(stage, showTip);
    else {
      map.running = true;
      requestAnimationFrame(map.frame);
      map.resize();
    }
    // every visit opens on the aura alone; "Show emotions" brings the words back
    document.getElementById("aura-labels").checked = false;
    stage.classList.remove("is-labelled");
    map.showLabels = false;
    refresh();
    if (map.reducedMotion) map.fit();
    else map.followFor(6000);                                   // keep it framed while it settles
  }

  function leave() {
    if (map) map.stop();
    toggleNewAura(false);
  }

  /* Draw everything from App.player.aura (sent by Python) */
  function refresh() {
    const aura = App.player.aura;
    map.ownerName = App.player.me ? App.player.me.name : Survey.state.name;     // your name under the aura
    map.update(aura);
    document.getElementById("aura-kicker").textContent = Survey.state.name.toUpperCase();
    const count = aura.songs.length;
    const shown = App.player.auras.find((a) => a.number === App.player.showing);
    const lookingBack = !shown.current;
    document.getElementById("aura-subtitle").textContent = lookingBack
      ? `${count} song${count === 1 ? "" : "s"}. You're looking back at a past aura.`
      : count ? `${count} song${count === 1 ? "" : "s"} so far. It grows with every song you add.`
              : "A fresh aura. Add a song and it starts to glow.";
    // a past aura can be looked at, not changed: no new songs, no new aura from here
    document.getElementById("add-song").hidden = lookingBack;
    document.getElementById("aura-new").hidden = lookingBack;
    document.getElementById("aura-back").hidden = !lookingBack;
    document.querySelector("#aura-stage .aura__empty").hidden = count > 0;
    // your overall colour, its name and what it means (from Python)
    const glow = aura.glow;
    document.getElementById("glow-line").hidden = !glow;
    if (glow) {
      document.getElementById("glow-swatch").style.background = glow.colour;
      document.getElementById("glow-swatch").style.color = glow.colour;          // its soft glow
      document.getElementById("glow-name").textContent = glow.name;
      document.getElementById("glow-meaning").textContent = glow.meaning;
    }
    document.getElementById("aura-label").textContent =
      `${shown.label} \u00B7 ${shown.current ? `since ${shown.since}` : shown.dates}`;
    renderSongs(aura.songs);
    renderTimeline(aura.songs);
    renderAuras(App.player.auras);
  }

  function showTip(found, event) {
    const tip = document.getElementById("aura-tip");
    if (!found) {
      tip.hidden = true;
      return;
    }
    const { node, word } = found;
    if (word) {
      tip.textContent = `“${word.word}” → ${pretty(word.emotion)} ×${word.count}`;
    } else if (node.kind === "hub") {
      const d = node.data;
      tip.textContent = `${pretty(d.emotion)}: ${d.percent}% on average, in ${d.songs} song${d.songs === 1 ? "" : "s"}`;
    }
    const box = document.getElementById("aura-stage").getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(event.clientX - box.left, tip.offsetWidth / 2), box.width - tip.offsetWidth / 2)}px`;
    tip.style.top = `${event.clientY - box.top - 14}px`;
  }

  function renderLegend() {
    const legend = document.getElementById("aura-legend");
    legend.innerHTML = "";
    FAMILIES.forEach((family) => {
      const item = document.createElement("li");
      item.innerHTML = `<span class="aura-legend__dot"></span><span></span>`;
      item.children[0].style.background = AuraMap.PASTELS[family];
      item.children[1].textContent = family;
      legend.appendChild(item);
    });
  }

  /* ---------- colours over time: one square per song, in that song's own colour (from Python) ---------- */

  function renderTimeline(songs) {
    const box = document.getElementById("aura-timeline");
    box.innerHTML = "";
    if (!songs.length) return;
    const strip = document.createElement("div");
    strip.className = "colour-strip";
    songs.forEach((song, i) => {
      const square = document.createElement("span");
      square.className = "colour-strip__song";
      square.style.background = song.glow ? song.glow.colour : "#EEEEEE";
      square.style.animationDelay = `${0.2 + i * 0.03}s`;
      square.dataset.tip = `${i + 1}. ${song.title} \u00B7 ${song.glow ? song.glow.name : ""} \u00B7 ${song.date_label}`;
      strip.appendChild(square);
    });
    const ends = document.createElement("div");
    ends.className = "colour-strip__ends";
    ends.innerHTML = "<span>First song</span><span>Latest</span>";
    box.append(strip, ends);
    const tip = document.getElementById("timeline-tip");
    strip.addEventListener("pointermove", (event) => {
      const target = event.target.closest("[data-tip]");
      if (!target) {
        tip.hidden = true;
        return;
      }
      const area = box.getBoundingClientRect();
      tip.textContent = target.dataset.tip;
      tip.hidden = false;
      tip.style.left = `${Math.min(Math.max(event.clientX - area.left, tip.offsetWidth / 2), area.width - tip.offsetWidth / 2)}px`;
      tip.style.top = `${event.clientY - area.top - 12}px`;
    });
    strip.addEventListener("pointerleave", () => { tip.hidden = true; });
  }

  /* ---------- your stats: the result cards as a stack ---------- */

  let statsOrder = [];                    // the cards, front of the stack first
  // In the stack the cards are landscape: the picture parts move to a right-hand column
  const RIGHT_COLUMN = ".viz-area, .orbit-ranking, .result-card__label, .staircase__missing, .song-list";
  const CARD_NAMES = ["What we heard", "Your aesthetic", "By the numbers", "Songs for your mood"];

  function toggleStats() {
    if (document.getElementById("stats-stack").hidden) openStats();
    else closeStats();
  }

  /* Fill a fresh copy of the 4 result cards with your latest result, then stack them */
  function openStats() {
    const stack = document.getElementById("stats-stack");
    const deck = document.getElementById("stats-deck");
    stack.hidden = false;                           // on screen first: some pictures measure their space
    deck.innerHTML = "";
    deck.appendChild(Result.makeCards());
    deck.querySelectorAll(".result-card").forEach(splitIntoColumns);
    Result.fill(deck, App.result);
    statsOrder = [...deck.querySelectorAll(".result-card")];
    statsOrder.forEach((card, index) => {
      card.dataset.number = index + 1;
      card.classList.add("is-active");            // full size (not the result page's shrunken side card)
    });
    // every card as tall as the tallest, so the stack looks neat
    const tallest = Math.max(...statsOrder.map((card) => card.offsetHeight));
    statsOrder.forEach((card) => { card.style.height = `${tallest}px`; });
    deck.style.height = `${tallest + 48}px`;
    arrangeStats();
    const toggle = document.getElementById("stats-toggle");
    toggle.textContent = "Hide my stats";
    toggle.setAttribute("aria-expanded", "true");
  }

  /* Text on the left, pictures on the right (in the order they appear in the card) */
  function splitIntoColumns(card) {
    const left = document.createElement("div");
    const right = document.createElement("div");
    left.className = "stats-column stats-column--text";
    right.className = "stats-column stats-column--picture";
    [...card.children].forEach((child) => (child.matches(RIGHT_COLUMN) ? right : left).appendChild(child));
    card.append(left, right);
    card.classList.add("is-landscape");
  }

  function closeStats() {
    document.getElementById("stats-stack").hidden = true;
    document.getElementById("stats-deck").innerHTML = "";
    const toggle = document.getElementById("stats-toggle");
    toggle.textContent = "See my stats";
    toggle.setAttribute("aria-expanded", "false");
  }

  /* Front card on top; the others peek out behind it, a little lower and smaller */
  function arrangeStats() {
    statsOrder.forEach((card, depth) => {
      card.style.setProperty("--depth", depth);
      card.style.zIndex = String(statsOrder.length - depth);
      card.classList.toggle("is-front", depth === 0);
    });
    const number = Number(statsOrder[0].dataset.number);
    document.getElementById("stats-count").textContent = `${number} / ${statsOrder.length} \u00B7 ${CARD_NAMES[number - 1]}`;
  }

  /* The front card slides away and goes to the back of the stack */
  function nextStatsCard() {
    const front = statsOrder[0];
    front.classList.add("is-leaving");
    setTimeout(() => {
      front.classList.remove("is-leaving");
      statsOrder.push(statsOrder.shift());
      arrangeStats();
    }, 320);
  }

  /* Python writes your aura's lyrics stats as text; the page only saves it as a file */
  async function exportStats() {
    let file;
    try {
      file = await App.api("/api/export", { name: Survey.state.name, aura: App.player.showing });
    } catch (failure) {
      App.toast(failure.message);
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([file.text], { type: "text/plain;charset=utf-8" }));
    link.download = file.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    App.toast(`Exported! Your stats are in ${file.filename}.`);
  }

  /* The list of songs, newest first, each with a remove button */
  function renderSongs(songs) {
    const list = document.getElementById("aura-songs");
    list.innerHTML = "";
    songs.map((song, index) => ({ ...song, number: index + 1 })).reverse().forEach((song) => {
      const item = document.createElement("li");
      item.className = "aura-song";
      item.innerHTML = `<span class="aura-song__number"></span>
        <span class="aura-song__text"><span class="aura-song__title"></span><span class="aura-song__meta"></span></span>
        <span class="aura-song__actions">
          <button class="aura-song__rename" aria-label="Rename this song" title="Rename">\u270E</button>
          <button class="aura-song__remove" aria-label="Remove this song">\u00D7</button>
        </span>`;
      item.querySelector(".aura-song__number").textContent = song.number;
      item.querySelector(".aura-song__title").textContent = song.title;
      item.querySelector(".aura-song__meta").textContent =
        `${song.source === "play" ? "From a play" : "Added"} \u00B7 ${song.date_label}`;
      item.querySelector(".aura-song__rename").addEventListener("click", () => startRename(item, song));
      item.querySelector(".aura-song__remove").addEventListener("click", () => removeSong(song.id));
      list.appendChild(item);
    });
  }

  /* Swap the title for a text box: Enter saves (Python checks the name), Escape cancels */
  function startRename(item, song) {
    const title = item.querySelector(".aura-song__title");
    const meta = item.querySelector(".aura-song__meta");
    const input = document.createElement("input");
    input.className = "aura-song__edit";
    input.maxLength = App.player.limits.song_title;
    input.value = song.title;
    input.setAttribute("aria-label", "Song name");
    title.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const save = async () => {
      if (done) return;
      done = true;
      if (input.value.trim() === song.title) {
        renderSongs(App.player.aura.songs);
        return;
      }
      try {
        await App.api("/api/songs/rename", { name: Survey.state.name, song_id: song.id, title: input.value,
                                             aura: App.player.showing });
        refresh();
      } catch (failure) {
        done = false;
        meta.textContent = failure.message;
        meta.classList.add("aura-song__edit-error");
        input.focus();
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") save();
      if (event.key === "Escape") {
        done = true;
        renderSongs(App.player.aura.songs);
      }
    });
    input.addEventListener("blur", save);
  }

  /* Python checks and analyses the lyrics, saves the song and sends back the bigger aura */
  async function addSong() {
    const button = document.getElementById("add-song-button");
    const error = document.getElementById("add-song-error");
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Reading the lyrics…";
    try {
      await App.api("/api/songs/add", {
        name: Survey.state.name,
        title: document.getElementById("song-title").value,
        lyrics: document.getElementById("song-lyrics").value,
      });
      document.getElementById("song-title").value = "";
      document.getElementById("song-lyrics").value = "";
      map.focus = null;
      refresh();
      map.followFor(3000);                                       // show the aura growing
      App.toast("Your aura just grew!");
    } catch (failure) {
      error.textContent = failure.message;
    } finally {
      button.disabled = false;
      button.textContent = "Add to my aura";
    }
  }

  async function removeSong(songId) {
    try {
      await App.api("/api/songs/delete", { name: Survey.state.name, song_id: songId, aura: App.player.showing });
      refresh();
    } catch (failure) {
      App.toast(failure.message);
    }
  }

  /* ---------- your auras: start a new one, or look back at an old one ---------- */

  function toggleNewAura(open) {
    const form = document.getElementById("new-aura-form");
    form.hidden = !open;
    document.getElementById("aura-new").setAttribute("aria-expanded", String(open));
    document.getElementById("new-aura-error").textContent = "";
    if (open) document.getElementById("new-aura-name").focus();
  }

  /* Python closes your current aura and starts an empty one (it checks the name and the rules) */
  async function startNewAura() {
    const input = document.getElementById("new-aura-name");
    try {
      await App.api("/api/auras/new", { name: Survey.state.name, aura_name: input.value });
    } catch (failure) {
      document.getElementById("new-aura-error").textContent = failure.message;
      return;
    }
    input.value = "";
    toggleNewAura(false);
    map.focus = null;
    // like your very first aura, the new one starts on the lyrics page with its first song
    const fresh = App.player.auras[App.player.auras.length - 1];
    Lyrics.setMode(fresh.label);
    App.go("lyrics");
  }

  /* Show a past aura (its number), or your current one (null) */
  async function openAura(number) {
    try {
      await App.api("/api/player", { name: Survey.state.name, aura: number });
    } catch (failure) {
      App.toast(failure.message);
      return;
    }
    map.focus = null;
    refresh();
    map.followFor(3000);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Every aura, newest first, as a colour swatch you can open (shown once you have more than one) */
  function renderAuras(auras) {
    document.getElementById("auras-card").hidden = auras.length < 2;
    const list = document.getElementById("aura-list");
    list.innerHTML = "";
    [...auras].reverse().forEach((aura) => {
      const item = document.createElement("li");
      item.className = "aura-song aura-entry";
      item.innerHTML = `<span class="aura-entry__swatch"></span>
        <button class="aura-song__text aura-entry__open"><span class="aura-song__title"></span><span class="aura-song__meta"></span></button>`;
      item.querySelector(".aura-entry__swatch").style.background = aura.glow ? aura.glow.colour : "#EEEEEE";
      item.querySelector(".aura-song__title").textContent = aura.current ? `${aura.label} (now)` : aura.label;
      item.querySelector(".aura-song__meta").textContent =
        `${aura.songs} song${aura.songs === 1 ? "" : "s"} \u00B7 ${aura.dates}`;
      item.classList.toggle("is-showing", aura.number === App.player.showing);
      item.querySelector(".aura-entry__open").addEventListener("click", () => openAura(aura.current ? null : aura.number));
      list.appendChild(item);
    });
  }

  return { init, show, leave };
})();

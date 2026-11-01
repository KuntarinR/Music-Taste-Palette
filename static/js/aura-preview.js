/* A small aura preview, drawn from a list of feelings. Two looks:
   - the homepage: a sample aura as one soft, uneven blob of colour with no box, slowly flowing and
     parting gently around the pointer;
   - the result page's teaser card: the player's real feelings (from Python) as pastel glows with
     twinkling sparkles that ease away from the pointer.
   Decoration only; the real data is on the aura page (aura.js). */

class AuraPreview {
  // A sample of feelings for the homepage, one or two from each family
  static SAMPLE = [
    { emotion: "nostalgia", percent: 24, family: "tender" }, { emotion: "joy", percent: 18, family: "bright" },
    { emotion: "sadness", percent: 15, family: "heavy" }, { emotion: "pumped_up", percent: 12, family: "fiery" },
    { emotion: "relaxation", percent: 11, family: "calm" }, { emotion: "hope", percent: 10, family: "bright" },
    { emotion: "desire", percent: 10, family: "tender" },
  ];
  static PUSH_RADIUS = 60;

  /* loose = true spreads the feelings apart (the homepage, with no card around it) */
  constructor(canvas, loose = false) {
    this.canvas = canvas;
    this.loose = loose;
    this.context = canvas.getContext("2d");
    this.pointer = null;
    this.running = false;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.frame = this.frame.bind(this);
    canvas.addEventListener("pointermove", (event) => {
      const box = canvas.getBoundingClientRect();
      this.pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
    });
    canvas.addEventListener("pointerleave", () => { this.pointer = null; });
  }

  /* feelings: [{emotion, percent, family}], strongest first */
  start(feelings) {
    const ratio = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = this.width * ratio;
    this.canvas.height = this.height * ratio;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.layOut(feelings.slice(0, 8));
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
  }

  /* The pointer gently pushes a cloud aside; a soft spring brings it back */
  nudge(cloud, x, y) {
    const reach = Math.min(this.width, this.height) * 0.3;
    if (this.pointer) {
      const dx = x + cloud.ox - this.pointer.x;
      const dy = y + cloud.oy - this.pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < reach && distance > 0.1) {
        const push = (1 - distance / reach) * 0.6;
        cloud.vx += (dx / distance) * push;
        cloud.vy += (dy / distance) * push;
      }
    }
    cloud.vx = (cloud.vx - cloud.ox * 0.015) * 0.9;
    cloud.vy = (cloud.vy - cloud.oy * 0.015) * 0.9;
    cloud.ox += cloud.vx;
    cloud.oy += cloud.vy;
  }

  /* A few clouds around a feeling, at random offsets: together they give the blob its uneven edge */
  static clouds(percent, size) {
    return Array.from({ length: 4 + Math.round(percent / 4) }, () => {
      const turn = Math.random() * Math.PI * 2;
      const away = size * (0.04 + Math.random() * 0.14);
      return { dx: Math.cos(turn) * away, dy: Math.sin(turn) * away, r: size * (0.1 + Math.random() * 0.1), phase: Math.random() * 6.3,
               wander: size * (0.06 + Math.random() * 0.07), speed: 0.7 + Math.random() * 0.6,
               ox: 0, oy: 0, vx: 0, vy: 0 };
    });
  }

  /* Feelings sit around the middle (the strongest closest); each gets a glow and a cloud of dots */
  layOut(feelings) {
    const size = Math.min(this.width, this.height);
    const centre = { x: this.width / 2, y: this.height * 0.56 };       // below the card's caption
    this.hubs = feelings.map((feeling, index) => {
      const angle = index * 2.4 + 0.6;
      const reach = this.loose
        ? size * (0.06 + 0.16 * ((index * 0.618) % 1))        // close together, so they join into one shape
        : (index === 0 ? 0 : size * (0.12 + 0.05 * Math.sqrt(index)));
      const radius = size * (0.07 + Math.sqrt(feeling.percent) * 0.012) * (this.loose ? 0.75 : 1);
      const colour = AuraMap.PASTELS[feeling.family] || "#CFC9E0";
      const dots = Array.from({ length: Math.round(6 + feeling.percent * 1.2) }, () => {
        const turn = Math.random() * Math.PI * 2;
        const spread = Math.min(2.6, Math.sqrt(-2 * Math.log(1 - Math.random() * 0.99)));
        const x = Math.cos(turn) * spread * radius * 0.7;
        const y = Math.sin(turn) * spread * radius * 0.7;
        return { x, y, homeX: x, homeY: y, vx: 0, vy: 0, r: 0.8 + Math.random() * 1.4, phase: Math.random() * 6.3 };
      });
      return { x: centre.x + Math.cos(angle) * reach, y: centre.y + Math.sin(angle) * reach, radius, colour, dots,
               clouds: this.loose ? AuraPreview.clouds(feeling.percent, size) : [] };
    });
  }

  /* One soft, uneven blob of colour: each feeling adds a few overlapping clouds, so the shape is irregular */
  drawBlob(time) {
    const c = this.context;
    c.save();
    c.filter = "blur(22px)";                        // melts the clouds into one shape (ignored where unsupported)
    for (const hub of this.hubs) {
      for (const cloud of hub.clouds) {
        // each cloud wanders slowly on its own path and grows and shrinks, so the shape keeps flowing
        const t = this.reducedMotion ? 0 : time * cloud.speed;
        let x = hub.x + cloud.dx + Math.sin(t / 3000 + cloud.phase) * cloud.wander;
        let y = hub.y + cloud.dy + Math.cos(t / 3600 + cloud.phase * 1.3) * cloud.wander;
        if (!this.reducedMotion) {
          this.nudge(cloud, x, y);
          x += cloud.ox;
          y += cloud.oy;
        }
        const r = cloud.r * (1 + 0.25 * Math.sin(t / 2600 + cloud.phase * 2));
        const glow = c.createRadialGradient(x, y, 0, x, y, r);
        glow.addColorStop(0, `${hub.colour}B3`);
        glow.addColorStop(1, `${hub.colour}00`);
        c.fillStyle = glow;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  frame(time) {
    if (!this.running) return;
    const c = this.context;
    c.clearRect(0, 0, this.width, this.height);

    // move the dots: a slow drift around home, and a gentle push away from the pointer
    if (!this.reducedMotion) {
      for (const hub of this.hubs) {
        for (const dot of hub.dots) {
          const tx = dot.homeX + Math.sin(time / 2200 + dot.phase) * 2.5;
          const ty = dot.homeY + Math.cos(time / 2700 + dot.phase) * 2.5;
          dot.vx += (tx - dot.x) * 0.02;
          dot.vy += (ty - dot.y) * 0.02;
          if (this.pointer) {
            const dx = hub.x + dot.x - this.pointer.x;
            const dy = hub.y + dot.y - this.pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance < AuraPreview.PUSH_RADIUS && distance > 0.1) {
              const push = (1 - distance / AuraPreview.PUSH_RADIUS) * 1.6;
              dot.vx += (dx / distance) * push;
              dot.vy += (dy / distance) * push;
            }
          }
          dot.vx *= 0.86;
          dot.vy *= 0.86;
          dot.x += dot.vx;
          dot.y += dot.vy;
        }
      }
    }

    // 1. on the homepage all the feelings make one soft uneven blob; on cards, pastel glows like an aura photograph
    if (this.loose) this.drawBlob(time);
    for (const hub of this.loose ? [] : this.hubs) {
      const pulse = this.reducedMotion ? 1 : 1 + 0.05 * Math.sin(time / 1700 + hub.x);
      const radius = hub.radius * (this.loose ? 2.1 : 3.2) * pulse;
      const glow = c.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, radius);
      glow.addColorStop(0, hub.colour);
      glow.addColorStop(0.45, `${hub.colour}88`);
      glow.addColorStop(1, `${hub.colour}00`);
      c.globalAlpha = 0.85;
      c.fillStyle = glow;
      c.beginPath();
      c.arc(hub.x, hub.y, radius, 0, Math.PI * 2);
      c.fill();
    }

    // 2. a few white sparkles with a soft coloured glow, twinkling (cards only; the homepage blob stays plain)
    c.save();
    c.fillStyle = "#FFFFFF";
    for (const hub of this.loose ? [] : this.hubs) {
      c.shadowColor = hub.colour;
      c.shadowBlur = 6;
      for (const dot of hub.dots) {
        c.globalAlpha = this.reducedMotion ? 0.9 : 0.55 + 0.4 * Math.sin(time / 700 + dot.phase * 3);
        c.beginPath();
        c.arc(hub.x + dot.x, hub.y + dot.y, dot.r, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    c.globalAlpha = 1;
    if (this.reducedMotion) {
      this.running = false;                     // one still picture is enough
      return;
    }
    requestAnimationFrame(this.frame);
  }
}

/* The homepage keeps one sample aura and starts/stops it with the page */
const HomeAura = (() => {
  let preview = null;
  let resizeTimer;

  function start() {
    const canvas = document.getElementById("sample-aura-canvas");
    if (!canvas) return;
    if (!preview) {
      preview = new AuraPreview(canvas, true);
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (App.current === "home") preview.start(AuraPreview.SAMPLE);
        }, 250);
      });
    }
    preview.start(AuraPreview.SAMPLE);
  }

  function stop() {
    if (preview) preview.stop();
  }

  return { start, stop };
})();

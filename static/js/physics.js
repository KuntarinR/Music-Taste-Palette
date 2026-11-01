/* A box of falling, draggable HTML elements, using Matter.js physics.
   Used by the falling letters on the lyrics page (lyrics.js).

   Each element is normal HTML. Matter.js moves an invisible body for it, and every frame
   we copy the body's position and angle onto the element. */

class PhysicsBox {
  static WALL = 60;              // thickness of the invisible floor and walls

  /* True if physics can run: Matter.js loaded and the user hasn't asked for reduced motion */
  static isAvailable() {
    return typeof Matter !== "undefined"
      && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  constructor(area) {
    const { Engine, Runner, Bodies, Composite, Events, Mouse, MouseConstraint } = Matter;
    this.area = area;
    this.items = [];
    this.width = area.clientWidth;
    this.height = area.clientHeight;
    this.engine = Engine.create();

    // Floor and side walls, just outside the visible area
    const wall = PhysicsBox.WALL;
    Composite.add(this.engine.world, [
      Bodies.rectangle(this.width / 2, this.height + wall / 2, this.width * 2, wall, { isStatic: true }),
      Bodies.rectangle(-wall / 2, 0, wall, this.height * 4, { isStatic: true }),
      Bodies.rectangle(this.width + wall / 2, 0, wall, this.height * 4, { isStatic: true }),
    ]);

    // Copy each body's position and angle onto its element every frame
    Events.on(this.engine, "afterUpdate", () => {
      for (const { element, body, w, h } of this.items) {
        const { x, y } = body.position;
        element.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${body.angle}rad)`;
      }
    });

    // Let the user grab and throw things with the mouse or a finger
    const mouse = Mouse.create(area);
    for (const name of ["wheel", "mousewheel", "DOMMouseScroll"]) {
      mouse.element.removeEventListener(name, mouse.mousewheel);      // keep normal page scrolling
    }
    Composite.add(this.engine.world, MouseConstraint.create(this.engine, {
      mouse, constraint: { stiffness: 0.2, render: { visible: false } },
    }));

    this.runner = Runner.create();
    Runner.run(this.runner, this.engine);
  }

  /* Add an element that falls from just above the area. x is its centre (random if left out).
     round = true gives pill-shaped corners. Returns the item so it can be removed later. */
  add(element, { x = null, round = false } = {}) {
    this.area.appendChild(element);
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    const centreX = x ?? w / 2 + Math.random() * Math.max(this.width - w, 1);
    const body = Matter.Bodies.rectangle(centreX, -h - 10, w, h, {
      chamfer: { radius: round ? h / 2 : 4 },
      restitution: 0.25,
      friction: 0.3,
      angle: (Math.random() - 0.5) * 0.6,
    });
    const item = { element, body, w, h };
    element.style.transform = `translate(${centreX - w / 2}px, ${-h - 10}px)`;
    Matter.Composite.add(this.engine.world, body);
    this.items.push(item);
    return item;
  }

  remove(item) {
    Matter.Composite.remove(this.engine.world, item.body);
    item.element.remove();
    this.items = this.items.filter((other) => other !== item);
  }

  stop() {
    Matter.Runner.stop(this.runner);
    Matter.Engine.clear(this.engine);
    this.items.forEach((item) => item.element.remove());
    this.items = [];
  }
}

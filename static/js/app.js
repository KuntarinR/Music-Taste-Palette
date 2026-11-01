/* Screen navigation and talking to the Python server. */

const App = {
  config: null,                    // survey questions, genres and aesthetics from /api/config
  result: null,                    // the latest answer from /api/analyse
  player: null,                    // the player's saved songs and latest result (from Python)
  current: "home",                 // the screen being shown

  async init() {
    try {
      const response = await fetch("/api/config");
      this.config = await response.json();
    } catch (error) {
      this.toast("We couldn't reach the app. Is main.py still running?");
      return;
    }
    HomeAura.start();
    Survey.init(this.config);
    Lyrics.init();
    Result.init();
    Aura.init();
    document.querySelectorAll("[data-go]").forEach((button) => {
      button.addEventListener("click", () => this.go(button.dataset.go));
    });
  },

  go(screenName) {
    const screen = document.getElementById(`screen-${screenName}`);
    if (!screen) {
      this.toast("This part is coming soon!");          // screens not built yet
      return;
    }
    const leaving = this.hooks()[this.current];
    if (leaving && leaving.leave) leaving.leave();

    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
    screen.classList.add("is-active");
    this.current = screenName;
    window.scrollTo(0, 0);
    document.getElementById("home-button").hidden = screenName === "home" || screenName === "loading";

    const entering = this.hooks()[screenName];
    if (entering && entering.enter) entering.enter();
  },

  /* What each screen does when it opens (enter) and closes (leave) */
  hooks() {
    return {
      home: {
        enter: () => HomeAura.start(),
        leave: () => HomeAura.stop(),
      },
      nickname: { enter: () => document.getElementById("nickname-input").focus() },
      lyrics: { enter: () => Lyrics.start(), leave: () => Lyrics.stop() },
      result: { enter: () => Result.show(this.result), leave: () => Result.leave() },
      aura: { enter: () => Aura.show(), leave: () => Aura.leave() },
    };
  },

  /* Let the user drag a sideways-scrolling row with the mouse (touch screens can already swipe).
     onRelease runs when they let go, e.g. to snap to the nearest card. */
  enableDragScroll(track, onRelease = () => {}) {
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    track.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.target.closest("button, input")) return;
      dragging = true;
      startX = event.clientX;
      startScroll = track.scrollLeft;
      track.classList.add("is-dragging");
    });
    window.addEventListener("pointermove", (event) => {
      if (dragging) track.scrollLeft = startScroll - (event.clientX - startX);
    });
    window.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      track.classList.remove("is-dragging");
      onRelease();
    });
  },

  /* POST to the Python server. Returns the JSON answer, or throws an Error with the
     friendly message from main.py (or a "can't reach the app" message). */
  async api(path, body) {
    let response;
    let data;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      data = await response.json();
    } catch (error) {
      throw new Error("We couldn't reach the app. Is main.py still running?");
    }
    if (!response.ok) throw new Error(data.error);
    if (data.player) this.player = data.player;       // keep the latest saved data
    return data;
  },

  toast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2500);
  },
};

App.init();

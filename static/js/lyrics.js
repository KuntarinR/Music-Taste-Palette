/* The lyrics page: a growing input box, letters that fall into a pile as you type
   (physics in physics.js), and sending everything to the server for analysis. */

const Lyrics = (() => {
  const MAX_CHARS = 3000;           // same limit as the server (LYRICS_MAX_CHARS in main.py)
  const MAX_LETTERS = 140;          // letters in the pile at once; the oldest disappear first
  const PASTE_LETTERS = 40;         // a paste drops this many letters, not the whole song
  const START_WORD = "LYRICS";      // dropped in when the page opens, like the sketch
  const LETTER_COLOURS = ["#F4A3A0", "#F2A7C8", "#B3A6F2", "#F5CF7A", "#8FDCCB"];   // the aura pastels

  let box = null;
  let timers = [];
  let newAura = null;               // the new aura's name when its first song is being added, else null
  let dropped = 0;                  // counts letters, so every few one gets a colour

  function init() {
    const input = document.getElementById("lyrics-input");
    input.addEventListener("input", (event) => {
      updateCount();
      fitToText();
      showError("");
      if (event.inputType === "insertText" && event.data) dropLetters(event.data);
      if (event.inputType && event.inputType.startsWith("delete")) removeNewestLetter();
    });
    input.addEventListener("paste", (event) => {
      const text = (event.clipboardData || window.clipboardData).getData("text");
      dropLetters(text.slice(0, PASTE_LETTERS * 3), PASTE_LETTERS, 35);
    });
    document.getElementById("lyrics-form").addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });
  }

  /* ---------- the page opening and closing ---------- */

  function start() {
    stop();
    const area = document.getElementById("letter-area");
    if (PhysicsBox.isAvailable()) {
      box = new PhysicsBox(area);
      dropLetters(START_WORD, START_WORD.length, 150);
    }
    updateCount();
    fitToText();
    document.getElementById("lyrics-input").focus();
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    if (box) box.stop();
    box = null;
  }

  /* ---------- falling letters ---------- */

  function makeLetter(character) {
    const letter = document.createElement("span");
    letter.className = "letter";
    letter.textContent = character.toUpperCase();
    letter.style.fontSize = `${30 + Math.random() * 22}px`;
    dropped += 1;
    if (dropped % 4 === 0) letter.style.color = LETTER_COLOURS[dropped % LETTER_COLOURS.length];
    return letter;
  }

  /* Drop the letters and numbers in `text` (spaces and punctuation are skipped) */
  function dropLetters(text, limit = Infinity, delayMs = 0) {
    if (!box) return;
    const characters = [...text].filter((c) => /[\p{L}\p{N}]/u.test(c)).slice(0, limit);
    characters.forEach((character, index) => {
      const drop = () => {
        if (!box) return;
        box.add(makeLetter(character));
        if (box.items.length > MAX_LETTERS) box.remove(box.items[0]);
      };
      if (delayMs === 0) drop();
      else timers.push(setTimeout(drop, index * delayMs));
    });
  }

  function removeNewestLetter() {
    if (box && box.items.length > 0) box.remove(box.items[box.items.length - 1]);
  }

  /* ---------- the input box ---------- */

  /* Grow the box to fit the lyrics (CSS min-height and max-height set the limits) */
  function fitToText() {
    const input = document.getElementById("lyrics-input");
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }

  function updateCount() {
    const length = document.getElementById("lyrics-input").value.length;
    const count = document.getElementById("lyrics-count");
    count.textContent = `${length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
    count.classList.toggle("is-over", length > MAX_CHARS);
  }

  function showError(message) {
    document.getElementById("lyrics-error").textContent = message;
  }

  /* A full play (null), or the first song of a new aura (its name): the title, the back button
     and where the lyrics go all follow this */
  function setMode(auraLabel) {
    newAura = auraLabel;
    const title = document.getElementById("lyrics-title");
    const back = document.getElementById("lyrics-back");
    if (newAura) {
      title.innerHTML = "Your new aura starts here.<br>Paste its first <em>song</em>!";
      back.dataset.go = "aura";
      back.setAttribute("aria-label", "Back to your aura");
    } else {
      title.innerHTML = "Be ready and type in<br>or paste your <em>lyrics</em> here!";
      back.dataset.go = "genres";
      back.setAttribute("aria-label", "Back to genres");
    }
    document.getElementById("lyrics-input").value = "";
    document.getElementById("song-name").value = "";
    updateCount();
    showError("");
  }

  /* ---------- sending to the server ---------- */

  /* Show the loading screen while the server analyses the lyrics.
     The result opens when both the short loading animation and the server are done. */
  async function submit() {
    const lyrics = document.getElementById("lyrics-input").value;
    if (newAura) {
      addFirstSong(lyrics);
      return;
    }
    App.go("loading");
    const loading = Loading.play();
    let result;
    try {
      const title = document.getElementById("song-name").value;          // optional: names the song in your aura
      result = await App.api("/api/analyse", { ...Survey.state, lyrics, title });   // Python also adds it to your aura
      await App.api("/api/player", { name: Survey.state.name });             // the updated aura
    } catch (error) {
      backWithError(error.message);                  // friendly message from main.py
      return;
    }
    await loading;
    App.result = result;
    App.go("result");
  }

  /* A new aura's first song: no questions or result cards, just into the aura, then back to it */
  async function addFirstSong(lyrics) {
    App.go("loading");
    const loading = Loading.play();
    try {
      const title = document.getElementById("song-name").value;
      await App.api("/api/songs/add", { name: Survey.state.name, title, lyrics });
    } catch (error) {
      backWithError(error.message);
      return;
    }
    await loading;
    const label = newAura;
    setMode(null);
    App.go("aura");
    App.toast(`${label} has its first colour!`);
  }

  function backWithError(message) {
    Loading.stop();
    App.go("lyrics");
    showError(message);
  }

  return { init, start, stop, setMode };
})();

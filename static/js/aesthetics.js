/* Small helpers for showing aesthetics: their symbol, and readable text on their colour. */

const Aesthetics = (() => {
  // One symbol per aesthetic
  const ICONS = {
    nostalgic: "☾", rainbow_sunshine: "☼", fun_at_the_party: "♪",
    hopeless_romantic: "♡", main_character: "✦", dreamer: "✧",
    protecting_my_peace: "✿", manifestor: "✸",
  };

  /* Dark text on light colours, white text on dark colours */
  function textColour(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 150 ? "#161616" : "#FFFFFF";
  }

  /* The symbol for an aesthetic, e.g. "nostalgic" -> moon */
  function icon(key) {
    return ICONS[key] || "✦";
  }

  return { textColour, icon };
})();

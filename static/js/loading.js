/* The loading screen: the equaliser bounces while Python analyses the lyrics.
   It stays up for a short minimum time, so the page doesn't just flash past on fast computers. */

const Loading = (() => {
  const MIN_SHOW_MS = 1600;

  let timer = null;

  /* Returns a Promise that finishes once the minimum time has passed */
  function play() {
    stop();
    return new Promise((resolve) => { timer = setTimeout(resolve, MIN_SHOW_MS); });
  }

  function stop() {
    clearTimeout(timer);
  }

  return { play, stop };
})();

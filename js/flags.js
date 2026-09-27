/* ---------------------------------------------------------------------------
   Flag emoji for devices that cannot draw them.

   Windows has no flag emoji and prints the two country letters instead ("FR"
   for France), so there we borrow Google's Noto Color Emoji, cut down to just
   the flag letters. Everywhere else the device's own flags are used — iPhones
   in particular must not get Noto: Safari cannot paint its colour gradients
   and the blue of the French flag comes out black.

   Deliberately a plain script loaded in <head>, not a module, so the font is
   requested before the page first paints.
   --------------------------------------------------------------------------- */

(function () {
  function drawsFlags() {
    try {
      var c = document.createElement('canvas');
      c.width = c.height = 32;
      var x = c.getContext('2d', { willReadFrequently: true });
      x.textBaseline = 'top';
      x.font = '28px sans-serif';
      x.fillText('\u{1F1EB}\u{1F1F7}', 0, 0);   // the French flag
      var d = x.getImageData(0, 0, 32, 32).data;
      /* A real flag has blue and red in it; the letter fallback is grey. */
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) {
          return true;
        }
      }
      return false;
    } catch (e) {
      return true;   // cannot tell; trust the device rather than risk the black-flag bug
    }
  }

  if (drawsFlags()) return;
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap&text=%F0%9F%87%A6%F0%9F%87%A8%F0%9F%87%A9%F0%9F%87%AA%F0%9F%87%AB%F0%9F%87%AD%F0%9F%87%AF%F0%9F%87%B0%F0%9F%87%B1%F0%9F%87%B3%F0%9F%87%B5%F0%9F%87%B7%F0%9F%87%B8%F0%9F%87%B9%F0%9F%87%BA';
  document.head.appendChild(link);
})();

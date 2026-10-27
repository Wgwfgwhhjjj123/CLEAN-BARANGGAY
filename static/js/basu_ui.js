/* BasuReport UI add-on. Adds the show/hide password eye to every password box.
   <script src="{{ url_for('static', filename='js/basu_ui.js') }}"></script> */
(function () {
  function addEyes() {
    document.querySelectorAll('input[type="password"]:not([data-eye])').forEach(function (inp) {
      inp.dataset.eye = "1";
      var wrap = document.createElement("span"); wrap.className = "pw-wrap";
      inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "pw-eye"; btn.textContent = "👁";
      btn.setAttribute("aria-label", "Show or hide password");
      btn.onclick = function () {
        var show = inp.type === "password";
        inp.type = show ? "text" : "password"; btn.textContent = show ? "🙈" : "👁";
      };
      wrap.appendChild(btn);
    });
  }
  document.addEventListener("DOMContentLoaded", addEyes);
})();

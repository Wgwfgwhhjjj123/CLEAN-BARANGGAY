/* BasuReport sign-up: animations + small UX touches.
   Works alongside signup.js (password rules / strength). */
(function () {
    'use strict';

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function ready(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    ready(function () {
        var body = document.body;
        var card = document.getElementById('signup-card');
        var side = document.getElementById('signup-side');
        var form = document.getElementById('signup-form');
        var pw = document.getElementById('password');
        var cpw = document.getElementById('confirm_password');
        var msg = document.getElementById('match-msg');
        var btn = document.getElementById('signup-btn');
        var guidance = document.getElementById('password-guidance');
        var meter = document.getElementById('password-strength');

        /* 1. Staggered entrance ------------------------------------------ */
        document.querySelectorAll('.reveal').forEach(function (el, i) {
            el.style.setProperty('--i', i);
        });
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { body.classList.add('is-ready'); });
        });

        /* 2. Floating leaves in the green panel -------------------------- */
        var fx = document.getElementById('side-fx');
        if (fx && !reduce) {
            for (var i = 0; i < 14; i++) {
                var leaf = document.createElement('span');
                leaf.className = 'leaf';
                leaf.style.setProperty('--l', (Math.random() * 92 + 2).toFixed(1) + '%');
                leaf.style.setProperty('--s', (Math.random() * 12 + 9).toFixed(0) + 'px');
                leaf.style.setProperty('--t', (Math.random() * 9 + 10).toFixed(1) + 's');
                leaf.style.setProperty('--d', (-Math.random() * 18).toFixed(1) + 's');
                leaf.style.setProperty('--x', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
                fx.appendChild(leaf);
            }
        }

        /* 3. Rotating headline ------------------------------------------- */
        var rot = document.getElementById('rotator');
        if (rot && !reduce) {
            var lines = [
                'Keep our community clean.',
                'Report issues in seconds.',
                'Track every report, live.',
                'Small actions, big change.'
            ];
            var idx = 0;
            setInterval(function () {
                rot.classList.add('out');
                setTimeout(function () {
                    idx = (idx + 1) % lines.length;
                    rot.textContent = lines[idx];
                    rot.classList.remove('out');
                }, 380);
            }, 3600);
        }

        /* 4. Soft parallax on the green panel ---------------------------- */
        if (card && side && !reduce && window.matchMedia('(pointer: fine)').matches) {
            var raf = null;
            card.addEventListener('mousemove', function (e) {
                if (raf) return;
                raf = requestAnimationFrame(function () {
                    var r = card.getBoundingClientRect();
                    side.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
                    side.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
                    raf = null;
                });
            });
            card.addEventListener('mouseleave', function () {
                side.style.setProperty('--mx', 0);
                side.style.setProperty('--my', 0);
            });
        }

        /* 5. Button ripple ------------------------------------------------ */
        document.querySelectorAll('.signup-btn, .btn-ghost').forEach(function (el) {
            el.addEventListener('pointerdown', function (e) {
                if (reduce) return;
                var r = el.getBoundingClientRect();
                var size = Math.max(r.width, r.height) * 2;
                var dot = document.createElement('span');
                dot.className = 'ripple';
                dot.style.width = dot.style.height = size + 'px';
                dot.style.left = (e.clientX - r.left - size / 2) + 'px';
                dot.style.top = (e.clientY - r.top - size / 2) + 'px';
                el.appendChild(dot);
                setTimeout(function () { dot.remove(); }, 650);
            });
        });

        /* 6. Valid-field tick (name + email) ------------------------------ */
        ['fullname', 'email'].forEach(function (id) {
            var input = document.getElementById(id);
            if (!input) return;
            function check() {
                var good = input.value.trim().length > 0 && input.checkValidity();
                input.parentNode.classList.toggle('ok', good);
            }
            input.addEventListener('input', check);
            input.addEventListener('blur', check);
            check();
        });

        /* 7. Live "passwords match" message ------------------------------- */
        function updateMatch() {
            if (!msg || !pw || !cpw) return;
            if (!cpw.value) {
                msg.className = 'match-msg';
                msg.textContent = '';
                cpw.parentNode.classList.remove('ok');
                return;
            }
            var same = pw.value === cpw.value;
            msg.className = 'match-msg show ' + (same ? 'ok' : 'bad');
            msg.textContent = same ? '\u2713 Passwords match' : '\u2715 Passwords do not match yet';
            cpw.parentNode.classList.toggle('ok', same);
        }
        if (pw && cpw) {
            pw.addEventListener('input', updateMatch);
            cpw.addEventListener('input', updateMatch);
        }

        /* 8. Celebrate when the password turns strong --------------------- */
        function confetti() {
            if (!guidance || reduce || !guidance.animate) return;
            var colors = ['#2fd39a', '#1fa06f', '#7ff0c6', '#e3b649', '#146146'];
            var box = guidance.getBoundingClientRect();
            var track = meter ? meter.getBoundingClientRect() : box;
            var ox = track.left - box.left + 40;
            var oy = track.top - box.top;
            for (var i = 0; i < 16; i++) {
                var bit = document.createElement('span');
                bit.className = 'confetti';
                bit.style.background = colors[i % colors.length];
                bit.style.left = ox + 'px';
                bit.style.top = oy + 'px';
                guidance.appendChild(bit);
                var angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
                var dist = 50 + Math.random() * 70;
                var anim = bit.animate([
                    { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
                    { transform: 'translate(' + Math.cos(angle) * dist + 'px,' + (Math.sin(angle) * dist - 20) + 'px) rotate(' + (Math.random() * 540) + 'deg) scale(.4)', opacity: 0 }
                ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.2,1)' });
                anim.onfinish = (function (el) { return function () { el.remove(); }; })(bit);
            }
        }
        if (meter && guidance) {
            var wasStrong = meter.getAttribute('data-strength') === 'strong';
            new MutationObserver(function () {
                var strong = meter.getAttribute('data-strength') === 'strong';
                if (strong && !wasStrong) {
                    guidance.classList.remove('celebrate');
                    void guidance.offsetWidth;
                    guidance.classList.add('celebrate');
                    confetti();
                }
                wasStrong = strong;
            }).observe(meter, { attributes: true, attributeFilter: ['data-strength'] });
        }

        /* 9. Submit: block mismatch (with shake), otherwise show spinner -- */
        if (form) {
            form.addEventListener('submit', function (e) {
                if (pw && cpw && pw.value !== cpw.value) {
                    e.preventDefault();
                    updateMatch();
                    var holder = cpw.parentNode;
                    holder.classList.remove('shake');
                    void holder.offsetWidth;
                    holder.classList.add('shake');
                    cpw.focus();
                    return;
                }
                if (btn) btn.classList.add('loading');
            });
        }
        window.addEventListener('pageshow', function () {
            if (btn) btn.classList.remove('loading');
        });
    });
})();

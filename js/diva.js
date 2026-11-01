// 💅
import { esc } from './core.js';

export function showDiva(name = 'Dimitris') {
  if (document.querySelector('.diva-layer')) return;
  const el = document.createElement('div');
  el.className = 'diva-layer';
  el.setAttribute('role', 'dialog');
  const bits = ['✨', '💅', '👑', '💎', '✨', '🎬', '💖', '✨'];
  const rain = Array.from({ length: 34 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${((i * 0.29) % 3).toFixed(2)}s;animation-duration:${(3 + (i % 5) * 0.6).toFixed(1)}s;font-size:${14 + (i % 4) * 7}px">${bits[i % bits.length]}</i>`).join('');
  el.innerHTML = `<style>
    .diva-layer{position:fixed;inset:0;z-index:500;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 35%,#5b1d6e 0%,#24062e 55%,#0d0212 100%);color:#fff;animation:divaIn .45s cubic-bezier(.2,.9,.3,1.2) both;cursor:pointer;text-align:center;padding:24px}
    .diva-layer .rain{position:absolute;inset:0;pointer-events:none}
    .diva-layer .rain i{position:absolute;top:-40px;font-style:normal;animation:divaFall linear infinite;opacity:.9}
    .diva-layer .crown{font-size:64px;animation:divaBob 2.2s ease-in-out infinite;filter:drop-shadow(0 6px 18px rgba(255,200,80,.5))}
    .diva-layer h1{margin:4px 0 0;font-family:Georgia,serif;font-size:clamp(72px,22vw,150px);line-height:.95;letter-spacing:.06em;font-weight:800;background:linear-gradient(100deg,#ffd76a 0%,#ff8fd8 30%,#fff 50%,#b48cff 70%,#ffd76a 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:divaShine 2.6s linear infinite;text-shadow:0 0 40px rgba(255,140,220,.25)}
    .diva-layer .sub{margin-top:14px;font-size:clamp(16px,4.6vw,22px);font-weight:700;letter-spacing:.02em}
    .diva-layer .tiny{margin-top:8px;font-size:13px;opacity:.75;letter-spacing:.12em;text-transform:uppercase}
    .diva-layer .tap{margin-top:28px;font-size:12px;opacity:.55}
    .diva-layer.out{animation:divaOut .3s ease forwards}
    @keyframes divaIn{from{opacity:0;transform:scale(1.08)}to{opacity:1;transform:none}}
    @keyframes divaOut{to{opacity:0;transform:scale(.96)}}
    @keyframes divaFall{to{transform:translateY(115vh) rotate(360deg)}}
    @keyframes divaBob{50%{transform:translateY(-8px) rotate(-6deg)}}
    @keyframes divaShine{to{background-position:-250% 0}}
  </style>
  <div class="rain">${rain}</div>
  <div style="position:relative">
    <div class="crown">👑</div>
    <h1>DIVA</h1>
    <div class="sub">Ο ${esc(name)} μπήκε σε DIVA MODE 💅</div>
    <div class="tiny">Unboxholics vibes · editing με στιλ</div>
    <div class="tap">πάτα οπουδήποτε για να γυρίσεις στο μοντάζ</div>
  </div>`;
  document.body.appendChild(el);
  try { navigator.vibrate?.([30, 40, 30, 40, 80]); } catch { /* */ }
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.addEventListener('click', close);
  setTimeout(() => { if (el.isConnected) close(); }, 9000);
}

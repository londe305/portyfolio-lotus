// Helpers
const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));

/* =========================
   FONCTIONS PARTAGÉES
========================= */
function activateSubtab(sectionEl, subId){
  const tabs   = $$(".subtabs li", sectionEl);
  const panels = $$(".subpanel", sectionEl);
  tabs.forEach(t => t.classList.remove("active"));
  panels.forEach(p => p.classList.remove("active"));
  sectionEl.querySelector(`.subtabs li[data-sub="${subId}"]`)?.classList.add("active");
  sectionEl.querySelector("#"+subId)?.classList.add("active");
}

function setTreeOpen(parentLi, open){
  const ul = parentLi.querySelector(".tree-children");
  if (!ul) return;
  ul.style.willChange = "max-height";
  ul.style.overflow = "hidden";
  if (open){
    parentLi.classList.add("open");
    parentLi.setAttribute("aria-expanded","true");
    ul.style.maxHeight = ul.scrollHeight + "px";
  } else {
    parentLi.classList.remove("open");
    parentLi.setAttribute("aria-expanded","false");
    ul.style.maxHeight = "0px";
  }
  setTimeout(()=>{ ul.style.willChange = "auto"; }, 300);
}

function syncSidebarTree(sectionId, subId){
  const group = document.querySelector(`.sidebar li.has-children[data-section="${sectionId}"]`);
  if (group) setTreeOpen(group, true);

  // Actif visuel dans le tree
  $$(".tree-item").forEach(x => x.classList.remove("active"));
  if (subId){
    document.querySelector(`.tree-item[data-section="${sectionId}"][data-sub="${subId}"]`)?.classList.add("active");
  }

  // Actif visuel du parent / élément simple
  $$(".sidebar li").forEach(i => i.classList.remove("active"));
  if (group) group.classList.add("active");
  else document.querySelector(`.sidebar li[data-section="${sectionId}"]`)?.classList.add("active");
}

function goTo(sectionId, subId=null){
  // Sections
  const sections = $$(".section");
  sections.forEach(s => s.classList.remove("active"));
  const sectionEl = $("#"+sectionId);
  if (!sectionEl) return;
  sectionEl.classList.add("active");

  // Jeu : pause/resume
  if (typeof dinoGame !== "undefined"){
    if (sectionId === "jeu") dinoGame.resume(); else dinoGame.pause();
  }

  // Sous-onglet
  const firstTab = sectionEl.querySelector(".subtabs li");
  const firstSub = firstTab?.getAttribute("data-sub");
  if (subId){
    activateSubtab(sectionEl, subId);
  } else if (firstSub){
    activateSubtab(sectionEl, firstSub);
    subId = firstSub;
  }

  // Synchro tree
  syncSidebarTree(sectionId, subId);
}

/* =========================
   SIDEBAR (délégation)
========================= */
function initSidebar(){
  const sidebar = $(".sidebar");
  if (!sidebar) return;

  // État initial : groupes fermés
  $$(".sidebar li.has-children").forEach(parent => {
    const children = parent.querySelector(".tree-children");
    if (children){
      children.style.maxHeight = "0px";
      parent.setAttribute("aria-expanded","false");
      parent.classList.remove("open");
    }
  });

  sidebar.addEventListener("click", (e) => {
    const caret = e.target.closest(".caret");
    if (caret){
      const parent = caret.closest("li.has-children");
      setTreeOpen(parent, !parent.classList.contains("open"));
      return;
    }

    const li = e.target.closest("li");
    if (!li || !sidebar.contains(li)) return;

    // Titre non cliquable (pas de data-section)
    const sectionId = li.getAttribute("data-section");
    if (!sectionId) return;

    // Ouvrir un groupe parent si fermé
    if (li.classList.contains("has-children") && !li.classList.contains("open")){
      setTreeOpen(li, true);
    }

    const subId = li.getAttribute("data-sub") || null;
    goTo(sectionId, subId);
  });
}
initSidebar();

/* =========================
   SOUS-ONGLETS (contenu)
========================= */
function initSubtabs(sectionId){
  const section = $("#"+sectionId);
  if (!section) return;
  section.querySelectorAll(".subtabs li").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      const sub = tab.getAttribute("data-sub");
      activateSubtab(section, sub);
      syncSidebarTree(sectionId, sub);

      // Activer visuellement le parent dans la sidebar
      $$(".sidebar li").forEach(i => i.classList.remove("active"));
      const parent = document.querySelector(`.sidebar li.has-children[data-section="${sectionId}"]`);
      parent?.classList.add("active");
    });
  });
}
["alternance","e6","certifications"].forEach(initSubtabs);

/* =========================
   VEILLE Zero Trust – RSS
========================= */
const FEEDS = [
  "https://www.csoonline.com/index.rss",
  "https://www.microsoft.com/en-us/security/blog/feed/"
];

async function loadRSS() {
  const container = $("#rss-container");
  if (!container) return;
  container.innerHTML = "<p>Chargement des flux…</p>";

  try {
    const items = [];
    for (const url of FEEDS) {
      const proxied = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
      const res = await fetch(proxied);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const xml = await res.text();
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const nodes = [...doc.querySelectorAll("item")].slice(0, 5);
      for (const n of nodes) {
        items.push({
          title: (n.querySelector("title")?.textContent || "Sans titre").trim(),
          link:  (n.querySelector("link")?.textContent || "#").trim(),
          date:  new Date(n.querySelector("pubDate")?.textContent || Date.now())
        });
      }
    }
    items.sort((a,b)=> b.date - a.date);
    container.innerHTML = "";
    items.slice(0,8).forEach(it=>{
      const p = document.createElement("p");
      const a = document.createElement("a");
      a.href = it.link; a.textContent = it.title; a.target = "_blank"; a.rel = "noopener";
      p.appendChild(a);
      container.appendChild(p);
    });
    if (!container.innerHTML) container.innerHTML = "<p>Aucun article n’a pu être chargé.</p>";
  } catch (err){
    container.innerHTML = "<p>Impossible de charger le flux RSS (CORS ou réseau). Lance un serveur local.</p>";
  }
}
loadRSS();

/* =========================
   🎮 JEU – DINO SIO
========================= */
const dinoGame = (function(){
  const canvas = $("#dino-canvas");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return { resume(){}, pause(){}, reset(){} };

  const scoreEl = $("#score");
  const levelEl = $("#level-label");
  const msgEl   = $("#game-msg");
  const btnStart   = $(".btn-start");
  const btnRestart = $(".btn-restart");
  const btnDiff    = $(".btn-difficulty");
  const modal      = $("#diff-modal");
  const btnClose   = $(".btn-close-modal");

  const levels = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e","Seconde","Première","Terminale"];
  const GROUND_Y = canvas.height - 30;
  const DINO = { x: 40, y: GROUND_Y-30, w: 26, h: 30, vy: 0, onGround: true };
  const GRAVITY = 1200, JUMP_VY = -520, OB_MIN_H = 22, OB_MAX_H = 46, OB_W = 22;

  let running=false, paused=true, lastTs=0, speed=220, score=0, levelIx=0, spawnT=0, spawnDelay=1.4;
  let obstacles=[];

  function reset(){
    running=false; paused=true; lastTs=0; speed=220; score=0; levelIx=0; spawnT=0; spawnDelay=1.4; obstacles=[];
    DINO.y = GROUND_Y-30; DINO.vy=0; DINO.onGround=true; updateHUD(); clearMsg(); render(0);
  }
  function start(){ if (running) return; running=true; paused=false; lastTs=performance.now(); requestAnimationFrame(loop); }
  function pause(){ paused=true; showMsg("⏸ Jeu en pause<br><small>Reviens quand tu veux&nbsp;!</small>"); }
  function resume(){ if (!running){ start(); return; } if (!paused) return; paused=false; clearMsg(); lastTs=performance.now(); requestAnimationFrame(loop); }

  function loop(ts){ if (!running || paused) return; const dt=Math.min(0.032,(ts-lastTs)/1000); lastTs=ts; update(dt); render(); requestAnimationFrame(loop); }

  function update(dt){
    score += Math.floor(dt * 100); updateProgression();
    DINO.vy += GRAVITY * dt; DINO.y += DINO.vy * dt;
    if (DINO.y >= GROUND_Y - DINO.h){ DINO.y = GROUND_Y - DINO.h; DINO.vy=0; DINO.onGround=true; }

    spawnT += dt;
    if (spawnT >= spawnDelay){
      spawnT=0; const h=rnd(OB_MIN_H,OB_MAX_H);
      obstacles.push({ x: canvas.width+20, y: GROUND_Y-h, w: OB_W, h, label: levels[levelIx] });
    }
    obstacles.forEach(o=> o.x -= speed*dt);
    obstacles = obstacles.filter(o=> o.x + o.w > -10);

    for (const o of obstacles){ if (intersect(DINO,o)){ gameOver(o.label); return; } }
  }

  function render(){
    ctx.fillStyle="#0a1418"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle="rgba(51,230,204,.35)";
    ctx.beginPath(); ctx.moveTo(0,GROUND_Y+0.5); ctx.lineTo(canvas.width,GROUND_Y+0.5); ctx.stroke();

    ctx.fillStyle="#33e6cc"; ctx.fillRect(DINO.x,DINO.y,DINO.w,DINO.h);
    ctx.fillStyle="#081116"; ctx.fillRect(DINO.x + DINO.w - 8, DINO.y + 6, 4, 4);

    ctx.fillStyle="#7fe7ff"; ctx.font="12px monospace";
    obstacles.forEach(o=>{
      ctx.fillStyle="#7fe7ff"; ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.fillStyle="#b3fff5"; ctx.fillText(o.label, o.x - 6, o.y - 6);
    });

    ctx.fillStyle="rgba(0,0,0,.15)"; ctx.fillRect(canvas.width-160,8,152,40);
    ctx.fillStyle="#cfe"; ctx.font="12px monospace";
    ctx.fillText("Score: "+score, canvas.width-150, 24);
    ctx.fillText("Niveau: "+levels[levelIx], canvas.width-150, 40);
  }

  function updateProgression(){
    const ix=Math.min(levels.length-1, Math.floor(score/300));
    if (ix!==levelIx){
      levelIx=ix;
      speed=220+levelIx*32;
      spawnDelay=Math.max(0.7,1.4 - levelIx*0.06);
      updateHUD();
    } else {
      updateHUD(false);
    }
  }

  function updateHUD(force=true){ if (!scoreEl||!levelEl) return; scoreEl.textContent=score; if (force) levelEl.textContent=levels[levelIx]; }

  function gameOver(label){
    running=false; paused=true;
    showMsg(`💥 Aïe… tu as buté sur <strong>${label}</strong>.<br><small>⟲ Rejoue pour viser la Terminale.</small>`);
  }

  function showMsg(html){ if (!msgEl) return; msgEl.innerHTML=html; msgEl.classList.remove("hidden"); }
  function clearMsg(){ if (!msgEl) return; msgEl.classList.add("hidden"); msgEl.innerHTML=""; }

  function intersect(a,b){ return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
  function rnd(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

  function jump(){ if (!running) start(); if (DINO.onGround){ DINO.vy=-520; DINO.onGround=false; } }
  window.addEventListener("keydown", (e)=>{ if (e.code==="Space"||e.code==="ArrowUp"){ e.preventDefault(); jump(); } });
  canvas.addEventListener("pointerdown", jump);

  btnStart?.addEventListener("click", ()=> start());
  btnRestart?.addEventListener("click", ()=> { reset(); start(); });
  btnDiff?.addEventListener("click", ()=> { modal?.classList.remove("hidden"); });
  btnClose?.addEventListener("click", ()=> { modal?.classList.add("hidden"); });
  modal?.addEventListener("click", (e)=>{ if (e.target===modal) modal.classList.add("hidden"); });

  reset();
  return { resume, pause, reset };
})();

/* =========================
   FOND DYNAMIQUE : MATRIX RAIN (module contrôlable)
========================= */
const MatrixRain = (function(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('matrix');
  if (!canvas) return { start(){}, stop(){}, isRunning(){return false;} };

  const ctx = canvas.getContext('2d');
  const GLYPHS = 'アカサタナハマヤラワ0123456789ABCDEF';
  const BASE = 14;       // px avant DPR
  const TRAIL = 0.08;    // rémanence (0.05–0.12)
  let DPR, W, H, STEP, COLS, drops;
  let running = false;
  let raf = null;

  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.floor(window.innerWidth  * DPR);
    canvas.height = Math.floor(window.innerHeight * DPR);
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';

    W=canvas.width; H=canvas.height;
    STEP = Math.round(BASE * DPR);
    COLS = Math.max(1, Math.floor(W / STEP));
    drops = new Array(COLS).fill(0);
    ctx.font = `${STEP}px monospace`;
  }

  function draw(){
    ctx.fillStyle = `rgba(0,0,0,${TRAIL})`;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(51,230,204,0.85)';
    for (let i=0; i<drops.length; i++){
      const ch = GLYPHS[(Math.random()*GLYPHS.length)|0];
      const x = i * STEP;
      const y = drops[i] * (STEP + 2);
      ctx.fillText(ch, x, y);
      if (y > H && Math.random() > 0.975) drops[i] = 0;
      else drops[i]++;
    }
  }

  function loop(){
    if (!running) return;
    draw();
    raf = requestAnimationFrame(loop);
  }

  function onVisibility(){
    if (!running) return;
    if (document.visibilityState === 'hidden'){
      cancelAnimationFrame(raf);
      raf = null;
    } else {
      raf = requestAnimationFrame(loop);
    }
  }

  function start(){
    if (reduce || running) return;
    canvas.style.display = 'block';
    resize();
    running = true;
    raf = requestAnimationFrame(loop);
  }

  function stop(){
    if (!running) return;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    canvas.style.display = 'none';
  }

  window.addEventListener('resize', ()=> running && resize());
  document.addEventListener('visibilitychange', onVisibility);

  return { start, stop, isRunning:()=>running };
})();

/* =========================
   SÉLECTEUR DE FOND (UI + logique)
========================= */
const BgManager = (function(){
  const body = document.body;
  const MODES = ['matrix','gradient','hex','none'];
  const STORAGE_KEY = 'bgMode';
  const btn = $('.bg-btn');
  const menu = $('.bg-menu');

  function setAriaChecked(mode){
    $$('.bg-menu [role="menuitemradio"]').forEach(b=>{
      b.setAttribute('aria-checked', b.dataset.bg === mode ? 'true' : 'false');
    });
  }

  function apply(mode){
    // Nettoie les classes
    body.classList.remove('bg-matrix','bg-gradient','bg-hex');
    // Arrête Matrix par défaut
    MatrixRain.stop();

    switch(mode){
      case 'matrix':
        body.classList.add('bg-matrix');
        MatrixRain.start();
        break;
      case 'gradient':
        body.classList.add('bg-gradient');
        break;
      case 'hex':
        body.classList.add('bg-hex');
        break;
      case 'none':
      default:
        // fond de base
        break;
    }
    localStorage.setItem(STORAGE_KEY, mode);
    setAriaChecked(mode);
  }

  function current(){
    return localStorage.getItem(STORAGE_KEY) || 'matrix';
  }

  function toggleMenu(show){
    const willShow = show ?? menu.classList.contains('hidden');
    if (willShow){
      menu.classList.remove('hidden');
      btn.setAttribute('aria-expanded','true');
    } else {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded','false');
    }
  }

  function init(){
    // Applique la préférence mémorisée
    apply(current());

    btn?.addEventListener('click', (e)=>{
      e.stopPropagation();
      toggleMenu(true);
    });

    menu?.addEventListener('click', (e)=>{
      const item = e.target.closest('[data-bg]');
      if (!item) return;
      apply(item.dataset.bg);
      toggleMenu(false);
    });

    document.addEventListener('click', (e)=>{
      if (!menu.contains(e.target) && e.target !== btn){
        toggleMenu(false);
      }
    });

    document.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape') toggleMenu(false);
    });
  }

  return { init, apply, current };
})();
BgManager.init();

/* =========================
   INTRO (animation d’entrée)
========================= */
(function initIntro(){
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const intro = document.getElementById('intro');
  const skip  = document.querySelector('.btn-skip');
  if (!intro) return;

  if (sessionStorage.getItem('introDone') === '1' || prefersReduced){
    intro.remove();
    return;
  }

  let closed = false;
  function closeIntro(){
    if (closed) return;
    closed = true;
    intro.classList.add('hide');
    sessionStorage.setItem('introDone', '1');
    setTimeout(()=> intro.remove(), 380);
  }

  const auto = setTimeout(closeIntro, 2600);

  skip?.addEventListener('click', ()=>{
    clearTimeout(auto);
    closeIntro();
  });

  window.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape'){
      clearTimeout(auto);
      closeIntro();
    }
  });
})();

/* =========================
   AU CHARGEMENT
========================= */
document.addEventListener("DOMContentLoaded", ()=>{
  const current = document.querySelector(".section.active")?.id || "home";
  goTo(current);
});

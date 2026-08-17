import './styles.css';

const assetPath = (filename) => `${import.meta.env.BASE_URL}assets/${filename}`;
const TOTAL_FRAMES = 81;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;
const EXPORT_FPS = 24;
const CAMERA_ZOOM = 1.28;
const PAGE_LEFT = 0.105;
const PAGE_TOP = 42;
// The motion treatment is built from directional echoes. Keep Gaussian blur
// nearly off so the cards streak along the scroll axis instead of turning
// into a soft, uniformly blurred plate.
const MOTION_BLUR_STRENGTH = 0.45;
const MOTION_TRAIL_DISTANCE = 320;
const OPENING_PEOPLE_STORAGE_KEY = 'starmeter-opening-people-v2';
const LEGACY_HERO_STORAGE_KEY = 'starmeter-opening-actor-v1';
const GUIDE_SESSION_KEY = 'starmeter-dave-guide-seen-v1';
const DEFAULT_OPENING_PEOPLE = Object.freeze([
  Object.freeze({ rank: 1420, name: 'Andy Samberg', role: 'Actor · Producer · Writer', photo: assetPath('andy-samberg-card.jpg'), tag: 'START HERE', tone: 'gold', depth: 0 }),
  Object.freeze({ rank: 1610, name: 'Matt Damon', role: 'Actor · Producer', photo: assetPath('matt-damon.jpg'), tag: 'NEARBY STAR', tone: 'blue', depth: 1 }),
  Object.freeze({ rank: 1730, name: '"Weird" Al Yankovic', role: 'Actor · Musician · Writer', photo: assetPath('weird-al-yankovic.jpg'), tag: 'NEARBY STAR', tone: 'pink', depth: 2 }),
]);
// Keep the final target pair centered in the clipped browser viewport. This
// is intentionally a little tighter than the scroll's general page framing
// so the landing reads as a deliberate lock-on instead of stopping low.
// Leave enough headroom for the first target portrait while keeping the
// second target fully inside the clipped end frame.
const LANDING_VIEWPORT_FRACTION = 0.445;
const people = [
  ...DEFAULT_OPENING_PEOPLE.map((person) => ({ ...person })),
  { rank: 12840, name: 'Maya Fenn', role: 'Actor · Costume Designer', tag: 'WHOOSH', tone: 'green', depth: 3 },
  { rank: 24100, name: 'Jules Moreno', role: 'Writer · Additional Crew', tag: 'WHOOSH', tone: 'purple', depth: 4 },
  { rank: 48800, name: 'Talia Finch', role: 'Producer · Actor', tag: 'WHOOSH', tone: 'orange', depth: 5 },
  { rank: 82000, name: 'Drew Ko', role: 'Editor · Writer', tag: 'WHOOSH', tone: 'teal', depth: 6 },
  { rank: 120000, name: 'Sammy Vale', role: 'Actor · Director', tag: 'WHOOSH', tone: 'blue', depth: 7 },
  { rank: 156000, name: 'Riley West', role: 'Composer · Actor', tag: 'WHOOSH', tone: 'pink', depth: 8 },
  { rank: 243000, name: 'David James Ward', role: 'Writer · Producer · Editor', tag: 'TARGET', tone: 'target', depth: 9, photo: assetPath('david-james-ward.jpg') },
  { rank: 654000, name: 'Brock LaBorde', role: 'Writer · Additional Crew · Producer', tag: 'TARGET', tone: 'target', depth: 10, photo: assetPath('brock-laborde.jpg') },
];

const crowdNames = ['Nico Vale', 'Bex Wilder', 'Ari North', 'Jojo Glass', 'Kit Mercer', 'Luca Bloom', 'Tess Orbit', 'Cory Voss', 'Mina Park', 'Rae Wilder'];
const portraitPath = (index) => assetPath(`crowd-portraits/crowd-${String((index * 7) % 24 + 1).padStart(2, '0')}.jpg`);
const crowd = Array.from({ length: 360 }, (_, index) => ({
  rank: 4200 + index * 8617,
  name: `${crowdNames[index % crowdNames.length]} ${String(index + 1).padStart(2, '0')}`,
  role: ['Actor', 'Writer', 'Producer', 'Additional Crew'][index % 4],
  tag: 'CROWD',
  tone: ['blue', 'pink', 'green', 'purple', 'orange', 'teal'][index % 6],
  depth: index + 3,
  crowd: true,
  photo: portraitPath(index),
}));

people.forEach((person, index) => {
  if (!person.photo) person.photo = portraitPath(index + 4);
});

function normalizeOpeningPerson(value, fallback) {
  if (!value || typeof value !== 'object') return { ...fallback };
  return {
    ...fallback,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : fallback.name,
    role: typeof value.role === 'string' && value.role.trim() ? value.role.trim() : fallback.role,
    rank: Number.isFinite(Number(value.rank)) ? Math.max(1, Math.round(Number(value.rank))) : fallback.rank,
    photo: typeof value.photo === 'string' && value.photo ? value.photo : fallback.photo,
  };
}

function loadSavedOpeningPeople() {
  try {
    const saved = JSON.parse(localStorage.getItem(OPENING_PEOPLE_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length >= DEFAULT_OPENING_PEOPLE.length) {
      return DEFAULT_OPENING_PEOPLE.map((fallback, index) => normalizeOpeningPerson(saved[index], fallback));
    }
    const legacyHero = JSON.parse(localStorage.getItem(LEGACY_HERO_STORAGE_KEY));
    return DEFAULT_OPENING_PEOPLE.map((fallback, index) => normalizeOpeningPerson(index === 0 ? legacyHero : null, fallback));
  } catch {
    return DEFAULT_OPENING_PEOPLE.map((person) => ({ ...person }));
  }
}

const state = {
  frame: 0,
  settleFrame: 66,
  populationCount: 144,
  openingPeople: loadSavedOpeningPeople(),
  editingOpeningIndex: 0,
  motionBlur: true,
  playing: false,
  raf: null,
  lastTime: 0,
  lastRenderFrame: 0,
};

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="guide-backdrop" id="daveGuide" hidden>
    <section class="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guideTitle" aria-describedby="guideIntro">
      <div class="guide-kicker"><span>SHOT / 07</span><span>2-minute setup</span></div>
      <h1 id="guideTitle">Dave, here’s your STARmeter shot.</h1>
      <p id="guideIntro">Everything you need is on this screen. Set the three opening people, audition the move, then export the finished take.</p>
      <ol class="guide-steps">
        <li><span>1</span><div><strong>Set the opening people</strong><p>Choose <em>Main actor</em>, <em>Person 2</em>, or <em>Person 3</em>, then change the name, credits, ranking, and portrait. The preview and export stay in sync.</p></div></li>
        <li><span>2</span><div><strong>Audition the scroll</strong><p>Press play or drag the timeline. Adjust the settle frame, crowd length, scroll feel, and motion blur on the right.</p></div></li>
        <li><span>3</span><div><strong>Export the take</strong><p>Click <em>Export shot</em> when it feels right. Your replacement portraits stay in this browser and are used only for the shot.</p></div></li>
      </ol>
      <div class="guide-actions">
        <button class="guide-primary" id="guideActorButton">Change opening people</button>
        <button class="guide-secondary" id="guideDismissButton">Open the editor</button>
      </div>
      <p class="guide-replay">You can reopen this guide anytime from <strong>How to use</strong>.</p>
    </section>
  </div>
  <main class="shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">✦</span><span>STAR<span>meter</span></span></div>
      <div class="project-name"><span class="eyebrow">SHOT / 07</span><strong>The Great Dive</strong></div>
      <div class="top-actions"><button class="ghost-button" id="guideButton">How to use</button><button class="ghost-button" id="soundButton">Sound: off</button><button class="export-button" id="exportButton">Export shot</button></div>
    </header>
    <section class="workspace">
      <div class="stage-column">
        <div class="stage-header"><div><span class="eyebrow">WEB PAGE SCROLL / 1920 × 1080</span><h1>Scroll through the STARmeter.</h1></div><div class="frame-readout"><span id="frameReadout">F 000</span><span class="divider">/</span><span>81 FRAMES</span></div></div>
        <div class="stage-wrap">
          <div class="stage" id="stage">
            <div class="stage-grid"></div>
            <div class="stage-vignette"></div>
            <div class="speed-lines" id="speedLines"></div>
            <div class="page-surface" id="pageSurface">
              <div class="site-nav"><div class="site-logo"><span class="site-logo-mark">✦</span>STAR<span>meter</span></div><span class="site-page-title">Most popular celebrities</span><span class="site-menu">•••</span></div>
              <div class="site-subnav"><span>As determined by IMDb users</span><span>100 People&nbsp;&nbsp; / &nbsp;&nbsp;Sorted by Popularity</span></div>
              <div class="rank-ghost" id="rankGhostA" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostB" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostC" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostD" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostE" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostF" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostG" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostH" aria-hidden="true"></div><div class="rank-lane" id="rankLane"></div>
            </div>
            <div class="stage-hud"><span class="hud-pill">● WEB PAGE / LIVE SCROLL</span><span class="hud-pill muted">24 FPS · 00:03:09</span></div>
          </div>
        </div>
        <div class="timeline-card">
          <div class="timeline-controls"><button class="play-button" id="playButton" aria-label="Play">▶</button><div class="transport"><button id="stepBack" aria-label="Previous frame">↼</button><button id="stepForward" aria-label="Next frame">⇁</button><button id="resetButton">Reset</button></div><div class="timeline-meta"><span id="timelineLabel">Frame 0 / 81</span><span id="timingLabel">settles on F66</span></div></div>
          <div class="timeline-strip" id="timelineStrip">
            <div class="timeline-ruler"><span>0f</span><span>20f</span><span>40f</span><span>60f</span><span>81f</span></div>
            <div class="timeline-fill" id="timelineFill"></div><div class="timeline-target" style="left:76.5%"></div><div class="timeline-target" style="left:81.5%"></div><div class="timeline-playhead" id="timelinePlayhead"><i></i></div>
            <input class="scrubber" id="scrubber" type="range" min="0" max="81" value="0" step="1" aria-label="Shot frame" />
          </div>
        </div>
      </div>
      <aside class="inspector">
        <div class="inspector-head"><div><span class="eyebrow">PAGE SCROLL CONTROLS</span><h2>Scroll take</h2></div><span class="status-dot">● READY</span></div>
        <div class="control-block"><div class="control-label"><span>SETTLE FRAME</span><strong id="settleValue">66</strong></div><input id="settleSlider" type="range" min="45" max="76" value="66" aria-label="Settle frame" /><div class="helper"><span>fast</span><span>15 frames of breathing room</span><span>late</span></div></div>
        <div class="control-block"><div class="control-label"><span>SCROLL CHARACTER</span><strong>EASE-IN + BOUNCE</strong></div><div class="segmented"><button class="active" data-ease="exaggerated">Ease + bounce</button><button data-ease="smooth">Smooth</button><button data-ease="linear">Linear</button></div></div>
        <div class="control-block"><div class="control-label"><span>IN-BETWEEN PEOPLE</span><strong id="populationValue">144</strong></div><input id="populationSlider" type="range" min="24" max="360" value="144" step="1" aria-label="Number of in-between people" /><div class="helper"><span>short</span><span>generated crowd</span><span>long</span></div></div>
        <div class="control-block"><div class="toggle-row"><div><span class="control-label">MOTION BLUR</span><p>Stretch the crowd into a comic-book smear.</p></div><button class="toggle on" id="blurToggle" aria-label="Motion blur" aria-pressed="true"><span></span></button></div></div>
        <div class="cue-card" id="openingControls"><span class="eyebrow">OPENING PEOPLE</span><p>Choose one of the first three cards, then change its details and portrait.</p><div class="opening-tabs" role="tablist" aria-label="Opening people"><button class="opening-tab active" type="button" role="tab" aria-selected="true" data-opening-index="0"><span>Main actor</span><strong id="openingTabName0">Andy</strong></button><button class="opening-tab" type="button" role="tab" aria-selected="false" data-opening-index="1"><span>Person 2</span><strong id="openingTabName1">Matt</strong></button><button class="opening-tab" type="button" role="tab" aria-selected="false" data-opening-index="2"><span>Person 3</span><strong id="openingTabName2">Weird Al</strong></button></div><div class="actor-fields"><label><span>Name</span><input id="openingName" type="text" maxlength="80" autocomplete="off" /></label><label><span>Credits</span><input id="openingRole" type="text" maxlength="100" autocomplete="off" /></label><label><span>STARmeter rank</span><input id="openingRank" type="number" min="1" max="9999999" inputmode="numeric" /></label></div><div class="actor-actions"><label class="upload-button" tabindex="0" role="button"><span>Replace portrait</span><input id="openingUpload" type="file" accept="image/*" tabindex="-1" /></label><button class="restore-button" id="restoreOpeningPerson" type="button">Restore this card</button></div><p class="actor-status" id="openingStatus" aria-live="polite">Changes are saved in this browser.</p><div class="cue-footer"><span>3 OPENING CARDS</span><span id="starCount">83 STARS</span></div></div>
        <div class="target-list"><div class="eyebrow">ENDING CARDS</div><div class="target-row"><span class="marker-ring"></span><div><strong>David James Ward</strong><small>writer · rank 243K</small></div><span class="target-frame">F 62</span></div><div class="target-row"><span class="marker-ring"></span><div><strong>Brock LaBorde</strong><small>writer · rank 654K</small></div><span class="target-frame">F 66</span></div></div>
      </aside>
    </section>
    <footer class="footer-note"><span>STARmeter / editorial motion study</span><span>drag the playhead · press space to play</span></footer>
  </main>
`;

const lane = document.querySelector('#rankLane');
const ghostA = document.querySelector('#rankGhostA');
const ghostB = document.querySelector('#rankGhostB');
const ghostC = document.querySelector('#rankGhostC');
const ghostD = document.querySelector('#rankGhostD');
const ghostE = document.querySelector('#rankGhostE');
const ghostF = document.querySelector('#rankGhostF');
const ghostG = document.querySelector('#rankGhostG');
const ghostH = document.querySelector('#rankGhostH');
const frameReadout = document.querySelector('#frameReadout');
const timelineLabel = document.querySelector('#timelineLabel');
const timingLabel = document.querySelector('#timingLabel');
const scrubber = document.querySelector('#scrubber');
const stage = document.querySelector('#stage');
const pageSurface = document.querySelector('#pageSurface');
pageSurface.style.setProperty('--camera-zoom', String(CAMERA_ZOOM));
const playButton = document.querySelector('#playButton');
const timelinePlayhead = document.querySelector('#timelinePlayhead');
const timelineFill = document.querySelector('#timelineFill');
const daveGuide = document.querySelector('#daveGuide');
const openingControls = document.querySelector('#openingControls');
const openingNameInput = document.querySelector('#openingName');
const openingRoleInput = document.querySelector('#openingRole');
const openingRankInput = document.querySelector('#openingRank');
const openingStatus = document.querySelector('#openingStatus');
const exportButton = document.querySelector('#exportButton');
let guideReturnFocus = null;

function persistOpeningPeople() {
  try {
    localStorage.setItem(OPENING_PEOPLE_STORAGE_KEY, JSON.stringify(state.openingPeople));
    return true;
  } catch {
    return false;
  }
}

function setOpeningStatus(message) {
  openingStatus.textContent = message;
}

function openingTabName(person) {
  const words = person.name.trim().replace(/"/g, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(' ') || 'Person';
}

function syncOpeningCopy() {
  state.openingPeople.forEach((person, index) => {
    Object.assign(people[index], person);
    document.querySelector(`#openingTabName${index}`).textContent = openingTabName(person);
  });
}

function syncOpeningInputs() {
  const person = state.openingPeople[state.editingOpeningIndex];
  openingNameInput.value = person.name;
  openingRoleInput.value = person.role;
  openingRankInput.value = person.rank;
  document.querySelector('#restoreOpeningPerson').textContent = `Restore ${openingTabName(DEFAULT_OPENING_PEOPLE[state.editingOpeningIndex])}`;
  document.querySelectorAll('[data-opening-index]').forEach((button, index) => {
    const selected = index === state.editingOpeningIndex;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}

function guideHasBeenSeen() {
  try {
    return sessionStorage.getItem(GUIDE_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function markGuideSeen() {
  try {
    sessionStorage.setItem(GUIDE_SESSION_KEY, 'true');
  } catch {
    // The permanent How to use button remains available when storage is blocked.
  }
}

function openGuide() {
  guideReturnFocus = document.activeElement;
  daveGuide.hidden = false;
  document.body.classList.add('guide-open');
  document.querySelector('.shell').inert = true;
  document.querySelector('.shell').setAttribute('aria-hidden', 'true');
  requestAnimationFrame(() => document.querySelector('#guideActorButton').focus());
}

function closeGuide({ focusActor = false } = {}) {
  markGuideSeen();
  daveGuide.hidden = true;
  document.body.classList.remove('guide-open');
  document.querySelector('.shell').inert = false;
  document.querySelector('.shell').removeAttribute('aria-hidden');
  if (focusActor) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    openingControls.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    openingControls.classList.add('is-guided');
    openingNameInput.focus({ preventScroll: true });
    openingNameInput.select();
    setTimeout(() => openingControls.classList.remove('is-guided'), 1600);
    return;
  }
  if (guideReturnFocus instanceof HTMLElement) guideReturnFocus.focus();
}

daveGuide.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeGuide();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...daveGuide.querySelectorAll('button:not([disabled])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

document.querySelector('#guideButton').addEventListener('click', openGuide);
document.querySelector('#guideActorButton').addEventListener('click', () => closeGuide({ focusActor: true }));
document.querySelector('#guideDismissButton').addEventListener('click', () => closeGuide());

function ease(t, mode) {
  if (mode === 'linear') return t;
  if (mode === 'smooth') return t * t * (3 - 2 * t);
  // Restrained start, rapid page travel, then a small damped landing bounce.
  if (t < 0.84) return 0.88 * Math.pow(t / 0.84, 2.35);
  const u = (t - 0.84) / 0.16;
  // Keep the full arrival distance, then layer a small damped oscillation on
  // top. This prevents the last pre-settle frame from stopping short.
  const arrival = 1 - Math.pow(1 - u, 3);
  const bounce = 0.22 * Math.sin(2.8 * Math.PI * u) * Math.exp(-5 * u) * (1 - u);
  return Math.max(0, Math.min(1.01, 0.88 + 0.12 * (arrival + bounce)));
}

let easeMode = 'exaggerated';
function diveProgress(frame) {
  const launch = 3;
  if (frame <= launch) return 0;
  if (frame >= state.settleFrame) return 1;
  return ease((frame - launch) / (state.settleFrame - launch), easeMode);
}

function renderLane() {
  const progress = diveProgress(state.frame);
  const previousProgress = diveProgress(Math.max(0, state.frame - 1));
  const frameDelta = Math.abs(state.frame - state.lastRenderFrame);
  const velocity = Math.min(1, Math.abs(progress - previousProgress) * 20 + frameDelta * 0.12);
  const laneTravel = Math.max(920, lane.scrollHeight - pageSurface.clientHeight * LANDING_VIEWPORT_FRACTION);
  const y = -(progress * laneTravel);
  lane.style.transform = `translate3d(0, ${y}px, 0)`;
  const blurActive = state.motionBlur && progress > 0.03 && progress < 0.92;
  const trailDistance = blurActive ? velocity * MOTION_TRAIL_DISTANCE : 0;
  const ghostBlur = blurActive ? Math.max(0.12, velocity * 0.45) : 0;
  const ghostOffsets = [0.14, 0.28, 0.42, 0.58, 0.74, 0.9, 1.06, 1.22];
  const ghostOpacities = [0.28, 0.23, 0.19, 0.15, 0.12, 0.09, 0.06, 0.04];
  [ghostA, ghostB, ghostC, ghostD, ghostE, ghostF, ghostG, ghostH].forEach((ghost, index) => {
    ghost.style.transform = `translate3d(0, ${y + trailDistance * ghostOffsets[index]}px, 0)`;
    ghost.style.opacity = blurActive ? String(velocity * ghostOpacities[index]) : '0';
    ghost.style.setProperty('--ghost-blur', `${ghostBlur.toFixed(2)}px`);
  });
  lane.classList.toggle('is-diving', progress > 0.04 && progress < 0.98);
  stage.classList.toggle('blur-on', state.motionBlur && progress > 0.03 && progress < 0.92);
  stage.style.setProperty('--speed', `${Math.min(1, progress * 1.4)}`);
  stage.style.setProperty('--blur', `${state.motionBlur ? (velocity * MOTION_BLUR_STRENGTH).toFixed(2) : 0}px`);
  stage.style.setProperty('--streak', `${state.motionBlur ? Math.min(1, velocity * 1.15) : 0}`);
  frameReadout.textContent = `F ${String(state.frame).padStart(3, '0')}`;
  timelineLabel.textContent = `Frame ${state.frame} / ${TOTAL_FRAMES}`;
  timingLabel.textContent = `settles on F${state.settleFrame}`;
  scrubber.value = state.frame;
  timelinePlayhead.style.left = `${(state.frame / TOTAL_FRAMES) * 100}%`;
  timelineFill.style.width = `${(state.frame / TOTAL_FRAMES) * 100}%`;
  document.querySelector('#settleValue').textContent = state.settleFrame;
  state.lastRenderFrame = state.frame;
}

function createCard(person, index) {
  const card = document.createElement('article');
  card.className = `person-card ${person.tone} ${person.tag === 'TARGET' ? 'target-card' : ''} ${person.crowd ? 'crowd-card' : ''}`;
  card.style.setProperty('--depth', person.depth);
  card.style.setProperty('--tilt', `${index % 2 ? 1.2 : -1.2}deg`);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
  const safeName = escapeHtml(person.name);
  const safeRole = escapeHtml(person.role);
  const safePhoto = escapeHtml(person.photo || '');
  const initials = escapeHtml(person.name.split(' ').map((x) => x[0]).slice(0, 2).join(''));
  card.innerHTML = `${person.photo ? `<img src="${safePhoto}" alt="${safeName}" />` : `<div class="avatar"><span>${initials}</span></div>`}<div class="card-copy"><div class="rank-line"><span>#${person.rank.toLocaleString()}</span><span class="trend">${person.tag === 'TARGET' ? '↓' : '↗'}</span></div><h3>${safeName}</h3><p>${safeRole}</p></div>`;
  return card;
}
function buildLane() {
  lane.replaceChildren();
  ghostA.replaceChildren();
  ghostB.replaceChildren();
  ghostC.replaceChildren();
  ghostD.replaceChildren();
  ghostE.replaceChildren();
  ghostF.replaceChildren();
  ghostG.replaceChildren();
  ghostH.replaceChildren();
  syncOpeningCopy();
  const addCard = (person, index) => {
    const card = createCard(person, index);
    lane.appendChild(card);
    [ghostA, ghostB, ghostC, ghostD, ghostE, ghostF, ghostG, ghostH].forEach((ghost) => ghost.appendChild(card.cloneNode(true)));
  };
  people.slice(0, 3).forEach(addCard);
  crowd.slice(0, state.populationCount).forEach(addCard);
  people.slice(3).forEach(addCard);
  document.querySelector('#populationValue').textContent = state.populationCount;
  document.querySelector('#starCount').textContent = `${state.populationCount + 11} STARS`;
  renderLane();
}

scrubber.addEventListener('input', (event) => { state.frame = Number(event.target.value); renderLane(); });
document.querySelector('#settleSlider').addEventListener('input', (event) => { state.settleFrame = Number(event.target.value); renderLane(); });
document.querySelector('#populationSlider').addEventListener('input', (event) => { state.populationCount = Number(event.target.value); buildLane(); });

let openingCommitTimer = null;
function commitOpeningTextUpdate() {
  clearTimeout(openingCommitTimer);
  openingCommitTimer = null;
  buildLane();
  setOpeningStatus(persistOpeningPeople() ? 'Opening people updated. Saved in this browser.' : 'Opening people updated for this tab. Browser storage is unavailable.');
}

function queueOpeningTextUpdate() {
  const parsedRank = Number(openingRankInput.value);
  const person = state.openingPeople[state.editingOpeningIndex];
  person.name = openingNameInput.value.trim() || ['Main actor', 'Person 2', 'Person 3'][state.editingOpeningIndex];
  person.role = openingRoleInput.value.trim() || 'Actor';
  if (Number.isFinite(parsedRank) && parsedRank >= 1) person.rank = Math.round(parsedRank);
  syncOpeningCopy();
  clearTimeout(openingCommitTimer);
  openingCommitTimer = setTimeout(commitOpeningTextUpdate, 160);
}

[openingNameInput, openingRoleInput, openingRankInput].forEach((input) => input.addEventListener('input', queueOpeningTextUpdate));
[openingNameInput, openingRoleInput, openingRankInput].forEach((input) => input.addEventListener('blur', () => {
  if (openingCommitTimer) commitOpeningTextUpdate();
  syncOpeningInputs();
}));

function selectOpeningPerson(index, { focusTab = false } = {}) {
  if (openingCommitTimer) commitOpeningTextUpdate();
  state.editingOpeningIndex = Math.max(0, Math.min(DEFAULT_OPENING_PEOPLE.length - 1, index));
  syncOpeningInputs();
  setOpeningStatus(`Editing ${state.openingPeople[state.editingOpeningIndex].name}.`);
  if (focusTab) document.querySelector(`[data-opening-index="${state.editingOpeningIndex}"]`).focus();
}

document.querySelectorAll('[data-opening-index]').forEach((button) => {
  button.addEventListener('click', () => selectOpeningPerson(Number(button.dataset.openingIndex)));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Number(button.dataset.openingIndex);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? DEFAULT_OPENING_PEOPLE.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + DEFAULT_OPENING_PEOPLE.length) % DEFAULT_OPENING_PEOPLE.length;
    selectOpeningPerson(next, { focusTab: true });
  });
});

window.addEventListener('pagehide', () => { if (openingCommitTimer) commitOpeningTextUpdate(); });

function encodePortrait(source, width, height) {
  if (!width || !height) throw new Error('The portrait has no readable dimensions.');
  if (width * height > 60_000_000) throw new Error('That portrait is over 60 megapixels. Choose a smaller image.');
  const scale = Math.min(1, 900 / width, 1200 / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not prepare the portrait.');
  ctx.fillStyle = '#292929';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

async function preparePortrait(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That portrait is over 25 MB. Choose a smaller JPG or PNG.');

  if ('createImageBitmap' in window) {
    let bitmap = null;
    try {
      // Modern browsers can bound the decoded bitmap itself, avoiding a full-size
      // phone-photo allocation before the canvas downscale.
      bitmap = await createImageBitmap(file, { resizeWidth: 900, resizeQuality: 'high', imageOrientation: 'from-image' });
    } catch {
      // Fall through for browsers that cannot decode this format as an ImageBitmap.
    }
    if (bitmap) {
      try {
        return encodePortrait(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The portrait could not be read. Try another image.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('The portrait could not be opened. Try a JPG or PNG.'));
      image.onload = () => {
        try {
          resolve(encodePortrait(image, image.naturalWidth, image.naturalHeight));
        } catch (error) {
          reject(error);
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

let portraitRequestId = 0;
let portraitUploadPending = false;
const openingUploadInput = document.querySelector('#openingUpload');
const portraitUploadControl = openingUploadInput.closest('.upload-button');
openingUploadInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const requestId = ++portraitRequestId;
  const personIndex = state.editingOpeningIndex;
  const personName = state.openingPeople[personIndex].name;
  portraitUploadPending = true;
  portraitUploadControl.setAttribute('aria-busy', 'true');
  exportButton.disabled = true;
  exportButton.textContent = 'Preparing portrait';
  setOpeningStatus(`Preparing ${personName}'s portrait…`);
  try {
    const photo = await preparePortrait(file);
    if (requestId !== portraitRequestId) return;
    state.openingPeople[personIndex].photo = photo;
    buildLane();
    setOpeningStatus(persistOpeningPeople() ? `${personName}'s portrait was replaced and saved in this browser.` : `${personName}'s portrait was replaced for this tab. Browser storage is unavailable.`);
  } catch (error) {
    if (requestId === portraitRequestId) setOpeningStatus(error.message);
  } finally {
    event.target.value = '';
    if (requestId === portraitRequestId) {
      portraitUploadPending = false;
      portraitUploadControl.removeAttribute('aria-busy');
      exportButton.disabled = false;
      exportButton.textContent = 'Export shot';
    }
  }
});

portraitUploadControl.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  openingUploadInput.click();
});

document.querySelector('#restoreOpeningPerson').addEventListener('click', () => {
  portraitRequestId += 1;
  portraitUploadPending = false;
  portraitUploadControl.removeAttribute('aria-busy');
  exportButton.disabled = false;
  exportButton.textContent = 'Export shot';
  clearTimeout(openingCommitTimer);
  openingCommitTimer = null;
  const personIndex = state.editingOpeningIndex;
  state.openingPeople[personIndex] = { ...DEFAULT_OPENING_PEOPLE[personIndex] };
  const saved = persistOpeningPeople();
  syncOpeningInputs();
  buildLane();
  setOpeningStatus(saved ? `${state.openingPeople[personIndex].name} restored and saved.` : `${state.openingPeople[personIndex].name} restored for this tab.`);
});
document.querySelectorAll('[data-ease]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-ease]').forEach((b) => b.classList.remove('active')); button.classList.add('active'); easeMode = button.dataset.ease; renderLane(); }));
document.querySelector('#blurToggle').addEventListener('click', (event) => { state.motionBlur = !state.motionBlur; event.currentTarget.classList.toggle('on', state.motionBlur); event.currentTarget.setAttribute('aria-pressed', String(state.motionBlur)); renderLane(); });
document.querySelector('#resetButton').addEventListener('click', () => { state.frame = 0; state.playing = false; cancelAnimationFrame(state.raf); playButton.textContent = '▶'; renderLane(); });
document.querySelector('#stepBack').addEventListener('click', () => { state.frame = Math.max(0, state.frame - 1); renderLane(); });
document.querySelector('#stepForward').addEventListener('click', () => { state.frame = Math.min(TOTAL_FRAMES, state.frame + 1); renderLane(); });
playButton.addEventListener('click', () => {
  if (!state.playing && state.frame >= TOTAL_FRAMES) {
    state.frame = 0;
    state.lastRenderFrame = 0;
    renderLane();
  }
  state.playing = !state.playing;
  playButton.textContent = state.playing ? '❚❚' : '▶';
  if (state.playing) { state.lastTime = performance.now(); state.raf = requestAnimationFrame(tick); }
});
document.addEventListener('keydown', (event) => { if (event.code === 'Space' && daveGuide.hidden && !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); playButton.click(); } });
document.querySelector('#soundButton').addEventListener('click', (event) => { event.currentTarget.textContent = event.currentTarget.textContent.includes('off') ? 'Sound: on' : 'Sound: off'; });
function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCover(ctx, image, x, y, width, height) {
  if (!image) return;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(image, x, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function exportCards() {
  return [...people.slice(0, 3), ...crowd.slice(0, state.populationCount), ...people.slice(3)].map((person) => ({ ...person }));
}

function exportColor(person) {
  return { gold: '#f5ce4f', blue: '#75b7ff', pink: '#e895c7', green: '#8fd67d', purple: '#b89af7', orange: '#f6a66e', teal: '#7dd6c8', target: '#c7ff48' }[person.tone] || '#b7b7b2';
}

function readCameraZoom() {
  const transform = getComputedStyle(pageSurface).transform;
  if (!transform || transform === 'none') return 1;
  const match = transform.match(/^matrix\(([^,]+)/);
  const zoom = match ? Number(match[1]) : 1;
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function fitCanvasText(ctx, value, maxWidth) {
  const text = String(value);
  if (ctx.measureText(text).width <= maxWidth) return text;
  const suffix = '…';
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, middle)}${suffix}`).width <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low).trimEnd()}${suffix}`;
}

function drawExportCard(ctx, person, image, x, y, blur, cardWidth) {
  const isTarget = person.tag === 'TARGET';
  const isCrowd = person.crowd;
  const cardHeight = 168;
  ctx.save();
  ctx.filter = blur > 0 && !isTarget ? `blur(${blur.toFixed(2)}px)` : 'none';
  roundedRect(ctx, x, y, cardWidth, cardHeight, 3);
  ctx.fillStyle = isTarget ? '#171817' : 'rgba(235,232,224,.96)';
  ctx.fill();
  ctx.strokeStyle = isTarget ? 'rgba(199,255,72,.6)' : 'rgba(255,255,255,.65)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = exportColor(person);
  ctx.fillRect(x, y, 5, cardHeight);
  const photoX = x + 14;
  const photoY = y + 11;
  if (image) drawCover(ctx, image, photoX, photoY, 104, 146);
  else {
    ctx.fillStyle = '#292929';
    ctx.fillRect(photoX, photoY, 104, 146);
    ctx.fillStyle = '#f7f4ef';
    ctx.font = '600 22px Space Grotesk, sans-serif';
    ctx.fillText(person.name.split(' ').map((part) => part[0]).slice(0, 2).join(''), photoX + 26, photoY + 78);
  }
  const copyX = x + 136;
  ctx.fillStyle = isTarget ? '#a4aaa0' : '#5c5d5e';
  ctx.font = `${isCrowd ? 10 : 12}px DM Mono, monospace`;
  ctx.fillText(`#${person.rank.toLocaleString()}   ${isTarget ? 'v' : '^'}`, copyX, y + 30);
  ctx.fillStyle = isTarget ? '#f4f3ef' : '#1a1b1a';
  ctx.font = `500 ${isCrowd ? 16 : 24}px Space Grotesk, sans-serif`;
  const copyWidth = Math.max(40, cardWidth - (copyX - x) - 18);
  ctx.fillText(fitCanvasText(ctx, person.name, copyWidth), copyX, y + 66);
  ctx.fillStyle = isTarget ? '#a4aaa0' : '#676967';
  ctx.font = `${isCrowd ? 12 : 14}px Space Grotesk, sans-serif`;
  ctx.fillText(fitCanvasText(ctx, person.role, copyWidth), copyX, y + 90);
  ctx.globalAlpha = isCrowd ? 0.82 : 1;
  ctx.restore();
}

function renderExportFrame(ctx, frame, cards, images) {
  const width = EXPORT_WIDTH;
  const height = EXPORT_HEIGHT;
  const progress = diveProgress(frame);
  const previousProgress = diveProgress(Math.max(0, frame - 1));
  const velocity = Math.min(1, Math.abs(progress - previousProgress) * 20 + (frame ? 0.12 : 0));
  // Draw in the same CSS-pixel coordinate system as the live 16:9 stage,
  // then scale to the 1920x1080 export. This keeps card height, lane travel,
  // and the camera crop identical between preview and render.
  const designWidth = Math.max(1, stage.clientWidth || 1340);
  const designHeight = designWidth * (9 / 16);
  const designScale = width / designWidth;
  const page = { x: designWidth * PAGE_LEFT, y: PAGE_TOP, width: designWidth * 0.76, height: designHeight + 170 };
  const cameraZoom = readCameraZoom();
  const laneX = page.x + page.width * 0.07;
  const cardWidth = page.width * 0.86;
  const cardHeight = 168;
  const cardGap = 18;
  const laneHeight = cards.length * cardHeight + Math.max(0, cards.length - 1) * cardGap;
  const laneTravel = Math.max(920, laneHeight - page.height * LANDING_VIEWPORT_FRACTION);
  const translateY = -(progress * laneTravel);
  const blur = state.motionBlur && progress > 0.03 && progress < 0.92 ? velocity * MOTION_BLUR_STRENGTH : 0;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#111210';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,.025)';
  ctx.lineWidth = 1;
  for (let grid = 0; grid < width; grid += 68) { ctx.beginPath(); ctx.moveTo(grid, 0); ctx.lineTo(grid, height); ctx.stroke(); }
  for (let grid = 0; grid < height; grid += 68) { ctx.beginPath(); ctx.moveTo(0, grid); ctx.lineTo(width, grid); ctx.stroke(); }

  // Match the live preview's camera-only reframing without changing card layout.
  ctx.save();
  ctx.translate(page.x, page.y);
  ctx.scale(designScale * cameraZoom, designScale * cameraZoom);
  ctx.translate(-page.x, -page.y);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.38)';
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 16;
  roundedRect(ctx, page.x, page.y, page.width, page.height, 5);
  ctx.fillStyle = '#171817';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundedRect(ctx, page.x, page.y, page.width, page.height, 5);
  ctx.clip();
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(page.x, page.y, page.width, 68);
  ctx.fillStyle = '#f2f0e9';
  ctx.font = '700 22px Space Grotesk, sans-serif';
  ctx.fillText('* STAR', page.x + 22, page.y + 41);
  ctx.fillStyle = '#b9b5ad';
  ctx.font = '400 22px Space Grotesk, sans-serif';
  ctx.fillText('meter', page.x + 113, page.y + 41);
  ctx.fillStyle = '#ebe8e0';
  ctx.font = '500 18px Space Grotesk, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Most popular celebrities', page.x + page.width / 2, page.y + 41);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a09d95';
  ctx.fillText('...', page.x + page.width - 22, page.y + 41);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1e201e';
  ctx.fillRect(page.x, page.y + 68, page.width, 48);
  ctx.fillStyle = '#99968e';
  ctx.font = '14px Space Grotesk, sans-serif';
  ctx.fillText('As determined by IMDb users', page.x + 22, page.y + 99);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#d8d4cb';
  ctx.font = '11px DM Mono, monospace';
  ctx.fillText('100 People   /   Sorted by Popularity', page.x + page.width - 22, page.y + 99);
  ctx.textAlign = 'left';
  ctx.save();
  ctx.beginPath();
  ctx.rect(page.x, page.y + 116, page.width, page.height - 116);
  ctx.clip();
  const viewportTop = page.y + 116;
  const viewportBottom = page.y + page.height;
  const trail = velocity * MOTION_TRAIL_DISTANCE;
  cards.forEach((person, index) => {
    const cardY = page.y + 110 + index * (cardHeight + cardGap) + translateY;
    if (cardY > viewportBottom + trail || cardY + cardHeight < viewportTop - blur) return;
    const image = images.get(person.photo);
    if (state.motionBlur && progress > 0.03 && progress < 0.92 && person.tag !== 'TARGET') {
      for (let sample = 16; sample >= 1; sample -= 1) {
        ctx.save();
        ctx.globalAlpha = 0.008 * sample;
        drawExportCard(ctx, person, image, laneX, cardY + trail * (sample / 16), 0.2, cardWidth);
        ctx.restore();
      }
    }
    drawExportCard(ctx, person, image, laneX, cardY, 0.2, cardWidth);
  });
  ctx.restore();
  if (state.motionBlur && progress > 0.03 && progress < 0.92) {
    ctx.globalAlpha = velocity * 0.16;
    ctx.strokeStyle = '#c7ff48';
    ctx.lineWidth = 2;
    const offset = (frame * 37) % 78;
    for (let line = -40 + offset; line < width + 40; line += 78) { ctx.beginPath(); ctx.moveTo(line, 0); ctx.lineTo(line, height); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255,255,255,${velocity * 0.05})`;
    for (let scan = 0; scan < height; scan += 28) ctx.fillRect(0, scan, width, 2);
  }
  ctx.restore();
  ctx.restore();
  const vignette = ctx.createLinearGradient(0, 0, width, 0);
  vignette.addColorStop(0, 'rgba(0,0,0,.44)');
  vignette.addColorStop(.16, 'rgba(0,0,0,0)');
  vignette.addColorStop(.84, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.44)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(11,11,11,.72)';
  roundedRect(ctx, 16, 16, 178, 28, 14); ctx.fill();
  roundedRect(ctx, width - 188, 16, 172, 28, 14); ctx.fill();
  ctx.fillStyle = '#c7ff48';
  ctx.font = '10px DM Mono, monospace';
  ctx.fillText('o  WEB PAGE / LIVE SCROLL', 27, 34);
  ctx.fillStyle = '#c4c0b8';
  ctx.fillText('24 FPS  -  00:03:09', width - 177, 34);
}

function loadExportImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportShot(button) {
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const ctx = canvas.getContext('2d');
  const cards = exportCards();
  const images = new Map();
  const sources = [...new Set(cards.map((person) => person.photo).filter(Boolean))];
  const loaded = await Promise.all(sources.map(async (src) => [src, await loadExportImage(src)]));
  loaded.forEach(([src, image]) => images.set(src, image));
  if (document.fonts?.ready) await document.fonts.ready;
  if (!canvas.captureStream || !window.MediaRecorder) {
    renderExportFrame(ctx, state.frame, cards, images);
    canvas.toBlob((blob) => blob && downloadBlob(blob, `starmeter-frame-${String(state.frame).padStart(3, '0')}-camera.png`), 'image/png');
    button.textContent = 'PNG ready · camera synced';
    return;
  }
  renderExportFrame(ctx, 0, cards, images);
  // Capture every canvas update automatically. Manual requestFrame() capture
  // is not supported consistently and can leave some browsers with a short clip.
  const stream = canvas.captureStream();
  const mimeCandidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.4D002A',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  let mimeType;
  let recorder;
  for (const candidate of mimeCandidates) {
    if (!MediaRecorder.isTypeSupported(candidate)) continue;
    try {
      recorder = new MediaRecorder(stream, { mimeType: candidate, videoBitsPerSecond: 12_000_000 });
      mimeType = candidate;
      break;
    } catch {
      // Try the next browser-supported container/codec combination.
    }
  }
  if (!recorder || !mimeType) throw new Error('No browser video encoder is available.');
  const isH264 = mimeType.startsWith('video/mp4');
  const codecLabel = isH264 ? 'H.264 MP4' : 'WebM fallback';
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve, reject) => {
    recorder.addEventListener('stop', resolve, { once: true });
    recorder.addEventListener('error', (event) => reject(event.error || new Error('The browser video encoder stopped unexpectedly.')), { once: true });
  });
  recorder.start(250);
  const frameBudget = 1000 / EXPORT_FPS;
  const shotDuration = (TOTAL_FRAMES / EXPORT_FPS) * 1000;
  const exportStart = performance.now();
  for (let frame = 0; frame < TOTAL_FRAMES; frame += 1) {
    const targetTime = exportStart + frame * frameBudget;
    const leadIn = targetTime - performance.now();
    if (leadIn > 0) await new Promise((resolve) => setTimeout(resolve, leadIn));
    renderExportFrame(ctx, frame, cards, images);
    button.textContent = `${codecLabel} ${String(frame + 1).padStart(2, '0')}/${TOTAL_FRAMES}`;
  }
  const holdTime = exportStart + shotDuration - performance.now();
  if (holdTime > 0) await new Promise((resolve) => setTimeout(resolve, holdTime));
  if (recorder.state === 'recording') recorder.requestData();
  await new Promise((resolve) => setTimeout(resolve, 80));
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  const extension = isH264 ? 'mp4' : 'webm';
  downloadBlob(new Blob(chunks, { type: mimeType }), `starmeter-shot-1920x1080-24fps-camera.${extension}`);
  button.textContent = `${codecLabel} ready · ${(TOTAL_FRAMES / EXPORT_FPS).toFixed(1)} sec`;
}

document.querySelector('#exportButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (button.disabled || portraitUploadPending) return;
  if (openingCommitTimer) commitOpeningTextUpdate();
  state.playing = false;
  cancelAnimationFrame(state.raf);
  playButton.textContent = '▶';
  const shell = document.querySelector('.shell');
  const editorControls = [...shell.querySelectorAll('button, input, select')];
  const disabledStates = editorControls.map((control) => control.disabled);
  editorControls.forEach((control) => { control.disabled = true; });
  shell.setAttribute('aria-busy', 'true');
  button.disabled = true;
  try {
    await exportShot(button);
  } catch (error) {
    console.error(error);
    button.textContent = 'Export failed';
  }
  editorControls.forEach((control, index) => { control.disabled = disabledStates[index]; });
  shell.removeAttribute('aria-busy');
  button.disabled = true;
  setTimeout(() => { button.disabled = false; button.textContent = 'Export shot'; }, 2200);
});

function tick(now) {
  if (!state.playing) return;
  if (now - state.lastTime > 1000 / 24) { state.frame += 1; state.lastTime = now; if (state.frame >= TOTAL_FRAMES) { state.frame = TOTAL_FRAMES; state.playing = false; playButton.textContent = '▶'; } renderLane(); }
  if (state.playing) state.raf = requestAnimationFrame(tick);
}

syncOpeningCopy();
syncOpeningInputs();
buildLane();
if (!guideHasBeenSeen()) requestAnimationFrame(openGuide);

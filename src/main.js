import './styles.css';
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  getFirstEncodableVideoCodec,
} from 'mediabunny';

const assetPath = (filename) => `${import.meta.env.BASE_URL}assets/${filename}`;
const DEFAULT_TOTAL_FRAMES = 81;
const MIN_TOTAL_FRAMES = 48;
const MAX_TOTAL_FRAMES = 240;
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
const SHOT_PEOPLE_STORAGE_KEY = 'starmeter-shot-people-v3';
const SHOT_SETTINGS_STORAGE_KEY = 'starmeter-shot-settings-v1';
const OPENING_PEOPLE_STORAGE_KEY = 'starmeter-opening-people-v2';
const LEGACY_HERO_STORAGE_KEY = 'starmeter-opening-actor-v1';
const EASE_MODES = Object.freeze(['exaggerated', 'smooth', 'linear']);
const MIN_POPULATION = 24;
const MAX_POPULATION = 360;
const DEFAULT_POPULATION = 144;
const DEFAULT_SETTLE_FRAME = 66;
const DEFAULT_EASE_MODE = 'exaggerated';
const GUIDE_SESSION_KEY = 'starmeter-dave-guide-seen-v1';
const DEFAULT_OPENING_PEOPLE = Object.freeze([
  Object.freeze({ rank: 1420, name: 'Andy Samberg', role: 'Actor Â· Producer Â· Writer', photo: assetPath('andy-samberg-card.jpg'), tag: 'START HERE', tone: 'gold', depth: 0 }),
  Object.freeze({ rank: 1610, name: 'Matt Damon', role: 'Actor Â· Producer', photo: assetPath('matt-damon.jpg'), tag: 'NEARBY STAR', tone: 'blue', depth: 1 }),
  Object.freeze({ rank: 1730, name: '"Weird" Al Yankovic', role: 'Actor Â· Musician Â· Writer', photo: assetPath('weird-al-yankovic.jpg'), tag: 'NEARBY STAR', tone: 'pink', depth: 2 }),
]);
const DEFAULT_ENDING_PEOPLE = Object.freeze([
  Object.freeze({ rank: 243000, name: 'David James Ward', role: 'Writer Â· Producer Â· Editor', tag: 'TARGET', tone: 'target', depth: 9, photo: assetPath('david-james-ward.jpg') }),
  Object.freeze({ rank: 654000, name: 'Brock LaBorde', role: 'Writer Â· Additional Crew Â· Producer', tag: 'TARGET', tone: 'target', depth: 10, photo: assetPath('brock-laborde.jpg') }),
]);
const DEFAULT_SHOT_PEOPLE = Object.freeze([...DEFAULT_OPENING_PEOPLE, ...DEFAULT_ENDING_PEOPLE]);
const SHOT_PEOPLE_LANE_INDEXES = Object.freeze([0, 1, 2, 9, 10]);
const SHOT_PEOPLE_FALLBACK_NAMES = Object.freeze(['Main actor', 'Person 2', 'Person 3', 'Ending person 1', 'Ending person 2']);
// Keep the final target pair centered in the clipped browser viewport. This
// is intentionally a little tighter than the scroll's general page framing
// so the landing reads as a deliberate lock-on instead of stopping low.
// Leave enough headroom for the first target portrait while keeping the
// second target fully inside the clipped end frame.
const LANDING_VIEWPORT_FRACTION = 0.445;
const people = [
  ...DEFAULT_OPENING_PEOPLE.map((person) => ({ ...person })),
  { rank: 12840, name: 'Maya Fenn', role: 'Actor Â· Costume Designer', tag: 'WHOOSH', tone: 'green', depth: 3 },
  { rank: 24100, name: 'Jules Moreno', role: 'Writer Â· Additional Crew', tag: 'WHOOSH', tone: 'purple', depth: 4 },
  { rank: 48800, name: 'Talia Finch', role: 'Producer Â· Actor', tag: 'WHOOSH', tone: 'orange', depth: 5 },
  { rank: 82000, name: 'Drew Ko', role: 'Editor Â· Writer', tag: 'WHOOSH', tone: 'teal', depth: 6 },
  { rank: 120000, name: 'Sammy Vale', role: 'Actor Â· Director', tag: 'WHOOSH', tone: 'blue', depth: 7 },
  { rank: 156000, name: 'Riley West', role: 'Composer Â· Actor', tag: 'WHOOSH', tone: 'pink', depth: 8 },
  ...DEFAULT_ENDING_PEOPLE.map((person) => ({ ...person })),
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

function normalizeShotPerson(value, fallback) {
  if (!value || typeof value !== 'object') return { ...fallback };
  return {
    ...fallback,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : fallback.name,
    role: typeof value.role === 'string' && value.role.trim() ? value.role.trim() : fallback.role,
    rank: Number.isFinite(Number(value.rank)) ? Math.max(1, Math.round(Number(value.rank))) : fallback.rank,
    photo: typeof value.photo === 'string' && value.photo ? value.photo : fallback.photo,
  };
}

function loadSavedShotPeople() {
  try {
    const savedShotPeople = JSON.parse(localStorage.getItem(SHOT_PEOPLE_STORAGE_KEY));
    if (Array.isArray(savedShotPeople) && savedShotPeople.length >= DEFAULT_SHOT_PEOPLE.length) {
      return DEFAULT_SHOT_PEOPLE.map((fallback, index) => normalizeShotPerson(savedShotPeople[index], fallback));
    }
    const saved = JSON.parse(localStorage.getItem(OPENING_PEOPLE_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length >= DEFAULT_OPENING_PEOPLE.length) {
      return DEFAULT_SHOT_PEOPLE.map((fallback, index) => normalizeShotPerson(index < DEFAULT_OPENING_PEOPLE.length ? saved[index] : null, fallback));
    }
    const legacyHero = JSON.parse(localStorage.getItem(LEGACY_HERO_STORAGE_KEY));
    return DEFAULT_SHOT_PEOPLE.map((fallback, index) => normalizeShotPerson(index === 0 ? legacyHero : null, fallback));
  } catch {
    return DEFAULT_SHOT_PEOPLE.map((person) => ({ ...person }));
  }
}

function settleFrameBoundsFor(totalFrames) {
  const min = Math.max(12, Math.round(totalFrames * 0.55));
  return { min, max: Math.max(min, totalFrames - 5) };
}

function clampInt(value, min, max, fallback) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, next));
}

function loadSavedShotSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SHOT_SETTINGS_STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return null;
    const totalFrames = clampInt(saved.totalFrames, MIN_TOTAL_FRAMES, MAX_TOTAL_FRAMES, DEFAULT_TOTAL_FRAMES);
    const bounds = settleFrameBoundsFor(totalFrames);
    const defaultSettle = Math.max(bounds.min, Math.min(bounds.max, DEFAULT_SETTLE_FRAME));
    return {
      totalFrames,
      settleFrame: clampInt(saved.settleFrame, bounds.min, bounds.max, defaultSettle),
      populationCount: clampInt(saved.populationCount, MIN_POPULATION, MAX_POPULATION, DEFAULT_POPULATION),
      motionBlur: typeof saved.motionBlur === 'boolean' ? saved.motionBlur : true,
      easeMode: EASE_MODES.includes(saved.easeMode) ? saved.easeMode : DEFAULT_EASE_MODE,
    };
  } catch {
    return null;
  }
}

const savedShotSettings = loadSavedShotSettings();
const state = {
  frame: 0,
  totalFrames: savedShotSettings?.totalFrames ?? DEFAULT_TOTAL_FRAMES,
  settleFrame: savedShotSettings?.settleFrame ?? DEFAULT_SETTLE_FRAME,
  populationCount: savedShotSettings?.populationCount ?? DEFAULT_POPULATION,
  shotPeople: loadSavedShotPeople(),
  editingPersonIndex: 0,
  motionBlur: savedShotSettings?.motionBlur ?? true,
  playing: false,
  raf: null,
  lastTime: 0,
  lastRenderFrame: 0,
};

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="guide-backdrop" id="daveGuide" hidden>
    <section class="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guideTitle" aria-describedby="guideIntro">
      <div class="guide-kicker"><span>SHOT / 07 Â· V3</span><span id="guideDurationSummary">81 frames / 3.375 sec</span></div>
      <h1 id="guideTitle">Dave, hereâ€™s your STARmeter shot.</h1>
      <p id="guideIntro">Everything you need is on this screen. Set any of the five named people, audition the move, then export the finished take.</p>
      <ol class="guide-steps">
        <li><span>1</span><div><strong>Set the named people</strong><p>Choose any opening or ending card, then change its name, credits, ranking, and portraitâ€”including your own headshot. The preview and export stay in sync.</p></div></li>
        <li><span>2</span><div><strong>Audition the scroll</strong><p>Press play or drag the timeline. Set the shot duration in frames, then adjust the settle frame, crowd length, scroll feel, and motion blur.</p></div></li>
        <li><span>3</span><div><strong>Export the full take</strong><p>Click <em id="guideExportLabel">Export 3.4 sec MP4</em>. Every downloaded frame receives an exact 24 fps timestamp. Replacement portraits stay in this browser.</p></div></li>
      </ol>
      <div class="guide-actions">
        <button class="guide-primary" id="guideActorButton">Change shot people</button>
        <button class="guide-secondary" id="guideDismissButton">Open the editor</button>
      </div>
      <p class="guide-replay">You can reopen this guide anytime from <strong>How to use</strong>.</p>
    </section>
  </div>
  <main class="shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">âœ¦</span><span>STAR<span>meter</span></span></div>
      <div class="project-name"><span class="eyebrow">SHOT / 07 Â· V3</span><strong>The Great Dive</strong></div>
      <div class="top-actions"><button class="ghost-button" id="guideButton">How to use</button><button class="ghost-button" id="soundButton">Sound: off</button><button class="export-button" id="exportButton">Export 3.4 sec MP4</button></div>
    </header>
    <section class="workspace">
      <div class="stage-column">
        <div class="stage-header"><div><span class="eyebrow">WEB PAGE SCROLL / 1920 Ã— 1080</span><h1>Scroll through the STARmeter.</h1></div><div class="frame-readout"><span id="frameReadout">F 000</span><span class="divider">/</span><span id="totalFramesReadout">81 FRAMES</span></div></div>
        <div class="stage-wrap">
          <div class="stage" id="stage">
            <div class="stage-grid"></div>
            <div class="stage-vignette"></div>
            <div class="speed-lines" id="speedLines"></div>
            <div class="page-surface" id="pageSurface">
              <div class="site-nav"><div class="site-logo"><span class="site-logo-mark">âœ¦</span>STAR<span>meter</span></div><span class="site-page-title">Most popular celebrities</span><span class="site-menu">â€¢â€¢â€¢</span></div>
              <div class="site-subnav"><span>As determined by IMDb users</span><span>100 People&nbsp;&nbsp; / &nbsp;&nbsp;Sorted by Popularity</span></div>
              <div class="rank-ghost" id="rankGhostA" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostB" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostC" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostD" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostE" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostF" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostG" aria-hidden="true"></div><div class="rank-ghost" id="rankGhostH" aria-hidden="true"></div><div class="rank-lane" id="rankLane"></div>
            </div>
            <div class="stage-hud"><span class="hud-pill">â— WEB PAGE / LIVE SCROLL</span><span class="hud-pill muted" id="hudDuration">24 FPS Â· 00:03:09</span></div>
          </div>
        </div>
        <div class="timeline-card">
          <div class="timeline-controls"><button class="play-button" id="playButton" aria-label="Play">â–¶</button><div class="transport"><button id="stepBack" aria-label="Previous frame">â†¼</button><button id="stepForward" aria-label="Next frame">â‡</button><button id="resetButton">Reset</button></div><div class="timeline-meta"><span id="timelineLabel">Frame 0 / 80</span><span id="timingLabel">settles on F66</span></div></div>
          <div class="timeline-strip" id="timelineStrip">
            <div class="timeline-ruler"><span>0f</span><span>25%</span><span>50%</span><span>75%</span><span id="timelineEndTick">80f</span></div>
            <div class="timeline-fill" id="timelineFill"></div><div class="timeline-target" id="timelineTargetA" style="left:76.5%"></div><div class="timeline-target" id="timelineTargetB" style="left:81.5%"></div><div class="timeline-playhead" id="timelinePlayhead"><i></i></div>
            <input class="scrubber" id="scrubber" type="range" min="0" max="80" value="0" step="1" aria-label="Shot frame" />
          </div>
        </div>
      </div>
      <aside class="inspector">
        <div class="inspector-head"><div><span class="eyebrow">PAGE SCROLL CONTROLS</span><h2>Scroll take</h2></div><span class="status-dot">â— READY</span></div>
        <div class="control-block duration-control"><div class="control-label"><span>SHOT DURATION</span><strong id="durationSeconds">3.375 SEC</strong></div><label class="duration-input"><span>FRAMES</span><input id="durationFrames" type="number" min="48" max="240" value="81" step="1" inputmode="numeric" aria-label="Shot duration in frames" /><small>at 24 fps</small></label><div class="helper"><span>48f minimum</span><span>default 81f</span><span>240f maximum</span></div></div>
        <div class="control-block"><div class="control-label"><span>SETTLE FRAME</span><strong id="settleValue">66</strong></div><input id="settleSlider" type="range" min="45" max="76" value="66" aria-label="Settle frame" /><div class="helper"><span>fast</span><span id="breathingFrames">15 frames of breathing room</span><span>late</span></div></div>
        <div class="control-block"><div class="control-label"><span>SCROLL CHARACTER</span><strong>EASE-IN + BOUNCE</strong></div><div class="segmented"><button class="active" data-ease="exaggerated">Ease + bounce</button><button data-ease="smooth">Smooth</button><button data-ease="linear">Linear</button></div></div>
        <div class="control-block"><div class="control-label"><span>IN-BETWEEN PEOPLE</span><strong id="populationValue">144</strong></div><input id="populationSlider" type="range" min="24" max="360" value="144" step="1" aria-label="Number of in-between people" /><div class="helper"><span>short</span><span>generated crowd</span><span>long</span></div></div>
        <div class="control-block"><div class="toggle-row"><div><span class="control-label">MOTION BLUR</span><p>Stretch the crowd into a comic-book smear.</p></div><button class="toggle on" id="blurToggle" aria-label="Motion blur" aria-pressed="true"><span></span></button></div></div>
        <div class="cue-card" id="shotPeopleControls">
          <span class="eyebrow">SHOT PEOPLE</span><p>Choose any named card, then change its details and portrait.</p>
          <div class="people-tabs" role="tablist" aria-label="Named shot people">
            <button class="people-tab active" id="personTab0" type="button" role="tab" aria-selected="true" aria-controls="shotPersonPanel" data-person-index="0"><span>Main actor</span><strong id="personTabName0">Andy</strong></button>
            <button class="people-tab" id="personTab1" type="button" role="tab" aria-selected="false" aria-controls="shotPersonPanel" data-person-index="1"><span>Opening 2</span><strong id="personTabName1">Matt</strong></button>
            <button class="people-tab" id="personTab2" type="button" role="tab" aria-selected="false" aria-controls="shotPersonPanel" data-person-index="2"><span>Opening 3</span><strong id="personTabName2">Weird Al</strong></button>
            <button class="people-tab" id="personTab3" type="button" role="tab" aria-selected="false" aria-controls="shotPersonPanel" data-person-index="3"><span>Ending 1</span><strong id="personTabName3">David</strong></button>
            <button class="people-tab" id="personTab4" type="button" role="tab" aria-selected="false" aria-controls="shotPersonPanel" data-person-index="4"><span>Ending 2</span><strong id="personTabName4">Brock</strong></button>
          </div>
          <div class="shot-person-panel" id="shotPersonPanel" role="tabpanel" aria-labelledby="personTab0">
            <div class="actor-fields"><label><span>Name</span><input id="personName" type="text" maxlength="80" autocomplete="off" /></label><label><span>Credits</span><input id="personRole" type="text" maxlength="100" autocomplete="off" /></label><label><span>STARmeter rank</span><input id="personRank" type="number" min="1" max="9999999" inputmode="numeric" /></label></div>
            <div class="actor-actions"><label class="upload-button" tabindex="0" role="button"><span>Replace portrait</span><input id="personUpload" type="file" accept="image/*" tabindex="-1" /></label><button class="restore-button" id="restoreShotPerson" type="button">Restore this card</button></div>
            <p class="actor-status" id="personStatus" aria-live="polite">Changes are saved in this browser.</p>
          </div>
          <div class="cue-footer"><span>5 NAMED CARDS</span><span id="starCount">83 STARS</span></div>
        </div>
        <div class="export-spec"><span class="eyebrow">EXPORT GUARANTEE</span><strong id="exportDurationSpec">81 frames Â· 24 fps Â· 3.375 sec</strong><p>Every frame is timestamped before the H.264 MP4 is downloaded.</p><span id="exportStatus" aria-live="polite">Ready for a full-length export.</span></div>
      </aside>
    </section>
    <footer class="footer-note"><span>STARmeter / editorial motion study</span><span>drag the playhead Â· press space to play</span></footer>
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
const durationFramesInput = document.querySelector('#durationFrames');
const durationSeconds = document.querySelector('#durationSeconds');
const settleSlider = document.querySelector('#settleSlider');
const breathingFrames = document.querySelector('#breathingFrames');
const totalFramesReadout = document.querySelector('#totalFramesReadout');
const hudDuration = document.querySelector('#hudDuration');
const timelineEndTick = document.querySelector('#timelineEndTick');
const timelineTargetA = document.querySelector('#timelineTargetA');
const timelineTargetB = document.querySelector('#timelineTargetB');
const stage = document.querySelector('#stage');
const pageSurface = document.querySelector('#pageSurface');
pageSurface.style.setProperty('--camera-zoom', String(CAMERA_ZOOM));
const playButton = document.querySelector('#playButton');
const timelinePlayhead = document.querySelector('#timelinePlayhead');
const timelineFill = document.querySelector('#timelineFill');
const daveGuide = document.querySelector('#daveGuide');
const shotPeopleControls = document.querySelector('#shotPeopleControls');
const shotPersonPanel = document.querySelector('#shotPersonPanel');
const personNameInput = document.querySelector('#personName');
const personRoleInput = document.querySelector('#personRole');
const personRankInput = document.querySelector('#personRank');
const personStatus = document.querySelector('#personStatus');
const exportButton = document.querySelector('#exportButton');
const exportStatus = document.querySelector('#exportStatus');
const exportDurationSpec = document.querySelector('#exportDurationSpec');
const guideDurationSummary = document.querySelector('#guideDurationSummary');
const guideExportLabel = document.querySelector('#guideExportLabel');
let guideReturnFocus = null;

function durationInSeconds(frames = state.totalFrames) {
  return frames / EXPORT_FPS;
}

function lastFrameIndex(frames = state.totalFrames) {
  return Math.max(0, frames - 1);
}

function exportButtonLabel() {
  return `Export ${durationInSeconds().toFixed(1)} sec MP4`;
}

function setPlaybackButton() {
  playButton.textContent = state.playing ? 'âšâš' : 'â–¶';
  playButton.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
}

function durationTimecode(frames = state.totalFrames) {
  const wholeSeconds = Math.floor(frames / EXPORT_FPS);
  const remainingFrames = frames % EXPORT_FPS;
  return `00:${String(wholeSeconds).padStart(2, '0')}:${String(remainingFrames).padStart(2, '0')}`;
}

function settleFrameBounds(totalFrames = state.totalFrames) {
  return settleFrameBoundsFor(totalFrames);
}

function updateDurationUI({ announce = false } = {}) {
  const seconds = durationInSeconds();
  const preciseSeconds = seconds.toFixed(3);
  const { min, max } = settleFrameBounds();
  durationFramesInput.value = state.totalFrames;
  durationSeconds.textContent = `${preciseSeconds} SEC`;
  totalFramesReadout.textContent = `${state.totalFrames} FRAMES`;
  hudDuration.textContent = `${EXPORT_FPS} FPS Â· ${durationTimecode()}`;
  timelineEndTick.textContent = `${lastFrameIndex()}f`;
  scrubber.max = lastFrameIndex();
  settleSlider.min = min;
  settleSlider.max = max;
  settleSlider.value = state.settleFrame;
  exportDurationSpec.textContent = `${state.totalFrames} frames Â· ${EXPORT_FPS} fps Â· ${preciseSeconds} sec`;
  guideDurationSummary.textContent = `${state.totalFrames} frames / ${preciseSeconds} sec`;
  guideExportLabel.textContent = exportButtonLabel();
  if (!exportButton.disabled) exportButton.textContent = exportButtonLabel();
  if (announce) exportStatus.textContent = `Ready to export ${state.totalFrames} frames at ${EXPORT_FPS} fps Â· ${preciseSeconds} sec.`;
}

function setTotalFrames(value) {
  if (String(value).trim() === '') {
    updateDurationUI();
    return;
  }
  const nextTotal = Math.max(MIN_TOTAL_FRAMES, Math.min(MAX_TOTAL_FRAMES, Math.round(Number(value))));
  if (!Number.isFinite(nextTotal) || nextTotal === state.totalFrames) {
    updateDurationUI();
    return;
  }
  const previousTotal = state.totalFrames;
  const previousLastFrame = lastFrameIndex(previousTotal);
  const frameRatio = previousLastFrame ? state.frame / previousLastFrame : 0;
  const settleRatio = previousTotal ? state.settleFrame / previousTotal : 0.8;
  state.totalFrames = nextTotal;
  const { min, max } = settleFrameBounds(nextTotal);
  state.frame = Math.min(lastFrameIndex(nextTotal), Math.round(frameRatio * lastFrameIndex(nextTotal)));
  state.settleFrame = Math.max(min, Math.min(max, Math.round(settleRatio * nextTotal)));
  state.playing = false;
  cancelAnimationFrame(state.raf);
  state.lastRenderFrame = state.frame;
  setPlaybackButton();
  updateDurationUI({ announce: true });
  persistShotSettings();
  renderLane();
}

function persistShotSettings() {
  try {
    localStorage.setItem(SHOT_SETTINGS_STORAGE_KEY, JSON.stringify({
      totalFrames: state.totalFrames,
      settleFrame: state.settleFrame,
      populationCount: state.populationCount,
      motionBlur: state.motionBlur,
      easeMode,
    }));
    return true;
  } catch {
    return false;
  }
}

function syncSavedSettingsUI() {
  const populationSlider = document.querySelector('#populationSlider');
  if (populationSlider) populationSlider.value = state.populationCount;
  const blurToggle = document.querySelector('#blurToggle');
  if (blurToggle) {
    blurToggle.classList.toggle('on', state.motionBlur);
    blurToggle.setAttribute('aria-pressed', String(state.motionBlur));
  }
  document.querySelectorAll('[data-ease]').forEach((button) => {
    button.classList.toggle('active', button.dataset.ease === easeMode);
  });
}

function persistShotPeople() {
  try {
    localStorage.setItem(SHOT_PEOPLE_STORAGE_KEY, JSON.stringify(state.shotPeople));
    return true;
  } catch {
    return false;
  }
}

function setPersonStatus(message) {
  personStatus.textContent = message;
}

function personTabName(person) {
  const words = person.name.trim().replace(/"/g, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(' ') || 'Person';
}

function syncShotPeopleCopy() {
  state.shotPeople.forEach((person, index) => {
    Object.assign(people[SHOT_PEOPLE_LANE_INDEXES[index]], person);
    document.querySelector(`#personTabName${index}`).textContent = personTabName(person);
  });
}

function syncPersonInputs() {
  const person = state.shotPeople[state.editingPersonIndex];
  personNameInput.value = person.name;
  personRoleInput.value = person.role;
  personRankInput.value = person.rank;
  shotPersonPanel.setAttribute('aria-labelledby', `personTab${state.editingPersonIndex}`);
  document.querySelector('#restoreShotPerson').textContent = `Restore ${personTabName(DEFAULT_SHOT_PEOPLE[state.editingPersonIndex])}`;
  document.querySelectorAll('[data-person-index]').forEach((button, index) => {
    const selected = index === state.editingPersonIndex;
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
    shotPeopleControls.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    shotPeopleControls.classList.add('is-guided');
    personNameInput.focus({ preventScroll: true });
    personNameInput.select();
    setTimeout(() => shotPeopleControls.classList.remove('is-guided'), 1600);
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

let easeMode = savedShotSettings?.easeMode ?? DEFAULT_EASE_MODE;
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
  stage.style.setProperty('--streak', '0');
  frameReadout.textContent = `F ${String(state.frame).padStart(3, '0')}`;
  const timelineLastFrame = lastFrameIndex();
  timelineLabel.textContent = `Frame ${state.frame} / ${timelineLastFrame}`;
  timingLabel.textContent = `settles on F${state.settleFrame}`;
  breathingFrames.textContent = `${state.totalFrames - state.settleFrame} frames of breathing room`;
  scrubber.value = state.frame;
  timelinePlayhead.style.left = `${(state.frame / timelineLastFrame) * 100}%`;
  timelineFill.style.width = `${(state.frame / timelineLastFrame) * 100}%`;
  timelineTargetA.style.left = `${(Math.max(0, state.settleFrame - 4) / timelineLastFrame) * 100}%`;
  timelineTargetB.style.left = `${(state.settleFrame / timelineLastFrame) * 100}%`;
  document.querySelector('#settleValue').textContent = state.settleFrame;
  settleSlider.value = state.settleFrame;
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
  card.innerHTML = `${person.photo ? `<img src="${safePhoto}" alt="${safeName}" />` : `<div class="avatar"><span>${initials}</span></div>`}<div class="card-copy"><div class="rank-line"><span>#${person.rank.toLocaleString()}</span><span class="trend">${person.tag === 'TARGET' ? 'â†“' : 'â†—'}</span></div><h3>${safeName}</h3><p>${safeRole}</p></div>`;
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
  syncShotPeopleCopy();
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
durationFramesInput.addEventListener('input', (event) => {
  const value = Number(event.target.value);
  if (Number.isFinite(value) && value >= MIN_TOTAL_FRAMES && value <= MAX_TOTAL_FRAMES) setTotalFrames(value);
});
durationFramesInput.addEventListener('change', (event) => setTotalFrames(event.target.value));
durationFramesInput.addEventListener('blur', () => { durationFramesInput.value = state.totalFrames; });
settleSlider.addEventListener('input', (event) => { state.settleFrame = Number(event.target.value); persistShotSettings(); renderLane(); });
document.querySelector('#populationSlider').addEventListener('input', (event) => { state.populationCount = Number(event.target.value); persistShotSettings(); buildLane(); });

let personCommitTimer = null;
function commitPersonTextUpdate() {
  clearTimeout(personCommitTimer);
  personCommitTimer = null;
  buildLane();
  setPersonStatus(persistShotPeople() ? 'Shot people updated. Saved in this browser.' : 'Shot people updated for this tab. Browser storage is unavailable.');
}

function queuePersonTextUpdate() {
  const parsedRank = Number(personRankInput.value);
  const person = state.shotPeople[state.editingPersonIndex];
  person.name = personNameInput.value.trim() || SHOT_PEOPLE_FALLBACK_NAMES[state.editingPersonIndex];
  person.role = personRoleInput.value.trim() || 'Actor';
  if (Number.isFinite(parsedRank) && parsedRank >= 1) person.rank = Math.round(parsedRank);
  syncShotPeopleCopy();
  clearTimeout(personCommitTimer);
  personCommitTimer = setTimeout(commitPersonTextUpdate, 160);
}

[personNameInput, personRoleInput, personRankInput].forEach((input) => input.addEventListener('input', queuePersonTextUpdate));
[personNameInput, personRoleInput, personRankInput].forEach((input) => input.addEventListener('blur', () => {
  if (personCommitTimer) commitPersonTextUpdate();
  syncPersonInputs();
}));

function selectShotPerson(index, { focusTab = false } = {}) {
  if (personCommitTimer) commitPersonTextUpdate();
  state.editingPersonIndex = Math.max(0, Math.min(DEFAULT_SHOT_PEOPLE.length - 1, index));
  syncPersonInputs();
  setPersonStatus(`Editing ${state.shotPeople[state.editingPersonIndex].name}.`);
  if (focusTab) document.querySelector(`[data-person-index="${state.editingPersonIndex}"]`).focus();
}

document.querySelectorAll('[data-person-index]').forEach((button) => {
  button.addEventListener('click', () => selectShotPerson(Number(button.dataset.personIndex)));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Number(button.dataset.personIndex);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? DEFAULT_SHOT_PEOPLE.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + DEFAULT_SHOT_PEOPLE.length) % DEFAULT_SHOT_PEOPLE.length;
    selectShotPerson(next, { focusTab: true });
  });
});

window.addEventListener('pagehide', () => { if (personCommitTimer) commitPersonTextUpdate(); });

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

const portraitRequestIds = Array(DEFAULT_SHOT_PEOPLE.length).fill(0);
const pendingPortraitSlots = new Set();
const personUploadInput = document.querySelector('#personUpload');
const portraitUploadControl = personUploadInput.closest('.upload-button');

function updatePortraitPendingState() {
  const pending = pendingPortraitSlots.size > 0;
  portraitUploadControl.toggleAttribute('aria-busy', pending);
  exportButton.disabled = pending;
  exportButton.textContent = pending ? 'Preparing portrait' : exportButtonLabel();
}

personUploadInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const personIndex = state.editingPersonIndex;
  const requestId = ++portraitRequestIds[personIndex];
  const personName = state.shotPeople[personIndex].name;
  pendingPortraitSlots.add(personIndex);
  updatePortraitPendingState();
  setPersonStatus(`Preparing ${personName}'s portraitâ€¦`);
  try {
    const photo = await preparePortrait(file);
    if (requestId !== portraitRequestIds[personIndex]) return;
    state.shotPeople[personIndex].photo = photo;
    buildLane();
    setPersonStatus(persistShotPeople() ? `${personName}'s portrait was replaced and saved in this browser.` : `${personName}'s portrait was replaced for this tab. Browser storage is unavailable.`);
  } catch (error) {
    if (requestId === portraitRequestIds[personIndex]) setPersonStatus(error.message);
  } finally {
    event.target.value = '';
    if (requestId === portraitRequestIds[personIndex]) {
      pendingPortraitSlots.delete(personIndex);
      updatePortraitPendingState();
    }
  }
});

portraitUploadControl.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  personUploadInput.click();
});

document.querySelector('#restoreShotPerson').addEventListener('click', () => {
  const personIndex = state.editingPersonIndex;
  portraitRequestIds[personIndex] += 1;
  pendingPortraitSlots.delete(personIndex);
  updatePortraitPendingState();
  clearTimeout(personCommitTimer);
  personCommitTimer = null;
  state.shotPeople[personIndex] = { ...DEFAULT_SHOT_PEOPLE[personIndex] };
  const saved = persistShotPeople();
  syncPersonInputs();
  buildLane();
  setPersonStatus(saved ? `${state.shotPeople[personIndex].name} restored and saved.` : `${state.shotPeople[personIndex].name} restored for this tab.`);
});
document.querySelectorAll('[data-ease]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-ease]').forEach((b) => b.classList.remove('active')); button.classList.add('active'); easeMode = button.dataset.ease; persistShotSettings(); renderLane(); }));
document.querySelector('#blurToggle').addEventListener('click', (event) => { state.motionBlur = !state.motionBlur; event.currentTarget.classList.toggle('on', state.motionBlur); event.currentTarget.setAttribute('aria-pressed', String(state.motionBlur)); persistShotSettings(); renderLane(); });
document.querySelector('#resetButton').addEventListener('click', () => { state.frame = 0; state.playing = false; cancelAnimationFrame(state.raf); setPlaybackButton(); renderLane(); });
document.querySelector('#stepBack').addEventListener('click', () => { state.frame = Math.max(0, state.frame - 1); renderLane(); });
document.querySelector('#stepForward').addEventListener('click', () => { state.frame = Math.min(lastFrameIndex(), state.frame + 1); renderLane(); });
playButton.addEventListener('click', () => {
  if (!state.playing && state.frame >= lastFrameIndex()) {
    state.frame = 0;
    state.lastRenderFrame = 0;
    renderLane();
  }
  state.playing = !state.playing;
  setPlaybackButton();
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
  syncShotPeopleCopy();
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
  const suffix = 'â€¦';
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
  ctx.fillText(`${EXPORT_FPS} FPS  -  ${durationTimecode()}`, width - 177, 34);
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
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function exportShot(button) {
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create the export canvas.');
  const totalFrames = state.totalFrames;
  const shotSeconds = totalFrames / EXPORT_FPS;
  const cards = exportCards();
  const images = new Map();
  button.textContent = 'Loading portraits';
  exportStatus.textContent = 'Loading the portraits for this takeâ€¦';
  const sources = [...new Set(cards.map((person) => person.photo).filter(Boolean))];
  const loaded = await Promise.all(sources.map(async (src) => [src, await loadExportImage(src)]));
  loaded.forEach(([src, image]) => images.set(src, image));
  if (document.fonts?.ready) await document.fonts.ready;

  button.textContent = 'Checking H.264';
  exportStatus.textContent = 'Checking this browserâ€™s frame-addressed H.264 encoderâ€¦';
  const codec = await getFirstEncodableVideoCodec(['avc'], {
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    bitrate: 12_000_000,
  });
  if (!codec) throw new Error('H.264 export needs a current Chrome, Edge, or Safari browser. Open this page there and try again.');

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const videoSource = new CanvasSource(canvas, {
    codec,
    bitrate: 12_000_000,
    keyFrameInterval: 2,
    latencyMode: 'quality',
    hardwareAcceleration: 'no-preference',
  });
  output.addVideoTrack(videoSource, { frameRate: EXPORT_FPS });
  try {
    await output.start();
    exportStatus.textContent = `Encoding ${totalFrames} explicitly timed frames. Export speed will not change the shot length.`;
    for (let frame = 0; frame < totalFrames; frame += 1) {
      renderExportFrame(ctx, frame, cards, images);
      await videoSource.add(frame / EXPORT_FPS, 1 / EXPORT_FPS, { keyFrame: frame === 0 });
      button.textContent = `Encoding ${String(frame + 1).padStart(2, '0')}/${totalFrames}`;
    }
    button.textContent = 'Finalizing MP4';
    await output.finalize();
  } catch (error) {
    try { await output.cancel(); } catch { /* The encoder may already be closed. */ }
    throw error;
  }
  if (!target.buffer) throw new Error('The H.264 encoder finished without creating a file. Try the export again.');

  const durationLabel = shotSeconds.toFixed(3);
  const filename = `starmeter-shot-v3-${totalFrames}f-${durationLabel}s-1920x1080.mp4`;
  downloadBlob(new Blob([target.buffer], { type: 'video/mp4' }), filename);
  button.textContent = `MP4 ready Â· ${durationLabel} sec`;
  exportStatus.textContent = `Downloaded ${filename} Â· ${totalFrames} frames Â· ${EXPORT_FPS} fps Â· ${durationLabel} sec.`;
}

document.querySelector('#exportButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (button.disabled || pendingPortraitSlots.size > 0) return;
  if (personCommitTimer) commitPersonTextUpdate();
  state.playing = false;
  cancelAnimationFrame(state.raf);
  setPlaybackButton();
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
    exportStatus.textContent = error.message;
  }
  editorControls.forEach((control, index) => { control.disabled = disabledStates[index]; });
  shell.removeAttribute('aria-busy');
  button.disabled = true;
  setTimeout(() => { button.disabled = pendingPortraitSlots.size > 0; button.textContent = pendingPortraitSlots.size > 0 ? 'Preparing portrait' : exportButtonLabel(); }, 2200);
});

function tick(now) {
  if (!state.playing) return;
  const frameDuration = 1000 / EXPORT_FPS;
  const elapsed = now - state.lastTime;
  if (elapsed >= frameDuration) {
    const framesAdvanced = Math.floor(elapsed / frameDuration);
    state.lastTime += framesAdvanced * frameDuration;
    const remainingFrameDurations = state.totalFrames - state.frame;
    if (framesAdvanced >= remainingFrameDurations) {
      state.frame = lastFrameIndex();
      state.playing = false;
      setPlaybackButton();
    } else {
      state.frame += framesAdvanced;
    }
    renderLane();
  }
  if (state.playing) state.raf = requestAnimationFrame(tick);
}

updateDurationUI();
syncShotPeopleCopy();
syncPersonInputs();
syncSavedSettingsUI();
buildLane();
if (!guideHasBeenSeen()) requestAnimationFrame(openGuide);

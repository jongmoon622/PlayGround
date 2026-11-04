// ═══════════════════════════════════════════════════════════
// 프롬프트 마스터 — 게임 로직 (1/2): 공통 + 스토리 모드
// ═══════════════════════════════════════════════════════════

const SAVE_KEY = 'pm_save_v1';
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const ALL_LEVELS = CHAPTERS.flatMap(ch => ch.levels.map(l => ({ ...l, chapter: ch })));
const TOTAL_LEVELS = ALL_LEVELS.length;

const RANKS = [
  { xp: 0,    name: '프롬프트 입문자', emoji: '🌱' },
  { xp: 200,  name: '프롬프트 견습생', emoji: '🌿' },
  { xp: 450,  name: '프롬프트 실력자', emoji: '⚡' },
  { xp: 750,  name: '프롬프트 고수',   emoji: '🔥' },
  { xp: 1050, name: '프롬프트 장인',   emoji: '💎' },
  { xp: 1400, name: '프롬프트 마스터', emoji: '👑' },
];

const DEFAULT_SAVE = { stars: {}, coins: 0, xp: 0, quizBest: 0, clears: 0 };
function loadSave() {
  try { return { ...DEFAULT_SAVE, ...(JSON.parse(localStorage.getItem(SAVE_KEY)) || {}) }; }
  catch (e) { return { ...DEFAULT_SAVE }; }
}
function persistSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}
let save = loadSave();

function currentRank() {
  let r = RANKS[0];
  for (const rank of RANKS) if (save.xp >= rank.xp) r = rank;
  return r;
}
function nextRank() {
  for (const rank of RANKS) if (save.xp < rank.xp) return rank;
  return null;
}
function totalStars() {
  return Object.values(save.stars).reduce((a, b) => a + b, 0);
}
function clearedCount() {
  return Object.keys(save.stars).length;
}

// ── 토스트 ─────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── 화면 전환 ──────────────────────────────────────────
const SCREENS = ['title', 'map', 'level', 'quiz', 'collection', 'guide'];
function showScreen(name) {
  if (name !== 'quiz' && typeof quizTimer !== 'undefined' && quizTimer) {
    clearInterval(quizTimer);
    quizTimer = null;
    // 퀴즈 진행 중 이탈 시 초기 설정 화면으로 되돌리기
    $('#quiz-play') && $('#quiz-play').classList.add('hidden');
    $('#quiz-result') && $('#quiz-result').classList.add('hidden');
    $('#quiz-setup') && $('#quiz-setup').classList.remove('hidden');
  }
  SCREENS.forEach(s => $('#screen-' + s).classList.toggle('active', s === name));
  $('#hud').classList.toggle('hidden', name === 'title');
  window.scrollTo(0, 0);
}

function updateHUD() {
  const rank = currentRank();
  const next = nextRank();
  $('#hud-rank-emoji').textContent = rank.emoji;
  $('#hud-rank-name').textContent = rank.name;
  $('#hud-coins').textContent = save.coins;
  const base = rank.xp, span = next ? next.xp - rank.xp : 1;
  const pct = next ? Math.min(100, ((save.xp - base) / span) * 100) : 100;
  $('#xp-fill').style.width = pct + '%';
}

// ── 타이틀 화면 ────────────────────────────────────────
const BUBBLE_LINES = [
  '안녕! 나는 <b>프롬토</b>야.<br />AI에게 잘 부탁하는 법,<br />내가 알려줄게! ✨',
  '역할 · 목적 · 맥락 · 형식 · 톤<br />5가지만 기억해! 🎯',
  '"그냥 해줘" 말고<br />구체적으로 부탁해 봐! 💪',
  '결과가 아쉬우면<br />고쳐 말하면 돼. 3번쯤! 🔁',
  '번개 퀴즈에서<br />콤보를 노려봐! ⚡',
];
let bubbleIdx = 0, bubbleTimer = null;
function startBubbleCycle() {
  clearInterval(bubbleTimer);
  bubbleTimer = setInterval(() => {
    bubbleIdx = (bubbleIdx + 1) % BUBBLE_LINES.length;
    const el = $('#speech-bubble');
    el.style.opacity = 0;
    setTimeout(() => { el.innerHTML = BUBBLE_LINES[bubbleIdx]; el.style.opacity = 1; }, 180);
  }, 4200);
}

function renderTitleStats() {
  $('#title-stats').innerHTML =
    `⭐ ${totalStars()}성 · 📖 ${clearedCount()}/${TOTAL_LEVELS} 클리어 · 🪙 ${save.coins}코인 · 🏆 퀴즈 최고 ${save.quizBest}점`;
}

// ══ 스토리 맵 ══════════════════════════════════════════
function isLevelUnlocked(levelId) {
  const idx = ALL_LEVELS.findIndex(l => l.id === levelId);
  if (idx <= 0) return true;
  return !!save.stars[ALL_LEVELS[idx - 1].id];
}
function starsFor(id) { return save.stars[id] || 0; }
function starStr(n) {
  let s = '';
  for (let i = 0; i < 3; i++) s += i < n ? '★' : '<span class="empty">★</span>';
  return s;
}

function renderMap() {
  $('#chapter-list').innerHTML = CHAPTERS.map(ch => {
    const nodes = ch.levels.map(l => {
      const unlocked = isLevelUnlocked(l.id);
      const stars = starsFor(l.id);
      const levelNum = ALL_LEVELS.findIndex(x => x.id === l.id) + 1;
      return `
        <button class="level-node ${stars ? 'completed' : ''}" data-level="${l.id}" ${unlocked ? '' : 'disabled'}>
          <span class="level-node-num">MISSION ${levelNum}</span>
          <span class="level-node-emoji">${unlocked ? l.emoji : '🔒'}</span>
          <span class="level-node-title">${l.title}</span>
          <span class="level-node-stars">${starStr(stars)}</span>
        </button>`;
    }).join('');
    return `
      <div class="chapter-card">
        <div class="chapter-head">
          <div class="chapter-emoji">${ch.emoji}</div>
          <div><div class="chapter-name">${ch.name}</div><div class="chapter-desc">${ch.desc}</div></div>
        </div>
        <div class="level-nodes">${nodes}</div>
      </div>`;
  }).join('');
  $$('.level-node', $('#chapter-list')).forEach(btn => {
    btn.addEventListener('click', () => { SoundFX.click(); startLevel(btn.dataset.level); });
  });
}

// ══ 레벨 플레이 ════════════════════════════════════════
let currentLevel = null;
let selections = {};
let followupDone = false;

function startLevel(levelId) {
  currentLevel = ALL_LEVELS.find(l => l.id === levelId);
  if (!currentLevel) return;
  selections = {};
  followupDone = false;

  $('#level-title').textContent = `${currentLevel.emoji} ${currentLevel.title}`;
  $('#level-chapter-chip').textContent = currentLevel.chapter.name;
  $('#char-avatar').textContent = currentLevel.emoji;
  $('#char-name').textContent = currentLevel.char;
  $('#char-role').textContent = currentLevel.charRole;
  $('#situation-text').textContent = currentLevel.situation;
  $('#goal-text').textContent = currentLevel.goal;

  buildSlotsUI();
  showStage('situation');
  showScreen('level');
}

function showStage(name) {
  ['situation', 'build', 'answer'].forEach(s =>
    $('#stage-' + s).classList.toggle('active', s === name));
  window.scrollTo(0, 0);
}

function buildSlotsUI() {
  $('#slots-container').innerHTML = SLOTS.map(slot => {
    const opts = shuffle(currentLevel.build[slot.key].map((o, i) => ({ ...o, _i: i }))).map(o =>
      `<button class="slot-option" data-slot="${slot.key}" data-idx="${o._i}">${escapeHTML(o.t)}</button>`).join('');
    return `
      <div class="slot-block" id="slot-${slot.key}">
        <div class="slot-head">
          <span class="slot-icon">${slot.icon}</span>
          <div><div class="slot-name">${slot.name}</div><div class="slot-desc">${slot.desc}</div></div>
          <span class="slot-check">✓ 완료</span>
        </div>
        <div class="slot-options">${opts}</div>
      </div>`;
  }).join('');
  $$('.slot-option', $('#slots-container')).forEach(btn => {
    btn.addEventListener('click', () => onSlotOption(btn));
  });
  updateBuildProgress();
}

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function onSlotOption(btn) {
  const slot = btn.dataset.slot, idx = +btn.dataset.idx;
  const prev = selections[slot];
  if (prev === idx) {
    delete selections[slot];
    btn.classList.remove('selected');
    $('#slot-' + slot).classList.remove('filled');
    SoundFX.deselect();
  } else {
    selections[slot] = idx;
    $$(`.slot-option[data-slot="${slot}"]`).forEach(b => b.classList.toggle('selected', +b.dataset.idx === idx));
    $('#slot-' + slot).classList.add('filled');
    SoundFX.select();
  }
  updateBuildProgress();
}

function updateBuildProgress() {
  const filled = Object.keys(selections).length;
  $('#build-progress-fill').style.width = (filled / SLOTS.length * 100) + '%';
  $('#build-progress-text').textContent = `${filled} / ${SLOTS.length} 요소 선택`;
  $('#btn-send').disabled = filled !== SLOTS.length;
}

function slotTotal() {
  let total = 0;
  for (const slot of SLOTS) {
    const idx = selections[slot.key];
    if (idx != null) total += currentLevel.build[slot.key][idx].s;
  }
  return total; // max 100
}

function responseTier(total) {
  if (total >= 80) return 'great';
  if (total >= 45) return 'good';
  return 'bad';
}

// 타이핑 효과
let typeTimer = null;
function typeResponse(text, done) {
  const el = $('#ai-response');
  el.innerHTML = '';
  let i = 0;
  clearInterval(typeTimer);
  typeTimer = setInterval(() => {
    if (i >= text.length) {
      clearInterval(typeTimer);
      el.innerHTML = escapeHTML(text) + '<span class="caret">▋</span>';
      if (done) done();
      return;
    }
    // 한 번에 1~3글자씩 (한글은 글자 단위)
    const step = Math.min(3, text.length - i);
    i += step;
    el.innerHTML = escapeHTML(text.slice(0, i)) + '<span class="caret">▋</span>';
    if (i % 9 === 0) SoundFX.typeBlip();
    el.scrollTop = el.scrollHeight;
  }, 24);
}

function onSend() {
  const total = slotTotal();
  SoundFX.send();
  showStage('answer');
  $('#followup-panel').classList.add('hidden');
  const tier = responseTier(total);
  const responseText = currentLevel.responses[tier];
  typeResponse(responseText, showFollowup);
}

function showFollowup() {
  const fu = currentLevel.followup;
  $('#followup-question').textContent = fu.q;
  $('#followup-options').innerHTML = shuffle(fu.options.map((o, i) => ({ ...o, _i: i }))).map(o =>
    `<button class="followup-option" data-idx="${o._i}">${escapeHTML(o.t)}</button>`).join('');
  $('#followup-panel').classList.remove('hidden');
  $$('.followup-option', $('#followup-options')).forEach(btn => {
    btn.addEventListener('click', () => onFollowupPick(btn));
  });
}

function onFollowupPick(btn) {
  if (followupDone) return;
  followupDone = true;
  const fu = currentLevel.followup;
  const idx = +btn.dataset.idx;
  const correct = idx === fu.answer;
  $$('.followup-option', $('#followup-options')).forEach(b => {
    b.disabled = true;
    const i = +b.dataset.idx;
    if (i === fu.answer) b.classList.add('correct');
    else if (i === idx) b.classList.add('wrong');
  });
  correct ? SoundFX.correct() : SoundFX.wrong();
  const total = slotTotal() + fu.options[idx].s; // max 120
  setTimeout(() => finishLevel(total), correct ? 750 : 1100);
}

function finishLevel(total) {
  const stars = total >= 95 ? 3 : total >= 65 ? 2 : 1;
  const prevStars = save.stars[currentLevel.id] || 0;
  const improved = stars > prevStars;
  const xpGain = improved ? stars * 100 : 20;
  const coinsGain = improved ? stars * 30 + (prevStars ? 0 : 20) : 10; // 첫 클리어 보너스 포함

  save.stars[currentLevel.id] = Math.max(prevStars, stars);
  save.xp += xpGain;
  save.coins += coinsGain;
  save.clears += prevStars ? 0 : 1;
  persistSave();
  updateHUD();
  renderTitleStats();

  // 모달 채우기
  $('#modal-title').textContent = stars === 3 ? '🎉 완벽한 프롬프트!' : stars === 2 ? '👍 미션 클리어!' : '😅 미션 클리어…';
  $('#modal-sub').textContent = `${currentLevel.chapter.name} · ${currentLevel.title}`;
  $('#modal-score').textContent = total;
  $('#modal-xp').textContent = `+${xpGain}`;
  $('#modal-coins').textContent = `+${coinsGain}`;
  const tier = responseTier(Math.min(slotTotal(), 100));
  const fb = {
    great: '✨ 최고의 프롬프트! AI가 맥락을 정확히 이해하고 바로 쓸 수 있는 답을 만들었어요.',
    good: '🙂 나쁘지 않아요! 역할·맥락·형식을 더 구체적으로 넣으면 AI가 훨씬 똑똑해집니다.',
    bad: '🤔 AI가 추측에 의존했어요. 역할과 맥락("너는 ~야", "상황은 ~야")부터 채워 보세요!',
  };
  $('#modal-feedback').textContent = fb[tier] + `\n💡 모범 답안은 📕 도감에서 언제든 다시 볼 수 있어요!`;

  const starEls = $$('#modal-stars .star');
  starEls.forEach((el, i) => {
    el.classList.toggle('lit', i < stars);
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  });

  // 다음 미션 버튼: 마지막 레벨이면 지도로
  const myIdx = ALL_LEVELS.findIndex(l => l.id === currentLevel.id);
  const nextBtn = $('#modal-btn-next');
  if (myIdx < ALL_LEVELS.length - 1) { nextBtn.textContent = '다음 미션 →'; nextBtn.disabled = false; }
  else { nextBtn.textContent = '🏁 모든 미션 완료!'; }

  $('#modal-result').classList.remove('hidden');
  if (stars === 3) { SoundFX.fanfare(); launchConfetti(); }
  else SoundFX.star(stars - 1);
}

// ═══════════════════════════════════════════════════════════
// 프롬프트 마스터 — 게임 로직 (2/2): 퀴즈 · 도감 · 가이드북 · FX
// ═══════════════════════════════════════════════════════════

// ══ 번개 퀴즈 ═══════════════════════════════════════════
const QUIZ_TIME = 60;
let quizTimer = null, quizTimeLeft = QUIZ_TIME, quizScore = 0, quizCombo = 0;
let quizCorrect = 0, quizAnswered = 0, quizQuestions = [], quizQIdx = 0, quizLocked = false;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function quizBestText() { $('#quiz-best-score').textContent = save.quizBest + '점'; }

function startQuiz() {
  quizQuestions = shuffle(QUIZ_BANK);
  quizQIdx = 0; quizScore = 0; quizCombo = 0; quizCorrect = 0; quizAnswered = 0; quizTimeLeft = QUIZ_TIME; quizLocked = false;
  $('#quiz-setup').classList.add('hidden');
  $('#quiz-result').classList.add('hidden');
  $('#quiz-play').classList.remove('hidden');
  renderQuizHUD();
  renderQuizQuestion();
  clearInterval(quizTimer);
  quizTimer = setInterval(quizTick, 100);
}

function quizTick() {
  quizTimeLeft -= 0.1;
  if (quizTimeLeft <= 5.05 && quizTimeLeft > 0 && Math.abs(quizTimeLeft % 1) < 0.1) SoundFX.tick();
  if (quizTimeLeft <= 0) { quizTimeLeft = 0; endQuiz(); }
  renderQuizHUD();
}

function renderQuizHUD() {
  $('#quiz-time').textContent = Math.ceil(quizTimeLeft);
  const pct = (quizTimeLeft / QUIZ_TIME) * 100;
  const fill = $('#quiz-timer-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('danger', quizTimeLeft <= 10);
  $('#quiz-score').textContent = quizScore;
  const comboEl = $('#quiz-combo');
  comboEl.textContent = `🔥 ${quizCombo} 콤보`;
  comboEl.classList.toggle('hot', quizCombo >= 2);
}

function renderQuizQuestion() {
  if (quizQIdx >= quizQuestions.length) quizQuestions = quizQuestions.concat(shuffle(QUIZ_BANK));
  const q = quizQuestions[quizQIdx];
  $('#quiz-qtype').textContent = '🏷️ ' + q.type;
  $('#quiz-question').textContent = q.q;
  $('#quiz-options').innerHTML = q.options.map((o, i) =>
    `<button class="quiz-option" data-idx="${i}">${escapeHTML(o)}</button>`).join('');
  $$('.quiz-option', $('#quiz-options')).forEach(btn =>
    btn.addEventListener('click', () => onQuizAnswer(btn, q)));
  quizLocked = false;
}

function onQuizAnswer(btn, q) {
  if (quizLocked) return;
  quizLocked = true;
  const idx = +btn.dataset.idx;
  const correct = idx === q.answer;
  quizAnswered++;
  $$('.quiz-option', $('#quiz-options')).forEach(b => {
    b.disabled = true;
    const i = +b.dataset.idx;
    if (i === q.answer) b.classList.add('correct');
    else if (i === idx) b.classList.add('wrong');
  });
  if (correct) {
    quizCorrect++;
    quizCombo++;
    quizScore += 100 + Math.max(0, quizCombo - 1) * 20;
    SoundFX.correct();
  } else {
    quizCombo = 0;
    SoundFX.wrong();
  }
  renderQuizHUD();
  quizQIdx++;
  setTimeout(renderQuizQuestion, correct ? 420 : 750);
}

function endQuiz() {
  clearInterval(quizTimer);
  quizTimer = null;
  $('#quiz-play').classList.add('hidden');
  $('#quiz-result').classList.remove('hidden');
  const coinsGain = quizCorrect * 2;
  save.coins += coinsGain;
  save.xp += quizCorrect * 15;
  const isBest = quizScore > save.quizBest;
  if (isBest) save.quizBest = quizScore;
  persistSave();
  updateHUD();
  renderTitleStats();
  quizBestText();

  $('#quiz-final-score').textContent = quizScore;
  $('#quiz-result-emoji').textContent = quizCorrect >= 15 ? '🏆' : quizCorrect >= 8 ? '🎉' : '💪';
  $('#quiz-result-title').textContent = quizCorrect >= 15 ? '프롬프트 마스터급!' : quizCorrect >= 8 ? '시간 종료!' : '조금만 더 연습하면!';
  $('#quiz-result-detail').textContent = `60초 동안 ${quizAnswered}문제 중 ${quizCorrect}문제 정답 · +${quizCorrect * 15} XP · +${coinsGain} 🪙`;
  $('#quiz-result-best').textContent = isBest ? '🎊 신기록 달성!' : `🏆 최고 점수: ${save.quizBest}점`;
  if (isBest && quizScore > 0) { SoundFX.fanfare(); launchConfetti(); } else SoundFX.levelup();
}

// ══ 프롬프트 도감 ══════════════════════════════════════
function renderCollection() {
  const done = clearedCount();
  $('#collection-progress-fill').style.width = (done / TOTAL_LEVELS * 100) + '%';
  $('#collection-progress-text').textContent = `${done} / ${TOTAL_LEVELS} 수집`;
  $('#collection-grid').innerHTML = ALL_LEVELS.map((l, i) => {
    const unlocked = !!save.stars[l.id];
    return `
      <button class="collection-card ${unlocked ? '' : 'locked'}" data-level="${l.id}" ${unlocked ? '' : 'disabled'}>
        <span class="collection-emoji">${unlocked ? l.emoji : '🔒'}</span>
        <span><span class="collection-name">MISSION ${i + 1}. ${l.title}</span><br />
        <span class="collection-sub">${unlocked ? '모범 프롬프트 열기 →' : '스토리에서 클리어하면 해금'}</span></span>
      </button>`;
  }).join('');
  $$('.collection-card', $('#collection-grid')).forEach(btn => {
    btn.addEventListener('click', () => { SoundFX.click(); openDetail(btn.dataset.level); });
  });
}

function openDetail(levelId) {
  const l = ALL_LEVELS.find(x => x.id === levelId);
  if (!l) return;
  $('#detail-emoji').textContent = l.emoji;
  $('#detail-title').textContent = `MISSION · ${l.title}`;
  $('#detail-mission').textContent = l.goal;
  $('#detail-prompt').textContent = l.modelPrompt;
  $('#detail-why').textContent = l.modelWhy;
  $('#modal-detail').classList.remove('hidden');
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove();
  }
  if (btn) { const old = btn.textContent; btn.textContent = '✅ 복사됨!'; setTimeout(() => { btn.textContent = old; }, 1600); }
  else toast('📋 클립보드에 복사했어요!');
}

// ══ 가이드북 ═══════════════════════════════════════════
function renderGuide() {
  $('#elements-grid').innerHTML = ELEMENT_CARDS.map(e => `
    <div class="element-card">
      <div class="element-emoji">${e.icon}</div>
      <div class="element-name">${e.name}</div>
      <div class="element-example">${e.example}</div>
    </div>`).join('');
  $('#followup-chips').innerHTML = FOLLOWUP_EXAMPLES.map(t =>
    `<button class="chip">${escapeHTML(t)}</button>`).join('');
  $$('.chip', $('#followup-chips')).forEach(chip =>
    chip.addEventListener('click', () => copyText(chip.textContent, null)));
  $('#tips-list').innerHTML = TIPS.map(t => `<li>${t}</li>`).join('');
}

// ══ 컨페티 ═════════════════════════════════════════════
const confettiCanvas = $('#confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');
let confettiParticles = [], confettiAnim = null;
function resizeConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
function launchConfetti() {
  resizeConfetti();
  const colors = ['#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#ffffff'];
  for (let i = 0; i < 140; i++) {
    confettiParticles.push({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 240,
      y: window.innerHeight * 0.35 + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 11,
      vy: Math.random() * -9 - 3,
      size: Math.random() * 9 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
      shape: Math.random() < 0.35 ? 'circle' : 'rect',
    });
  }
  cancelAnimationFrame(confettiAnim);
  const step = () => {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiParticles.forEach(p => {
      p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.rot += p.vrot;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rot);
      confettiCtx.fillStyle = p.color;
      if (p.shape === 'circle') { confettiCtx.beginPath(); confettiCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2); confettiCtx.fill(); }
      else confettiCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      confettiCtx.restore();
    });
    confettiParticles = confettiParticles.filter(p => p.y < window.innerHeight + 30);
    if (confettiParticles.length) confettiAnim = requestAnimationFrame(step);
    else confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  };
  step();
}

// ══ 배경 파티클 캔버스 ═════════════════════════════════
const bgCanvas = $('#bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
let bgParticles = [];
function initBg() {
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  const chars = ['ㅎ', 'ㄱ', 'ㄴ', 'ㄷ', '★', '·'];
  bgParticles = Array.from({ length: 46 }, () => ({
    x: Math.random() * bgCanvas.width,
    y: Math.random() * bgCanvas.height,
    r: Math.random() * 1.8 + 0.6,
    vy: -(Math.random() * 0.35 + 0.12),
    vx: (Math.random() - 0.5) * 0.15,
    alpha: Math.random() * 0.5 + 0.15,
    tw: Math.random() * Math.PI * 2,
    ch: Math.random() < 0.22 ? chars[Math.floor(Math.random() * chars.length)] : null,
  }));
}
function bgStep() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  bgParticles.forEach(p => {
    p.y += p.vy; p.x += p.vx; p.tw += 0.02;
    if (p.y < -20) { p.y = bgCanvas.height + 10; p.x = Math.random() * bgCanvas.width; }
    const a = p.alpha * (0.6 + 0.4 * Math.sin(p.tw));
    if (p.ch) {
      bgCtx.font = `${p.r * 9}px sans-serif`;
      bgCtx.fillStyle = `rgba(140, 200, 255, ${a * 0.7})`;
      bgCtx.fillText(p.ch, p.x, p.y);
    } else {
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(120, 230, 255, ${a})`;
      bgCtx.fill();
    }
  });
  requestAnimationFrame(bgStep);
}

// ══ 이벤트 바인딩 ══════════════════════════════════════
function bindEvents() {
  $('#btn-home').addEventListener('click', () => { SoundFX.click(); showScreen('title'); renderTitleStats(); });
  $('#btn-mute').addEventListener('click', () => {
    const muted = SoundFX.toggleMute();
    $('#btn-mute').textContent = muted ? '🔇' : '🔊';
    if (!muted) SoundFX.click();
  });
  $('#btn-story').addEventListener('click', () => { SoundFX.click(); renderMap(); showScreen('map'); });
  $('#btn-quiz').addEventListener('click', () => { SoundFX.click(); quizBestText(); showScreen('quiz'); });
  $('#btn-collection').addEventListener('click', () => { SoundFX.click(); renderCollection(); showScreen('collection'); });
  $('#btn-guide').addEventListener('click', () => { SoundFX.click(); showScreen('guide'); });

  $('#btn-level-back').addEventListener('click', () => { SoundFX.click(); renderMap(); showScreen('map'); });
  $('#btn-situation-go').addEventListener('click', () => { SoundFX.click(); showStage('build'); });
  $('#btn-send').addEventListener('click', onSend);

  $('#modal-btn-retry').addEventListener('click', () => { SoundFX.click(); $('#modal-result').classList.add('hidden'); startLevel(currentLevel.id); });
  $('#modal-btn-next').addEventListener('click', () => {
    SoundFX.click();
    $('#modal-result').classList.add('hidden');
    const myIdx = ALL_LEVELS.findIndex(l => l.id === currentLevel.id);
    if (myIdx < ALL_LEVELS.length - 1) startLevel(ALL_LEVELS[myIdx + 1].id);
    else { renderMap(); showScreen('map'); }
  });

  $('#btn-quiz-start').addEventListener('click', () => { SoundFX.unlock(); SoundFX.click(); startQuiz(); });
  $('#btn-quiz-retry').addEventListener('click', () => { SoundFX.click(); startQuiz(); });
  $('#btn-quiz-home').addEventListener('click', () => { SoundFX.click(); showScreen('title'); renderTitleStats(); });

  $('#modal-detail-close').addEventListener('click', () => { SoundFX.click(); $('#modal-detail').classList.add('hidden'); });
  $('#btn-copy-prompt').addEventListener('click', e => copyText($('#detail-prompt').textContent, e.currentTarget));

  // 오버레이 바깥 클릭 시 닫기
  [['#modal-result'], ['#modal-detail']].forEach(([sel]) => {
    $(sel).addEventListener('click', e => { if (e.target === $(sel)) $(sel).classList.add('hidden'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('#modal-result').classList.add('hidden'); $('#modal-detail').classList.add('hidden'); }
  });

  window.addEventListener('resize', () => { initBg(); resizeConfetti(); });
  // 첫 상호작용에서 오디오 잠금 해제
  document.addEventListener('pointerdown', () => SoundFX.unlock(), { once: true });
}

// ══ 초기화 ═════════════════════════════════════════════
function init() {
  renderTitleStats();
  renderGuide();
  quizBestText();
  updateHUD();
  $('#btn-mute').textContent = SoundFX.isMuted() ? '🔇' : '🔊';
  startBubbleCycle();
  initBg();
  requestAnimationFrame(bgStep);
  bindEvents();
}
init();

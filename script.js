const WORD_POOL = [
    'cat', 'dog', 'fish', 'bird', 'tree', 'flower', 'sun', 'moon', 'star', 'cloud', 
    'rain', 'snow', 'wind', 'fire', 'water', 'earth', 'sky', 'ocean', 'mountain', 'river', 'valley', 'forest','desert', 'island', 'city', 'village', 'road', 'bridge', 'house', 'home', 'school', 'office', 'market', 'shop', 'restaurant', 'cafe', 'park', 'garden', 'library', 'museum',
    'music', 'song', 'dance', 'art', 'painting', 'sculpture', 'poem', 'story', 'book', 'movie', 'theater', 'concert', 'festival', 'game', 'sport', 'team', 'player', 'coach', 'referee',
    'book', 'pen', 'paper', 'computer', 'phone', 'tablet',
    'happy', 'sad', 'angry', 'calm', 'love', 'hate', 'friend', 'enemy', 'family', 'home', 'work', 'play', 'sleep', 'dream', 'wake', 'eat', 'drink', 'cook', 'clean', 'wash', 'drive', 'walk', 'run', 'jump', 'swim', 'fly',
    'car', 'train', 'plane', 'boat', 'road', 'track', 'flight', 'sail', 'city', 'village', 'ship', 'island', 'desert', 'forest', 'jungle', 'beach', 'cave', 'valley', 'hill', 'plateau', 'volcano', 'glacier', 'waterfall', 'lagoon', 'reef', 'canyon', 'cliff', 'meadow',
    'computer', 'phone', 'tablet', 'keyboard', 'mouse', 'screen'
];

let startWord = '';
let targetWord = '';
let currentWord = '';
let bridge = [];
let steps = 0;
let isProcessing = false;

let totalScore = 0;
let globalBestScore = 0;

let isHardMode = false;
let requiredLetter = '';
let isSoundOn = true;

let ai = null;

// =====================
// WEB AUDIO ENGINE
// =====================
let audioCtx = null;
let bgmNodes = null; // holds refs so we can stop BGM

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playTone(freq, type, duration, volume = 0.3, startTime = null) {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    const t = startTime ?? ctx.currentTime;
    osc.start(t);
    osc.stop(t + duration);
}

function playSFXSuccess() {
    if (!isSoundOn) return;
    // Ascending chime: C5 → E5 → G5
    const ctx = getAudioCtx();
    [[523, 0], [659, 0.12], [784, 0.24]].forEach(([f, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = f;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t); osc.stop(t + 0.35);
    });
}

function playSFXError() {
    if (!isSoundOn) return;
    // Low thud
    playTone(120, 'sawtooth', 0.25, 0.3);
    setTimeout(() => playTone(90, 'sawtooth', 0.2, 0.2), 120);
}

function playSFXWin() {
    if (!isSoundOn) return;
    // Fanfare: C5 E5 G5 C6
    const ctx = getAudioCtx();
    [[523, 0], [659, 0.15], [784, 0.30], [1047, 0.45], [784, 0.65], [1047, 0.8]].forEach(([f, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.value = f;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t); osc.stop(t + 0.4);
    });
}

// Ambient BGM: soft arpeggiated chords
let bgmInterval = null;
const BGM_NOTES = [261, 329, 392, 523, 392, 329]; // C4 E4 G4 C5 loop
let bgmStep = 0;

function startBGM() {
    if (!isSoundOn || bgmInterval) return;
    bgmStep = 0;
    bgmInterval = setInterval(() => {
        if (!isSoundOn) return;
        const ctx = getAudioCtx();
        const freq = BGM_NOTES[bgmStep % BGM_NOTES.length];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
        bgmStep++;
    }, 400);
}

function stopBGM() {
    if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

// =====================
// AI INIT
// =====================
async function initializeAI() {
    try {
        const { GoogleGenerativeAI } = await import('https://esm.run/@google/generative-ai@0.21.0');
        ai = new GoogleGenerativeAI({ apiKey: 'AQ.Ab8RN6KnYonEmKGWk3NgXGdtISR6V-ARiwmw8nZeFzGpM7fwVA' });
    } catch (error) {
        console.error('Failed to initialize AI:', error);
        updateStatus('⚠️ AI Services unavailable. Game will run in demo mode.', 'error');
    }
}

// =====================
// DOM REFS
// =====================
const homeScreen = document.getElementById('homeScreen');
const gameScreen = document.getElementById('gameScreen');
const pauseOverlay = document.getElementById('pauseOverlay');

const startWordEl = document.getElementById('startWord');
const targetWordEl = document.getElementById('targetWord');
const currentDisplay = document.getElementById('currentDisplay');
const bridgeChain = document.getElementById('bridgeChain');
const guessInput = document.getElementById('guessInput');
const submitBtn = document.getElementById('submitGuess');
const inputContainer = document.getElementById('inputContainer');
const statusMsg = document.getElementById('statusMessage');
const stepCount = document.getElementById('stepCount');
const totalScoreEl = document.getElementById('totalScoreEl');
const homeBestScoreEl = document.getElementById('homeBestScoreEl');

const startGameBtn = document.getElementById('startGameBtn');
const nextBtn = document.getElementById('nextBtn');
const hintBtn = document.getElementById('hintBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const returnMenuBtn = document.getElementById('returnMenuBtn');
const homeSoundBtn = document.getElementById('homeSoundBtn');
const gameSoundBtn = document.getElementById('gameSoundBtn');

const difficultySelect = document.getElementById('difficultySelect');
const restrictionDisplay = document.getElementById('restrictionDisplay');
const requiredLetterEl = document.getElementById('requiredLetterEl');

// =====================
// SOUND TOGGLE
// =====================
function toggleSound() {
    isSoundOn = !isSoundOn;
    const icon = isSoundOn ? '🔊' : '🔇';
    homeSoundBtn.textContent = icon;
    gameSoundBtn.textContent = icon;

    if (isSoundOn) {
        if (!gameScreen.classList.contains('hidden')) startBGM();
    } else {
        stopBGM();
    }
}

homeSoundBtn.addEventListener('click', toggleSound);
gameSoundBtn.addEventListener('click', toggleSound);

// =====================
// CORE LOGIC
// =====================
function pickRandomWord() {
    return WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)];
}

function pickStartAndTarget() {
    let start, target;
    do { start = pickRandomWord(); target = pickRandomWord(); } while (start === target);
    return { start, target };
}

async function isRelatedWithGemini(word1, word2) {
    if (word1 === word2) return false;
    const prompt = `
You are the judge of a casual word-association game called "Word Bridge".
Determine if there is a reasonable semantic, contextual, thematic, or conceptual link between these two words.

Word 1: "${word1}"
Word 2: "${word2}"

Guidelines:
- Be generous and flexible. 
- Return true if they share ANY real-world association, category, synonym, or antonym relationship.
- Return false ONLY if they are completely unrelated.

Respond ONLY with JSON: {"isRelated": true} or {"isRelated": false}
`;
    try {
        if (!ai) return simpleWordRelationCheck(word1, word2);
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
        });
        const data = JSON.parse(result.response.text());
        return data.isRelated;
    } catch (error) {
        console.error('Gemini verification error:', error);
        return simpleWordRelationCheck(word1, word2);
    }
}

function simpleWordRelationCheck(word1, word2) {
    const relations = {
        'cat': ['dog', 'pet', 'kitten', 'mouse', 'animal'],
        'dog': ['cat', 'pet', 'puppy', 'bone', 'animal'],
        'fish': ['water', 'ocean', 'sea', 'bird', 'swim'],
        'bird': ['sky', 'tree', 'fly', 'wing', 'animal'],
        'tree': ['forest', 'flower', 'green', 'leaf', 'nature'],
        'flower': ['tree', 'garden', 'plant', 'bloom', 'nature'],
        'sun': ['moon', 'sky', 'light', 'star', 'day'],
        'moon': ['sun', 'night', 'star', 'sky', 'light'],
        'star': ['moon', 'sky', 'sun', 'night', 'light'],
        'cloud': ['rain', 'sky', 'weather', 'white', 'float'],
        'rain': ['water', 'cloud', 'weather', 'wet', 'storm'],
        'snow': ['cold', 'winter', 'white', 'ice', 'weather'],
        'wind': ['air', 'weather', 'blow', 'breeze', 'storm'],
        'fire': ['heat', 'warm', 'burn', 'light', 'danger'],
        'water': ['ocean', 'rain', 'fish', 'wet', 'sea'],
        'earth': ['ground', 'soil', 'world', 'planet', 'nature'],
        'sky': ['blue', 'cloud', 'bird', 'plane', 'weather'],
        'ocean': ['water', 'sea', 'fish', 'ship', 'island'],
        'mountain': ['hill', 'climb', 'snow', 'valley', 'nature'],
        'river': ['water', 'flow', 'valley', 'bridge', 'stream'],
        'house': ['home', 'family', 'building', 'door', 'live'],
        'home': ['house', 'family', 'live', 'comfort', 'rest'],
        'book': ['read', 'story', 'page', 'library', 'learn'],
        'game': ['play', 'fun', 'win', 'sport', 'team'],
        'music': ['song', 'play', 'sound', 'hear', 'dance'],
        'song': ['music', 'sing', 'sound', 'word', 'listen'],
        'dance': ['music', 'move', 'joy', 'party', 'step'],
        'happy': ['smile', 'joy', 'laugh', 'love', 'glad'],
        'sad': ['cry', 'emotion', 'tears', 'unhappy', 'sorrow'],
        'love': ['heart', 'happy', 'family', 'friend', 'care'],
        'friend': ['love', 'family', 'help', 'trust', 'talk'],
    };
    if (relations[word1]?.includes(word2)) return true;
    if (relations[word2]?.includes(word1)) return true;
    const commonLetters = word1.split('').filter(l => word2.includes(l)).length;
    return commonLetters >= Math.min(word1.length, word2.length) * 0.3;
}

function renderBridge() {
    bridgeChain.innerHTML = '';
    bridge.forEach((word, index) => {
        if (index > 0) {
            const arrow = document.createElement('span');
            arrow.className = 'bridge-arrow';
            arrow.textContent = ' → ';
            bridgeChain.appendChild(arrow);
        }
        const span = document.createElement('span');
        span.className = 'bridge-word';
        span.textContent = word;
        bridgeChain.appendChild(span);
    });
    currentDisplay.textContent = currentWord;
    stepCount.textContent = steps;
    totalScoreEl.textContent = totalScore;
}

function updateStatus(text, type = 'info') {
    statusMsg.textContent = text;
    statusMsg.className = 'status ' + type;
}

function loadNewGame() {
    const { start, target } = pickStartAndTarget();
    startWord = start; targetWord = target; currentWord = start;
    bridge = [start]; steps = 0; isProcessing = false;

    inputContainer.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    guessInput.value = '';
    guessInput.disabled = false;
    submitBtn.disabled = false;
    startWordEl.textContent = startWord;
    targetWordEl.textContent = targetWord;

    if (isHardMode) {
        restrictionDisplay.classList.remove('hidden');
        const cleanTarget = targetWord.replace(/[^a-z]/g, '');
        requiredLetter = cleanTarget[Math.floor(Math.random() * cleanTarget.length)];
        requiredLetterEl.textContent = requiredLetter.toUpperCase();
        updateStatus(`Connect "${currentWord}" to "${targetWord}". Must contain "${requiredLetter.toUpperCase()}".`, 'info');
    } else {
        restrictionDisplay.classList.add('hidden');
        requiredLetter = '';
        updateStatus('Type a word related to "' + currentWord + '" to begin your bridge pathing.', 'info');
    }

    renderBridge();
    guessInput.focus();
}

async function handleGuess() {
    if (isProcessing) return;
    const input = guessInput.value.trim().toLowerCase();
    if (!input) return updateStatus('Please type a word first.', 'error');
    if (input === currentWord) return updateStatus('That matches the current word! Shift strategies.', 'error');
    if (bridge.includes(input) && input !== startWord) {
        playSFXError();
        updateStatus('You have already crossed that word block!', 'error');
        guessInput.value = '';
        return;
    }
    if (isHardMode && !input.includes(requiredLetter)) {
        playSFXError();
        updateStatus(`❌ Constraint Violation: Word must contain "${requiredLetter.toUpperCase()}".`, 'error');
        guessInput.value = '';
        guessInput.focus();
        return;
    }

    isProcessing = true;
    guessInput.disabled = true;
    submitBtn.disabled = true;
    updateStatus('🤔 Verifying your link...', 'info');

    try {
        const related = await isRelatedWithGemini(currentWord, input);
        if (related) {
            currentWord = input;
            bridge.push(input);
            steps++;
            renderBridge();
            guessInput.value = '';

            if (input === targetWord) {
                playSFXWin();
                const pointsEarned = Math.max(10, Math.floor(1000 / steps));
                totalScore += pointsEarned;
                renderBridge();
                updateStatus(`🎉 Target Reached! You earned +${pointsEarned} Points.`, 'success');
                inputContainer.classList.add('hidden');
                nextBtn.classList.remove('hidden');
                nextBtn.focus();
            } else {
                playSFXSuccess();
                updateStatus(`✅ "${input}" verified! Keep pathing towards "${targetWord}".`, 'success');
                guessInput.disabled = false;
                submitBtn.disabled = false;
                guessInput.focus();
            }
        } else {
            playSFXError();
            updateStatus(`❌ Denied: "${input}" does not share semantic ties to "${currentWord}".`, 'error');
            guessInput.disabled = false;
            submitBtn.disabled = false;
            guessInput.value = '';
            guessInput.focus();
        }
    } catch (error) {
        console.error('Error:', error);
        updateStatus('⚠️ Submission interface failure encountered.', 'error');
        guessInput.disabled = false;
        submitBtn.disabled = false;
    } finally {
        isProcessing = false;
    }
}

async function giveHint() {
    if (isProcessing || !currentWord) return;
    updateStatus('💡 Generating hint...', 'info');
    const hints = WORD_POOL.filter(w => w !== currentWord && !bridge.includes(w));
    if (hints.length === 0) { updateStatus('No hint paths available. Try strategically!', 'error'); return; }
    let hint = hints[Math.floor(Math.random() * hints.length)];
    if (isHardMode && !hint.includes(requiredLetter)) {
        const validHints = hints.filter(h => h.includes(requiredLetter));
        if (validHints.length > 0) hint = validHints[Math.floor(Math.random() * validHints.length)];
    }
    updateStatus(`💡 Hint: Try thinking about "${hint}"`, 'info');
}

// =====================
// EVENT LISTENERS
// =====================
startGameBtn.addEventListener('click', () => {
    // Resume AudioContext on user gesture
    getAudioCtx().resume();
    isHardMode = (difficultySelect.value === 'hard');
    totalScore = 0;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    startBGM();
    loadNewGame();
});

nextBtn.addEventListener('click', loadNewGame);
submitBtn.addEventListener('click', handleGuess);
guessInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleGuess(); } });
hintBtn.addEventListener('click', giveHint);

pauseBtn.addEventListener('click', () => {
    stopBGM();
    pauseOverlay.classList.remove('hidden');
});

resumeBtn.addEventListener('click', () => {
    pauseOverlay.classList.add('hidden');
    startBGM();
    guessInput.focus();
});

returnMenuBtn.addEventListener('click', () => {
    if (totalScore > globalBestScore) globalBestScore = totalScore;
    if (globalBestScore > 0) {
        homeBestScoreEl.textContent = `🏆 Best Score: ${globalBestScore}`;
        homeBestScoreEl.classList.remove('hidden');
    }
    stopBGM();
    pauseOverlay.classList.add('hidden');
    gameScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
});

window.addEventListener('load', () => { initializeAI(); });

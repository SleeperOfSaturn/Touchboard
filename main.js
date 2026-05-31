const overlay = document.getElementById("keyboard-overlay");
const toggleInertiaBtn = document.getElementById("toggle-inertia");
const toggleAudioBtn = document.getElementById("toggle-audio");
const audioContainer = document.querySelector(".audio-box-container");
const visualizer = document.getElementById("audio-visualizer");
const sliderMap = {
    KeyZ: 0, KeyX: 16.6, KeyC: 33.3, KeyV: 50, KeyB: 66.6, KeyN: 83.3, KeyM: 100
};
const sliderFill = document.getElementById("hardware-slider-fill");
const sliderLabels = document.querySelectorAll(".slider-labels span");
let hideTimeout;

const keyboard = {
    KeyQ: [0,0], KeyW: [1,0], KeyE: [2,0], KeyR: [3,0], KeyT: [4,0], KeyY: [5,0], KeyU: [6,0], KeyI: [7,0], KeyO: [8,0], KeyP: [9,0],
    KeyA: [0.5,1], KeyS: [1.5,1], KeyD: [2.5,1], KeyF: [3.5,1], KeyG: [4.5,1], KeyH: [5.5,1], KeyJ: [6.5,1], KeyK: [7.5,1], KeyL: [8.5,1],
    KeyZ: [1,2], KeyX: [2,2], KeyC: [3,2], KeyV: [4,2], KeyB: [5,2], KeyN: [6,2], KeyM: [7,2]
};

// --- System Feature States ---
let isInertiaEnabled = false;
let isAudioEnabled = false;

// --- Physics & Interaction State ---
let activeKeys = new Set();
let originKey = null;
let currentKey = null;
let animationFrameId = null;

let velX = 0;
let velY = 0;
const friction = 0.92;

// --- Web Audio Synthesizer States ---
let audioCtx = null;
let oscillator = null;
let stereoPanner = null;
let gainNode = null;

// --- Feature Toggle Event Listeners ---
toggleInertiaBtn.addEventListener("click", () => {
    isInertiaEnabled = !isInertiaEnabled;
    toggleInertiaBtn.classList.toggle("enabled", isInertiaEnabled);
    toggleInertiaBtn.textContent = `Inertia: ${isInertiaEnabled ? 'ON' : 'OFF'}`;
});

toggleAudioBtn.addEventListener("click", () => {
    isAudioEnabled = !isAudioEnabled;
    toggleAudioBtn.classList.toggle("enabled", isAudioEnabled);
    toggleAudioBtn.textContent = `Spatial Synth: ${isAudioEnabled ? 'ON' : 'OFF'}`;
    
    if (!isAudioEnabled) {
        stopSynth();
    }
});

// --- Input Mechanics ---
window.addEventListener("keydown", (event) => {
    if (event.repeat) return;

    overlay.classList.add("visible");
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => overlay.classList.remove("visible"), 2000);

    const keyElement = document.querySelector(`[data-key="${event.code}"]`);
    if (keyElement) keyElement.classList.add("active");

    if (keyboard[event.code]) {
        activeKeys.add(event.code);

        if (!originKey) {
            originKey = event.code;
        } else {
            currentKey = event.code;

            if (isAudioEnabled) {
                initSynth();
            }

            if (!animationFrameId) {
                startInteractionLoop();
            }
        }
    }
});

window.addEventListener("keyup", (event) => {
    const keyElement = document.querySelector(`[data-key="${event.code}"]`);
    if (keyElement) keyElement.classList.remove("active");

    activeKeys.delete(event.code);

    if (event.code === currentKey) {
        currentKey = Array.from(activeKeys).find(k => k !== originKey) || null;
    }

    if (event.code === originKey) {
        if (activeKeys.size > 0) {
            originKey = Array.from(activeKeys)[0];
            currentKey = Array.from(activeKeys).find(k => k !== originKey) || null;
        } else {
            originKey = null;
            currentKey = null;
        }
    }

    // Cut sound engine immediately if interaction keys are dropped
    if (!originKey || !currentKey) {
        stopSynth();
        if (!isInertiaEnabled) stopInteractionLoop();
    }
});

// --- Web Audio Engine Methods ---
function initSynth() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume context if browser suspended it
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (!oscillator) {
        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();
        
        // Soft triangle wave for a retro aesthetic
        oscillator.type = 'triangle'; 
        
        // Attempt setup for stereo tracking, fallback to mono if panner isn't fully supported
        if (audioCtx.createStereoPanner) {
            stereoPanner = audioCtx.createStereoPanner();
            oscillator.connect(stereoPanner);
            stereoPanner.connect(gainNode);
        } else {
            oscillator.connect(gainNode);
        }
        
        gainNode.connect(audioCtx.destination);
        
        // Quick ramp up to prevent clicking sound pops
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1);
        
        oscillator.start();
        audioContainer.classList.add("playing");
    }
}

function updateSynthParameters(xFactor, yFactor) {
    if (!oscillator || !audioCtx) return;

    // Pitch: Map layout height (Y: 0 to 2) to a clean frequency scale (220Hz - 660Hz)
    // Low row (Y=2) -> 220Hz. Top row (Y=0) -> 660Hz.
    const targetFrequency = 660 - (yFactor * 220);
    oscillator.frequency.setTargetAtTime(targetFrequency, audioCtx.currentTime, 0.05);

    // Pan: Map grid width (X: 0 to 9) to left/right stereo distribution (-1 to +1)
    if (stereoPanner) {
        const targetPan = ((xFactor / 9) * 2) - 1; // Converts 0->9 range to -1->1 range
        stereoPanner.pan.setTargetAtTime(targetPan, audioCtx.currentTime, 0.05);
    }

    // Visual feedback linking visualizer scale directly to pitch
    const visHeight = 20 + ((660 - targetFrequency) / 440) * 60;
    visualizer.style.transform = `scaleY(${visHeight / 40})`;
}

function stopSynth() {
    if (oscillator && audioCtx) {
        const currentGain = gainNode.gain;
        currentGain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
        // Ramp down smoothly
        currentGain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
        
        const localOsc = oscillator;
        setTimeout(() => {
            try { localOsc.stop(); } catch(e){}
        }, 50);

        oscillator = null;
        gainNode = null;
        stereoPanner = null;
        audioContainer.classList.remove("playing");
        visualizer.style.transform = `scaleY(1)`;
    }
}

// --- Continuous Loop Interaction Engine ---
function startInteractionLoop() {
    function loop() {
        let keepLoopRunning = false;

        if (originKey && currentKey) {
            const [startX, startY] = keyboard[originKey];
            const [endX, endY] = keyboard[currentKey];
            const dx = endX - startX;
            const dy = endY - startY;

            if (isAudioEnabled) {
                // Pass current swipe vector location coordinates to direct synthesizer pitch engine
                updateSynthParameters(endX, endY);
            } else {
                // Standard Scroll Mechanics
                const accelFactor = 3.5;
                if (Math.abs(dx) > Math.abs(dy)) {
                    velX = (dx < 0 ? -1 : 1) * accelFactor;
                    velY = 0;
                } else {
                    velY = (dy < 0 ? -1 : 1) * accelFactor;
                    velX = 0;
                }
            }
            keepLoopRunning = true;
        } else if (isInertiaEnabled && !isAudioEnabled) {
            velX *= friction;
            velY *= friction;

            if (Math.abs(velX) < 0.05 && Math.abs(velY) < 0.05) {
                velX = 0;
                velY = 0;
                keepLoopRunning = false;
            } else {
                keepLoopRunning = true;
            }
        }

        if (!isAudioEnabled && (velX !== 0 || velY !== 0)) {
            window.scrollBy(velX * 5, velY * 5);
        }

        if (keepLoopRunning) {
            animationFrameId = requestAnimationFrame(loop);
        } else {
            animationFrameId = null;
        }
    }
    animationFrameId = requestAnimationFrame(loop);
}

function stopInteractionLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    velX = 0;
    velY = 0;
}
window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    
    /* ... Keep all your previous visual overlay and synth code here ... */

    // --- NEW: TOP ROW TOGGLE LOGIC (Q-P) ---
    const targetToggle = document.querySelector(`[data-control="${event.code}"]`);
    if (targetToggle) {
        targetToggle.classList.toggle("toggled");
    }

    // --- NEW: BOTTOM ROW SLIDER LOGIC (Z-M) ---
    if (sliderMap[event.code] !== undefined) {
        // 1. Update the slider bar width
        sliderFill.style.width = `${sliderMap[event.code]}%`;

        // 2. Highlight the active label
        sliderLabels.forEach(label => label.classList.remove("active-label"));
        
        // Find which label index matches our key row sequence
        const keysOrder = Object.keys(sliderMap);
        const activeIndex = keysOrder.indexOf(event.code);
        if (sliderLabels[activeIndex]) {
            sliderLabels[activeIndex].classList.add("active-label");
        }
    }
});
// --- Add these variables near the top of your main.js ---
const middleRow = {
    KeyA: 0.5, KeyS: 1.5, KeyD: 2.5, KeyF: 3.5, KeyG: 4.5, KeyH: 5.5, KeyJ: 6.5, KeyK: 7.5, KeyL: 8.5
};
const dialElement = document.getElementById("hardware-dial");
const dialDegreesText = document.getElementById("dial-degrees");

let rotationDegrees = 0; // Cumulative rotation tracker

// --- Update your startInteractionLoop function ---
function startInteractionLoop() {
    function loop() {
        let keepLoopRunning = false;

        if (originKey && currentKey) {
            // Check if BOTH pressed keys belong to the middle row
            if (middleRow[originKey] !== undefined && middleRow[currentKey] !== undefined) {
                
                // Calculate the relative step distance between the two keys
                const startX = middleRow[originKey];
                const endX = middleRow[currentKey];
                const dx = endX - startX; 

                // DIAL SENSITIVITY: Higher value = spins faster per key stepped
                const sensitivity = 4; 

                // Continuous relative addition/subtraction
                rotationDegrees += dx * sensitivity;

                // Update the UI
                dialElement.style.transform = `rotate(${rotationDegrees}deg)`;
                
                // Use a modulo operation to display clean 0-360 text feedback
                let displayDegrees = Math.round(rotationDegrees % 360);
                if (displayDegrees < 0) displayDegrees += 360;
                dialDegreesText.textContent = displayDegrees;

                keepLoopRunning = true;
            } 
            else if (isAudioEnabled) {
                // ... Your previous Synth code ...
                const [startX, startY] = keyboard[originKey];
                const [endX, endY] = keyboard[currentKey];
                updateSynthParameters(endX, endY);
                keepLoopRunning = true;
            } 
            else {
                // ... Your previous Scroll code ...
                const [startX, startY] = keyboard[originKey];
                const [endX, endY] = keyboard[currentKey];
                const dx = endX - startX;
                const dy = endY - startY;
                const accelFactor = 3.5;
                if (Math.abs(dx) > Math.abs(dy)) {
                    velX = (dx < 0 ? -1 : 1) * accelFactor;
                    velY = 0;
                } else {
                    velY = (dy < 0 ? -1 : 1) * accelFactor;
                    velX = 0;
                }
                keepLoopRunning = true;
            }
        } else if (isInertiaEnabled && !isAudioEnabled) {
            // ... Your previous Inertia code ...
            velX *= friction;
            velY *= friction;
            if (Math.abs(velX) < 0.05 && Math.abs(velY) < 0.05) {
                velX = 0; velY = 0;
                keepLoopRunning = false;
            } else {
                keepLoopRunning = true;
            }
        }

        if (!isAudioEnabled && (velX !== 0 || velY !== 0)) {
            window.scrollBy(velX * 5, velY * 5);
        }

        if (keepLoopRunning) {
            animationFrameId = requestAnimationFrame(loop);
        } else {
            animationFrameId = null;
        }
    }
    animationFrameId = requestAnimationFrame(loop);
}
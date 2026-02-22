import * as THREE from 'three';
import { HitTestManager } from './hitTest.js';
import { CubagemModule } from './cubagem.js';
import { PickingModule } from './picking.js';

// ========== Estado ==========
let renderer, scene, camera;
let hitTestManager;
let cubagemModule, pickingModule;
let currentMode = 'cubagem';
let xrSession = null;

// ========== DOM ==========
const overlay       = document.getElementById('overlay');
const btnStartAR    = document.getElementById('btn-start-ar');
const btnNewBox     = document.getElementById('btn-new-box');
const btnPlace      = document.getElementById('btn-place');
const btnMode       = document.getElementById('btn-mode');
const btnReset      = document.getElementById('btn-reset');
const hud           = document.getElementById('hud');
const controls      = document.getElementById('controls');
const statusMsg     = document.getElementById('status-msg');
const boxDims       = document.getElementById('box-dims');
const boxVol        = document.getElementById('box-vol');
const boxColorInd   = document.getElementById('box-color-indicator');
const countEl       = document.getElementById('count');
const currentModeEl = document.getElementById('current-mode');
const feedbackEl    = document.getElementById('feedback');

// ========== Inicialização Three.js ==========
function initThreeJS() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0.5, 1, 0.5);
    scene.add(dirLight);

    hitTestManager = new HitTestManager(renderer, scene);
    cubagemModule  = new CubagemModule(scene);
    pickingModule  = new PickingModule(scene);
    cubagemModule.activate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ========== WebXR ==========
async function startARSession() {
    if (!navigator.xr) { showFeedback('WebXR não suportado!', 'error'); return; }

    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) { showFeedback('AR não suportado neste dispositivo!', 'error'); return; }

    try {
        xrSession = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: overlay }
        });

        renderer.xr.setReferenceSpaceType('local');
        await renderer.xr.setSession(xrSession);

        await hitTestManager.requestHitTestSource(xrSession);

        btnStartAR.classList.add('hidden');
        hud.classList.remove('hidden');
        controls.classList.remove('hidden');
        statusMsg.textContent = 'Aponte para uma superfície plana';

        renderer.setAnimationLoop(onXRFrame);
        xrSession.addEventListener('end', onSessionEnd);
    } catch (err) {
        showFeedback(`Erro: ${err.message}`, 'error');
    }
}

function onSessionEnd() {
    xrSession = null;
    btnStartAR.classList.remove('hidden');
    hud.classList.add('hidden');
    controls.classList.add('hidden');
    statusMsg.textContent = 'Sessão encerrada. Toque para reiniciar.';
    renderer.setAnimationLoop(null);
}

// ========== Loop de Renderização ==========
function onXRFrame(timestamp, frame) {
    if (!frame) return;

    const refSpace = renderer.xr.getReferenceSpace();
    hitTestManager.update(frame, refSpace);

    const module = getActiveModule();
    const placed  = isContainerPlaced();

    if (hitTestManager.isHitDetected()) {
        const worldPos = hitTestManager.getHitPosition();

        if (placed && module.currentBox) {
            // Preview segue onde a câmera aponta dentro dos limites
            module.updatePreviewFromWorld(worldPos);
        } else if (!placed) {
            statusMsg.textContent = 'Superfície detectada! Toque "Posicionar" para colocar ' +
                (currentMode === 'cubagem' ? 'o palete.' : 'a caçamba.');
        }
    } else if (!placed) {
        statusMsg.textContent = 'Aponte para uma superfície plana...';
    }

    renderer.render(scene, camera);
}

// ========== Helpers ==========
function getActiveModule() {
    return currentMode === 'cubagem' ? cubagemModule : pickingModule;
}

function isContainerPlaced() {
    return currentMode === 'cubagem'
        ? cubagemModule.isPalletPlaced()
        : pickingModule.isTruckPlaced();
}

function showFeedback(msg, type = 'success') {
    feedbackEl.textContent = msg;
    feedbackEl.className = type;
    feedbackEl.classList.remove('hidden');
    feedbackEl.style.animation = 'none';
    feedbackEl.offsetHeight; // reflow
    feedbackEl.style.animation = '';
    setTimeout(() => feedbackEl.classList.add('hidden'), 2200);
}

function updateHUD(box) {
    boxDims.textContent       = box ? box.getDimsText()   : '--';
    boxVol.textContent        = box ? box.getVolumeText() : '--';
    boxColorInd.style.backgroundColor = box ? box.getCSSColor() : 'transparent';
    boxColorInd.title         = box ? box.getColorName()  : '';
    countEl.textContent       = getActiveModule().getBoxCount();
}

// ========== Botões ==========
btnStartAR.addEventListener('click', () => {
    initThreeJS();
    startARSession();
});

btnNewBox.addEventListener('click', () => {
    if (!isContainerPlaced()) {
        showFeedback(
            'Posicione o ' + (currentMode === 'cubagem' ? 'palete' : 'caminhão') + ' primeiro!',
            'error'
        );
        return;
    }
    const module = getActiveModule();
    const box = module.generateNewBox();
    updateHUD(box);
    statusMsg.textContent = `Caixa ${box.getColorName()} (${box.getVolumeText()}) — aponte onde quer colocar e toque "Posicionar".`;
});

btnPlace.addEventListener('click', () => {
    const module = getActiveModule();

    // 1. Colocar o container (palete ou caçamba)
    if (!isContainerPlaced()) {
        const pos = hitTestManager.getHitPosition();
        if (!pos) { showFeedback('Nenhuma superfície detectada!', 'error'); return; }

        if (currentMode === 'cubagem') {
            cubagemModule.placePallet(pos);
            statusMsg.textContent = 'Palete posicionado! Gere uma nova caixa.';
            showFeedback('Palete posicionado!', 'success');
        } else {
            pickingModule.placeTruck(pos);
            statusMsg.textContent = 'Caçamba posicionada! Gere uma nova caixa.';
            showFeedback('Caçamba posicionada!', 'success');
        }
        return;
    }

    // 2. Empilhar caixa
    if (!module.currentBox) {
        showFeedback('Gere uma nova caixa primeiro!', 'error');
        return;
    }

    const result = module.placeBox();
    if (result.success) {
        showFeedback(result.message, 'success');
        updateHUD(null);
        statusMsg.textContent = 'Caixa posicionada! Gere outra.';
    } else {
        showFeedback(result.message, 'error');
    }
    countEl.textContent = module.getBoxCount();
});

btnMode.addEventListener('click', () => {
    if (currentMode === 'cubagem') {
        currentMode = 'picking';
        cubagemModule.deactivate();
        pickingModule.activate();
        btnMode.textContent = 'Modo: Cubagem';
        currentModeEl.textContent = 'Picking';
    } else {
        currentMode = 'cubagem';
        pickingModule.deactivate();
        cubagemModule.activate();
        btnMode.textContent = 'Modo: Picking';
        currentModeEl.textContent = 'Cubagem';
    }
    updateHUD(null);
    statusMsg.textContent = isContainerPlaced()
        ? 'Gere uma nova caixa.'
        : 'Aponte para uma superfície e toque "Posicionar".';
});

btnReset.addEventListener('click', () => {
    cubagemModule.reset();
    pickingModule.reset();
    updateHUD(null);
    statusMsg.textContent = 'Resetado! Aponte para uma superfície.';
    showFeedback('Tudo resetado!', 'success');
});

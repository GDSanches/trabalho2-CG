import * as THREE from 'three';
import { HitTestManager } from './hitTest.js';
import { CubagemModule } from './cubagem.js';
import { PickingModule } from './picking.js';

// ========== Estado da Aplicação ==========
let renderer, scene, camera;
let hitTestManager;
let cubagemModule, pickingModule;
let currentMode = 'cubagem'; // 'cubagem' ou 'picking'
let xrSession = null;
let referenceSpace = null;

// ========== Elementos do DOM ==========
const overlay = document.getElementById('overlay');
const btnStartAR = document.getElementById('btn-start-ar');
const btnNewBox = document.getElementById('btn-new-box');
const btnPlace = document.getElementById('btn-place');
const btnMode = document.getElementById('btn-mode');
const btnReset = document.getElementById('btn-reset');
const hud = document.getElementById('hud');
const controls = document.getElementById('controls');
const statusMsg = document.getElementById('status-msg');
const boxDims = document.getElementById('box-dims');
const boxVol = document.getElementById('box-vol');
const boxColorIndicator = document.getElementById('box-color-indicator');
const countEl = document.getElementById('count');
const currentModeEl = document.getElementById('current-mode');
const feedbackEl = document.getElementById('feedback');

// ========== Inicialização Three.js ==========
function initThreeJS() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Iluminação
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0.5, 1, 0.5);
    scene.add(directionalLight);

    // Módulos
    hitTestManager = new HitTestManager(renderer, scene);
    cubagemModule = new CubagemModule(scene);
    pickingModule = new PickingModule(scene);

    // Ativa módulo inicial
    cubagemModule.activate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ========== WebXR ==========
async function startARSession() {
    if (!navigator.xr) {
        showFeedback('WebXR não suportado neste navegador!', 'error');
        return;
    }

    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
        showFeedback('Sessão AR não suportada neste dispositivo!', 'error');
        return;
    }

    try {
        xrSession = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: overlay }
        });

        renderer.xr.setReferenceSpaceType('local');
        await renderer.xr.setSession(xrSession);

        referenceSpace = await xrSession.requestReferenceSpace('local');

        // Solicitar hit test source
        await hitTestManager.requestHitTestSource(xrSession, referenceSpace);

        // UI
        btnStartAR.classList.add('hidden');
        hud.classList.remove('hidden');
        controls.classList.remove('hidden');
        statusMsg.textContent = 'Aponte para uma superfície plana';

        // Iniciar loop de renderização
        renderer.setAnimationLoop(onXRFrame);

        xrSession.addEventListener('end', onSessionEnd);
    } catch (err) {
        showFeedback(`Erro ao iniciar AR: ${err.message}`, 'error');
    }
}

function onSessionEnd() {
    xrSession = null;
    referenceSpace = null;
    btnStartAR.classList.remove('hidden');
    hud.classList.add('hidden');
    controls.classList.add('hidden');
    statusMsg.textContent = 'Sessão AR encerrada. Toque para reiniciar.';
    renderer.setAnimationLoop(null);
}

function onXRFrame(timestamp, frame) {
    if (!frame) return;

    const session = frame.session;
    const refSpace = renderer.xr.getReferenceSpace();

    // Atualizar hit test
    hitTestManager.update(frame, refSpace);

    // Atualizar status
    if (hitTestManager.isHitDetected()) {
        const activeModule = getActiveModule();
        const isPlaced = currentMode === 'cubagem'
            ? cubagemModule.isPalletPlaced()
            : pickingModule.isTruckPlaced();

        if (!isPlaced) {
            statusMsg.textContent = 'Superfície detectada! Toque "Posicionar" para colocar ' +
                (currentMode === 'cubagem' ? 'o palete' : 'a caçamba');
        }
    } else {
        const isPlaced = currentMode === 'cubagem'
            ? cubagemModule.isPalletPlaced()
            : pickingModule.isTruckPlaced();
        if (!isPlaced) {
            statusMsg.textContent = 'Aponte para uma superfície plana...';
        }
    }

    renderer.render(scene, camera);
}

// ========== Módulo Ativo ==========
function getActiveModule() {
    return currentMode === 'cubagem' ? cubagemModule : pickingModule;
}

function isContainerPlaced() {
    return currentMode === 'cubagem'
        ? cubagemModule.isPalletPlaced()
        : pickingModule.isTruckPlaced();
}

// ========== Feedback Visual ==========
function showFeedback(message, type = 'success') {
    feedbackEl.textContent = message;
    feedbackEl.className = type;
    feedbackEl.classList.remove('hidden');

    // Reiniciar animação
    feedbackEl.style.animation = 'none';
    feedbackEl.offsetHeight; // trigger reflow
    feedbackEl.style.animation = '';

    setTimeout(() => {
        feedbackEl.classList.add('hidden');
    }, 2000);
}

// ========== Atualizar HUD ==========
function updateHUD(box) {
    if (box) {
        boxDims.textContent = box.getDimsText();
        boxVol.textContent = box.getVolumeText();
        boxColorIndicator.style.backgroundColor = box.getCSSColor();
        boxColorIndicator.title = box.getColorName();
    } else {
        boxDims.textContent = '--';
        boxVol.textContent = '--';
        boxColorIndicator.style.backgroundColor = 'transparent';
    }

    const module = getActiveModule();
    countEl.textContent = module.getBoxCount();
}

// ========== Event Handlers ==========
btnStartAR.addEventListener('click', () => {
    initThreeJS();
    startARSession();
});

btnNewBox.addEventListener('click', () => {
    if (!isContainerPlaced()) {
        showFeedback('Posicione o ' + (currentMode === 'cubagem' ? 'palete' : 'caminhão') + ' primeiro!', 'error');
        return;
    }

    const module = getActiveModule();
    const box = module.generateNewBox();
    updateHUD(box);
    statusMsg.textContent = `Caixa ${box.getColorName()} gerada! Toque na tela para mudar posição, ou "Posicionar" para empilhar.`;
});

btnPlace.addEventListener('click', () => {
    const module = getActiveModule();

    // Se o container ainda não foi colocado, posicionar com hit test
    if (!isContainerPlaced()) {
        const pos = hitTestManager.getHitPosition();
        if (!pos) {
            showFeedback('Nenhuma superfície detectada!', 'error');
            return;
        }

        if (currentMode === 'cubagem') {
            cubagemModule.placePallet(pos);
            statusMsg.textContent = 'Palete posicionado! Gere uma nova caixa.';
        } else {
            pickingModule.placeTruck(pos);
            statusMsg.textContent = 'Caçamba posicionada! Gere uma nova caixa.';
        }
        showFeedback(currentMode === 'cubagem' ? 'Palete posicionado!' : 'Caçamba posicionada!', 'success');
        return;
    }

    // Se há uma caixa ativa, tentar empilhar
    if (!module.currentBox) {
        showFeedback('Gere uma nova caixa primeiro!', 'error');
        return;
    }

    const result = module.placeBox();
    if (result.success) {
        showFeedback(result.message, 'success');
        updateHUD(null);
        statusMsg.textContent = 'Caixa posicionada! Gere outra ou mude de coluna.';
    } else {
        showFeedback(result.message, 'error');
    }

    countEl.textContent = module.getBoxCount();
});

// Toque na tela (fora dos botões) para ciclar coluna
document.addEventListener('click', (e) => {
    // Ignorar cliques nos botões
    if (e.target.closest('#controls') || e.target.closest('#btn-start-ar')) return;

    if (!isContainerPlaced()) return;

    const module = getActiveModule();
    if (!module.currentBox) return;

    const stackIdx = module.cycleStack();
    if (stackIdx !== undefined) {
        statusMsg.textContent = `Coluna ${stackIdx + 1} selecionada`;
    }
});

btnMode.addEventListener('click', () => {
    if (currentMode === 'cubagem') {
        currentMode = 'picking';
        cubagemModule.deactivate();
        pickingModule.activate();
        btnMode.textContent = 'Modo: Cubagem';
        currentModeEl.textContent = 'Picking';
        statusMsg.textContent = pickingModule.isTruckPlaced()
            ? 'Modo Picking ativo. Gere uma caixa.'
            : 'Modo Picking. Aponte para uma superfície e posicione a caçamba.';
    } else {
        currentMode = 'cubagem';
        pickingModule.deactivate();
        cubagemModule.activate();
        btnMode.textContent = 'Modo: Picking';
        currentModeEl.textContent = 'Cubagem';
        statusMsg.textContent = cubagemModule.isPalletPlaced()
            ? 'Modo Cubagem ativo. Gere uma caixa.'
            : 'Modo Cubagem. Aponte para uma superfície e posicione o palete.';
    }
    updateHUD(null);
});

btnReset.addEventListener('click', () => {
    cubagemModule.reset();
    pickingModule.reset();
    updateHUD(null);
    statusMsg.textContent = 'Resetado! Aponte para uma superfície.';
    showFeedback('Tudo resetado!', 'success');
});

import * as THREE from 'three';

// Limiares de volume (m³)
// Com dimensões 0.1–0.5m, volume varia de ~0.001 a ~0.125 m³
const VOLUME_HIGH = 0.05;  // X - acima = vermelho (caixas grandes)
const VOLUME_MID = 0.015;  // Y - entre Y e X = verde, abaixo = azul

// Faixa de dimensões (metros)
const DIM_MIN = 0.1;
const DIM_MAX = 0.5;

// Cores por categoria
export const BoxColor = {
    RED: 'red',
    GREEN: 'green',
    BLUE: 'blue'
};

const COLOR_MAP = {
    [BoxColor.RED]: 0xe74c3c,
    [BoxColor.GREEN]: 0x2ecc71,
    [BoxColor.BLUE]: 0x3498db
};

const COLOR_CSS = {
    [BoxColor.RED]: '#e74c3c',
    [BoxColor.GREEN]: '#2ecc71',
    [BoxColor.BLUE]: '#3498db'
};

function randomDim() {
    return DIM_MIN + Math.random() * (DIM_MAX - DIM_MIN);
}

function classifyVolume(volume) {
    if (volume > VOLUME_HIGH) return BoxColor.RED;
    if (volume > VOLUME_MID) return BoxColor.GREEN;
    return BoxColor.BLUE;
}

export class Box {
    constructor(width, height, depth) {
        this.width = width || randomDim();
        this.height = height || randomDim();
        this.depth = depth || randomDim();
        this.volume = this.width * this.height * this.depth;
        this.colorCategory = classifyVolume(this.volume);
        this.mesh = this._createMesh();
        this.mesh.userData.box = this;
    }

    _createMesh() {
        const geometry = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const material = new THREE.MeshStandardMaterial({
            color: COLOR_MAP[this.colorCategory],
            roughness: 0.4,
            metalness: 0.1,
            transparent: true,
            opacity: 0.85
        });
        const mesh = new THREE.Mesh(geometry, material);

        // Wireframe de borda para melhor visibilidade
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        mesh.add(wireframe);

        return mesh;
    }

    getDimsText() {
        return `${this.width.toFixed(2)} x ${this.height.toFixed(2)} x ${this.depth.toFixed(2)} m`;
    }

    getVolumeText() {
        return `Vol: ${this.volume.toFixed(3)} m³`;
    }

    getCSSColor() {
        return COLOR_CSS[this.colorCategory];
    }

    getColorName() {
        const names = {
            [BoxColor.RED]: 'Vermelha',
            [BoxColor.GREEN]: 'Verde',
            [BoxColor.BLUE]: 'Azul'
        };
        return names[this.colorCategory];
    }

    setPreviewMode(enabled) {
        this.mesh.material.opacity = enabled ? 0.5 : 0.85;
    }

    setErrorHighlight(enabled) {
        if (enabled) {
            this.mesh.material.emissive = new THREE.Color(0xff0000);
            this.mesh.material.emissiveIntensity = 0.5;
        } else {
            this.mesh.material.emissive = new THREE.Color(0x000000);
            this.mesh.material.emissiveIntensity = 0;
        }
    }

    // Destaque amarelo: caixa sendo mirada para remoção
    setRemovalHighlight(enabled) {
        if (enabled) {
            this.mesh.material.emissive = new THREE.Color(0xffaa00);
            this.mesh.material.emissiveIntensity = 0.6;
        } else {
            this.mesh.material.emissive = new THREE.Color(0x000000);
            this.mesh.material.emissiveIntensity = 0;
        }
    }

    static createRandom() {
        return new Box();
    }
}

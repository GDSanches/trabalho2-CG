import * as THREE from 'three';
import { Box } from './box.js';
import { canStack, getStackError } from './stacking.js';

export class PickingModule {
    constructor(scene) {
        this.scene = scene;
        this.truckGroup = null;
        this.truckPlaced = false;
        this.placedBoxes = [];   // { box, mesh } em coords locais
        this.currentBox = null;
        this.previewValid = false;
        this.boxCount = 0;
        this.active = false;

        // Dimensões internas da caçamba
        this.innerHalfX = 0.95;  // metade da largura útil
        this.innerHalfZ = 0.55;  // metade da profundidade útil
        this.floorY = 0.03;      // topo do piso
        this.maxHeight = 0.8;    // altura máxima da caçamba
    }

    activate() { this.active = true; }
    deactivate() { this.active = false; }

    placeTruck(position) {
        if (this.truckPlaced) return;

        this.truckGroup = new THREE.Group();
        this.truckGroup.position.copy(position);

        this._buildTruck();

        this.scene.add(this.truckGroup);
        this.truckPlaced = true;
    }

    _buildTruck() {
        const w = this.innerHalfX * 2;
        const d = this.innerHalfZ * 2;
        const h = this.maxHeight;
        const t = 0.03;

        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x778899,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide
        });
        const solidMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.9 });

        // Piso
        const floor = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), solidMat);
        floor.position.y = t / 2;
        this.truckGroup.add(floor);

        // Paredes (semitransparentes para ver as caixas dentro)
        const makeWall = (geoArgs, pos) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...geoArgs), wallMat.clone());
            mesh.position.set(...pos);
            this.truckGroup.add(mesh);
        };
        makeWall([t, h, d], [-this.innerHalfX - t / 2, h / 2, 0]);  // esquerda
        makeWall([t, h, d], [this.innerHalfX + t / 2, h / 2, 0]);   // direita
        makeWall([w + t * 2, h, t], [0, h / 2, -this.innerHalfZ - t / 2]); // fundo

        // Wireframe externo
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w + t * 2, h, d + t));
        const wire = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0xffffff })
        );
        wire.position.y = h / 2;
        this.truckGroup.add(wire);

        // Borda do piso (área disponível)
        const floorEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.001, d));
        const floorBorder = new THREE.LineSegments(
            floorEdges,
            new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 })
        );
        floorBorder.position.y = this.floorY;
        this.truckGroup.add(floorBorder);
    }

    generateNewBox() {
        this._removeCurrentBox();
        this.currentBox = Box.createRandom();
        this.currentBox.setPreviewMode(true);
        this.previewValid = false;
        return this.currentBox;
    }

    updatePreviewFromWorld(worldPos) {
        if (!this.currentBox || !this.truckPlaced) return;
        const localPos = this.truckGroup.worldToLocal(worldPos.clone());
        this._updatePreview(localPos.x, localPos.z);
    }

    _updatePreview(localX, localZ) {
        const box = this.currentBox;
        const hw = box.width / 2;
        const hd = box.depth / 2;

        // Limitar dentro da caçamba
        const x = Math.max(-this.innerHalfX + hw, Math.min(this.innerHalfX - hw, localX));
        const z = Math.max(-this.innerHalfZ + hd, Math.min(this.innerHalfZ - hd, localZ));

        const { topBox, stackY } = this._findTopAt(x, z, box);

        // Verificar altura máxima
        const boxTop = stackY + box.height / 2;
        const exceedsHeight = boxTop > this.maxHeight;

        box.mesh.position.set(x, stackY, z);

        const colorOk = canStack(box, topBox);
        const valid = colorOk && !exceedsHeight;
        this.previewValid = valid;
        box.setErrorHighlight(!valid);

        if (!box.mesh.parent) {
            this.truckGroup.add(box.mesh);
        }
    }

    _findTopAt(x, z, newBox) {
        let topBox = null;
        let topSurface = this.floorY;

        for (const { box, mesh } of this.placedBoxes) {
            const dx = Math.abs(mesh.position.x - x);
            const dz = Math.abs(mesh.position.z - z);
            const overlapX = (box.width + newBox.width) / 2;
            const overlapZ = (box.depth + newBox.depth) / 2;

            if (dx < overlapX && dz < overlapZ) {
                const boxTop = mesh.position.y + box.height / 2;
                if (boxTop > topSurface) {
                    topSurface = boxTop;
                    topBox = box;
                }
            }
        }

        return { topBox, stackY: topSurface + newBox.height / 2 };
    }

    placeBox() {
        if (!this.currentBox || !this.truckPlaced) {
            return { success: false, message: 'Gere uma caixa primeiro!' };
        }

        if (!this.previewValid) {
            const pos = this.currentBox.mesh.position;
            const { topBox } = this._findTopAt(pos.x, pos.z, this.currentBox);
            const colorError = getStackError(this.currentBox, topBox);
            const exceedsHeight = (pos.y + this.currentBox.height / 2) > this.maxHeight;

            if (exceedsHeight) {
                return { success: false, message: 'Caixa excede a altura da caçamba!' };
            }
            return { success: false, message: colorError || 'Posicionamento inválido!' };
        }

        this.currentBox.setPreviewMode(false);
        this.currentBox.setErrorHighlight(false);

        this.placedBoxes.push({ box: this.currentBox, mesh: this.currentBox.mesh });
        this.boxCount++;
        this.currentBox = null;

        return { success: true, message: `Caixa carregada! (Total: ${this.boxCount})` };
    }

    _removeCurrentBox() {
        if (this.currentBox && this.currentBox.mesh.parent) {
            this.currentBox.mesh.parent.remove(this.currentBox.mesh);
        }
        this.currentBox = null;
    }

    reset() {
        this._removeCurrentBox();
        if (this.truckGroup) {
            this.scene.remove(this.truckGroup);
            this.truckGroup = null;
        }
        this.truckPlaced = false;
        this.placedBoxes = [];
        this.boxCount = 0;
        this.previewValid = false;
    }

    isTruckPlaced() { return this.truckPlaced; }
    getBoxCount() { return this.boxCount; }
}

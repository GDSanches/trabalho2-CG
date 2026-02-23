import * as THREE from 'three';
import { Box } from './box.js';
import { canStack, getStackError } from './stacking.js';

export class CubagemModule {
    constructor(scene) {
        this.scene = scene;
        this.palletGroup = null;
        this.palletPlaced = false;
        this.placedBoxes = [];   // { box, mesh } com posições em coords locais
        this.currentBox = null;
        this.previewValid = false;
        this.boxCount = 0;
        this.active = false;

        // Limites do palete (metades, em coords locais)
        this.boundsHalfX = 0.6;
        this.boundsHalfZ = 0.5;
        this.floorY = 0.05; // topo da superfície do palete
    }

    activate() { this.active = true; }
    deactivate() { this.active = false; }

    placePallet(position) {
        if (this.palletPlaced) return;

        this.palletGroup = new THREE.Group();
        this.palletGroup.position.copy(position);

        // Plataforma do palete
        const palletMesh = new THREE.Mesh(
            new THREE.BoxGeometry(this.boundsHalfX * 2, 0.05, this.boundsHalfZ * 2),
            new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.8 })
        );
        palletMesh.position.y = 0.025;
        this.palletGroup.add(palletMesh);

        // Borda indicativa da área livre
        const borderEdges = new THREE.EdgesGeometry(
            new THREE.BoxGeometry(this.boundsHalfX * 2, 0.002, this.boundsHalfZ * 2)
        );
        const border = new THREE.LineSegments(
            borderEdges,
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
        );
        border.position.y = this.floorY;
        this.palletGroup.add(border);

        this.scene.add(this.palletGroup);
        this.palletPlaced = true;
    }

    generateNewBox() {
        this._removeCurrentBox();
        this.currentBox = Box.createRandom();
        this.currentBox.setPreviewMode(true);
        this.previewValid = false;
        return this.currentBox;
    }

    /**
     * Atualiza a posição do preview a partir de uma posição no mundo (do hit test).
     * Chamado a cada frame no loop de renderização.
     */
    updatePreviewFromWorld(worldPos) {
        if (!this.currentBox || !this.palletPlaced) return;
        const localPos = this.palletGroup.worldToLocal(worldPos.clone());
        this._updatePreview(localPos.x, localPos.z);
    }

    _updatePreview(localX, localZ) {
        const box = this.currentBox;
        const hw = box.width / 2;
        const hd = box.depth / 2;

        // Limitar dentro dos limites do palete
        const x = Math.max(-this.boundsHalfX + hw, Math.min(this.boundsHalfX - hw, localX));
        const z = Math.max(-this.boundsHalfZ + hd, Math.min(this.boundsHalfZ - hd, localZ));

        const { topBox, stackY } = this._findTopAt(x, z, box);

        box.mesh.position.set(x, stackY, z);

        const valid = canStack(box, topBox);
        this.previewValid = valid;
        box.setErrorHighlight(!valid);

        if (!box.mesh.parent) {
            this.palletGroup.add(box.mesh);
        }
    }

    /**
     * Encontra a caixa mais alta cuja projeção XZ sobrepõe a posição (x, z) para newBox.
     * Retorna { topBox, stackY } onde stackY é o centro Y da nova caixa.
     */
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
        if (!this.currentBox || !this.palletPlaced) {
            return { success: false, message: 'Gere uma caixa primeiro!' };
        }

        if (!this.previewValid) {
            const pos = this.currentBox.mesh.position;
            const { topBox } = this._findTopAt(pos.x, pos.z, this.currentBox);
            const error = getStackError(this.currentBox, topBox);
            return { success: false, message: error || 'Posicionamento inválido!' };
        }

        this.currentBox.setPreviewMode(false);
        this.currentBox.setErrorHighlight(false);

        this.placedBoxes.push({ box: this.currentBox, mesh: this.currentBox.mesh });
        this.boxCount++;
        this.currentBox = null;

        return { success: true, message: `Caixa empilhada! (Total: ${this.boxCount})` };
    }

    // Retorna todos os meshes de caixas já posicionadas (para raycasting externo)
    getAllMeshes() {
        return this.placedBoxes.map(e => e.mesh);
    }

    // Verifica se alguma caixa está apoiada sobre targetMesh
    _hasBoxOnTop(targetEntry) {
        const { box: targetBox, mesh: targetMesh } = targetEntry;
        for (const { box, mesh } of this.placedBoxes) {
            if (mesh === targetMesh) continue;
            if (mesh.position.y <= targetMesh.position.y) continue; // não está acima

            const dx = Math.abs(mesh.position.x - targetMesh.position.x);
            const dz = Math.abs(mesh.position.z - targetMesh.position.z);
            const overlapX = (box.width + targetBox.width) / 2;
            const overlapZ = (box.depth + targetBox.depth) / 2;

            if (dx < overlapX && dz < overlapZ) return true;
        }
        return false;
    }

    // Retira a caixa do estado "posicionada" e a torna móvel novamente como currentBox.
    repositionBox(targetMesh) {
        const entry = this.placedBoxes.find(e => e.mesh === targetMesh);
        if (!entry) return { success: false, message: 'Caixa não encontrada.' };

        if (this._hasBoxOnTop(entry)) {
            return {
                success: false,
                message: 'Não é possível reposicionar! Há uma caixa por cima. Mova-a primeiro.'
            };
        }

        // Cancelar caixa em mão, se houver
        this._removeCurrentBox();

        this.placedBoxes = this.placedBoxes.filter(e => e.mesh !== targetMesh);
        this.boxCount--;

        // A caixa volta a ser o currentBox, permanece no grupo para o preview seguir o hit test
        entry.box.setPreviewMode(true);
        entry.box.setRemovalHighlight(false);
        this.currentBox = entry.box;
        this.previewValid = false;

        return { success: true, message: `Caixa ${entry.box.getColorName()} pronta para reposicionar!` };
    }

    _removeCurrentBox() {
        if (this.currentBox && this.currentBox.mesh.parent) {
            this.currentBox.mesh.parent.remove(this.currentBox.mesh);
        }
        this.currentBox = null;
    }

    reset() {
        this._removeCurrentBox();
        if (this.palletGroup) {
            this.scene.remove(this.palletGroup);
            this.palletGroup = null;
        }
        this.palletPlaced = false;
        this.placedBoxes = [];
        this.boxCount = 0;
        this.previewValid = false;
    }

    isPalletPlaced() { return this.palletPlaced; }
    getBoxCount() { return this.boxCount; }
}

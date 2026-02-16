import * as THREE from 'three';
import { Box } from './box.js';
import { canStack, getStackError, getStackY, getTopBox } from './stacking.js';

export class CubagemModule {
    constructor(scene) {
        this.scene = scene;
        this.palletGroup = null;     // Grupo do palete posicionado
        this.palletPlaced = false;
        this.stacks = [];            // Array de colunas: cada coluna é um array de Box
        this.currentBox = null;
        this.previewMesh = null;
        this.boxCount = 0;
        this.active = false;
        this.selectedStackIndex = 0; // Coluna selecionada para empilhar
    }

    activate() {
        this.active = true;
    }

    deactivate() {
        this.active = false;
        this._removePreview();
    }

    /**
     * Posiciona o palete virtual na posição detectada pelo hit test.
     */
    placePallet(position) {
        if (this.palletPlaced) return;

        this.palletGroup = new THREE.Group();
        this.palletGroup.position.copy(position);

        // Visual do palete: plataforma de madeira
        const palletGeo = new THREE.BoxGeometry(1.2, 0.05, 1.0);
        const palletMat = new THREE.MeshStandardMaterial({
            color: 0xdeb887,
            roughness: 0.8
        });
        const palletMesh = new THREE.Mesh(palletGeo, palletMat);
        palletMesh.position.y = 0.025;
        this.palletGroup.add(palletMesh);

        // Linhas de grade para indicar posições de empilhamento
        const gridPositions = this._getStackPositions();
        gridPositions.forEach((pos, i) => {
            const marker = new THREE.Mesh(
                new THREE.PlaneGeometry(0.35, 0.35),
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.2,
                    side: THREE.DoubleSide
                })
            );
            marker.rotation.x = -Math.PI / 2;
            marker.position.set(pos.x, 0.055, pos.z);
            this.palletGroup.add(marker);

            // Inicializa pilha vazia para cada posição
            this.stacks.push([]);
        });

        this.scene.add(this.palletGroup);
        this.palletPlaced = true;
    }

    /**
     * Retorna posições de empilhamento no palete (grade 3x2).
     */
    _getStackPositions() {
        const positions = [];
        const cols = 3;
        const rows = 2;
        const spacingX = 0.38;
        const spacingZ = 0.42;
        const offsetX = -(cols - 1) * spacingX / 2;
        const offsetZ = -(rows - 1) * spacingZ / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                positions.push({
                    x: offsetX + c * spacingX,
                    z: offsetZ + r * spacingZ
                });
            }
        }
        return positions;
    }

    /**
     * Gera uma nova caixa aleatória e mostra como preview.
     */
    generateNewBox() {
        this._removePreview();
        this.currentBox = Box.createRandom();
        this.currentBox.setPreviewMode(true);

        // Posiciona o preview flutuando acima do palete
        if (this.palletPlaced) {
            this._showPreviewAtStack(this.selectedStackIndex);
        }

        return this.currentBox;
    }

    /**
     * Mostra preview da caixa na posição da coluna selecionada.
     */
    _showPreviewAtStack(stackIndex) {
        if (!this.currentBox || !this.palletPlaced) return;
        this._removePreview();

        const positions = this._getStackPositions();
        if (stackIndex >= positions.length) return;

        const pos = positions[stackIndex];
        const stack = this.stacks[stackIndex];
        const yPos = getStackY(this.currentBox, stack, 0.05);

        this.previewMesh = this.currentBox.mesh;
        this.previewMesh.position.set(pos.x, yPos, pos.z);
        this.palletGroup.add(this.previewMesh);

        // Verificar se pode empilhar e ajustar visual
        const topBox = getTopBox(stack);
        if (!canStack(this.currentBox, topBox)) {
            this.currentBox.setErrorHighlight(true);
        } else {
            this.currentBox.setErrorHighlight(false);
        }
    }

    /**
     * Remove o mesh de preview da cena.
     */
    _removePreview() {
        if (this.previewMesh && this.previewMesh.parent) {
            this.previewMesh.parent.remove(this.previewMesh);
        }
        this.previewMesh = null;
    }

    /**
     * Cicla a coluna selecionada e atualiza o preview.
     */
    cycleStack() {
        if (!this.palletPlaced) return;
        const total = this.stacks.length;
        this.selectedStackIndex = (this.selectedStackIndex + 1) % total;
        if (this.currentBox) {
            this._showPreviewAtStack(this.selectedStackIndex);
        }
        return this.selectedStackIndex;
    }

    /**
     * Tenta posicionar a caixa atual na coluna selecionada.
     * Retorna { success: boolean, message: string }
     */
    placeBox() {
        if (!this.currentBox || !this.palletPlaced) {
            return { success: false, message: 'Gere uma caixa primeiro!' };
        }

        const stack = this.stacks[this.selectedStackIndex];
        const topBox = getTopBox(stack);
        const error = getStackError(this.currentBox, topBox);

        if (error) {
            return { success: false, message: error };
        }

        // Posiciona definitivamente
        this.currentBox.setPreviewMode(false);
        this.currentBox.setErrorHighlight(false);

        const positions = this._getStackPositions();
        const pos = positions[this.selectedStackIndex];
        const yPos = getStackY(this.currentBox, stack, 0.05);

        this.currentBox.mesh.position.set(pos.x, yPos, pos.z);

        // Se o mesh já está no palletGroup pelo preview, ótimo; senão adiciona
        if (!this.currentBox.mesh.parent || this.currentBox.mesh.parent !== this.palletGroup) {
            this.palletGroup.add(this.currentBox.mesh);
        }

        stack.push(this.currentBox);
        this.boxCount++;
        this.currentBox = null;
        this.previewMesh = null;

        return {
            success: true,
            message: `Caixa empilhada! (Coluna ${this.selectedStackIndex + 1}, Total: ${this.boxCount})`
        };
    }

    /**
     * Reseta todo o módulo de cubagem.
     */
    reset() {
        if (this.palletGroup) {
            this.scene.remove(this.palletGroup);
            this.palletGroup = null;
        }
        this.palletPlaced = false;
        this.stacks = [];
        this.currentBox = null;
        this.previewMesh = null;
        this.boxCount = 0;
        this.selectedStackIndex = 0;
    }

    getBoxCount() {
        return this.boxCount;
    }

    isPalletPlaced() {
        return this.palletPlaced;
    }
}

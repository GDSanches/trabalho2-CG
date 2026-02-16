import * as THREE from 'three';
import { Box } from './box.js';
import { canStack, getStackError, getStackY, getTopBox } from './stacking.js';

export class PickingModule {
    constructor(scene) {
        this.scene = scene;
        this.truckGroup = null;      // Grupo da caçamba
        this.truckPlaced = false;
        this.stacks = [];            // Colunas dentro da caçamba
        this.currentBox = null;
        this.previewMesh = null;
        this.boxCount = 0;
        this.active = false;
        this.selectedStackIndex = 0;

        // Dimensões da caçamba (metros)
        this.truckWidth = 2.0;
        this.truckDepth = 1.2;
        this.truckHeight = 0.8;
        this.truckWallThickness = 0.03;
    }

    activate() {
        this.active = true;
    }

    deactivate() {
        this.active = false;
        this._removePreview();
    }

    /**
     * Posiciona a caçamba do caminhão na posição detectada.
     */
    placeTruck(position) {
        if (this.truckPlaced) return;

        this.truckGroup = new THREE.Group();
        this.truckGroup.position.copy(position);

        this._buildTruckGeometry();
        this._initStackPositions();

        this.scene.add(this.truckGroup);
        this.truckPlaced = true;
    }

    /**
     * Constrói a geometria wireframe da caçamba.
     */
    _buildTruckGeometry() {
        const w = this.truckWidth;
        const h = this.truckHeight;
        const d = this.truckDepth;
        const t = this.truckWallThickness;

        // Piso da caçamba
        const floor = new THREE.Mesh(
            new THREE.BoxGeometry(w, t, d),
            new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 })
        );
        floor.position.y = t / 2;
        this.truckGroup.add(floor);

        // Paredes laterais (wireframe colorido)
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });

        // Parede esquerda
        const wallL = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), wallMat);
        wallL.position.set(-w / 2, h / 2, 0);
        this.truckGroup.add(wallL);

        // Parede direita
        const wallR = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), wallMat.clone());
        wallR.position.set(w / 2, h / 2, 0);
        this.truckGroup.add(wallR);

        // Parede traseira
        const wallB = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), wallMat.clone());
        wallB.position.set(0, h / 2, -d / 2);
        this.truckGroup.add(wallB);

        // Parede frontal (aberta - apenas wireframe)
        const frontEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, t));
        const frontLine = new THREE.LineSegments(
            frontEdges,
            new THREE.LineBasicMaterial({ color: 0xffff00 })
        );
        frontLine.position.set(0, h / 2, d / 2);
        this.truckGroup.add(frontLine);

        // Wireframe geral da caçamba
        const boxGeo = new THREE.BoxGeometry(w, h, d);
        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        wireframe.position.y = h / 2;
        this.truckGroup.add(wireframe);
    }

    /**
     * Inicializa posições de empilhamento na caçamba (grade 4x2).
     */
    _initStackPositions() {
        const cols = 4;
        const rows = 2;
        const spacingX = this.truckWidth / (cols + 1);
        const spacingZ = this.truckDepth / (rows + 1);
        const offsetX = -this.truckWidth / 2 + spacingX;
        const offsetZ = -this.truckDepth / 2 + spacingZ;

        this._stackPositions = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this._stackPositions.push({
                    x: offsetX + c * spacingX,
                    z: offsetZ + r * spacingZ
                });
                this.stacks.push([]);
            }
        }

        // Marcadores visuais de posição
        this._stackPositions.forEach(pos => {
            const marker = new THREE.Mesh(
                new THREE.PlaneGeometry(0.3, 0.3),
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.15,
                    side: THREE.DoubleSide
                })
            );
            marker.rotation.x = -Math.PI / 2;
            marker.position.set(pos.x, this.truckWallThickness + 0.001, pos.z);
            this.truckGroup.add(marker);
        });
    }

    /**
     * Gera nova caixa aleatória.
     */
    generateNewBox() {
        this._removePreview();
        this.currentBox = Box.createRandom();
        this.currentBox.setPreviewMode(true);

        if (this.truckPlaced) {
            this._showPreviewAtStack(this.selectedStackIndex);
        }

        return this.currentBox;
    }

    _showPreviewAtStack(stackIndex) {
        if (!this.currentBox || !this.truckPlaced) return;
        this._removePreview();

        if (stackIndex >= this._stackPositions.length) return;

        const pos = this._stackPositions[stackIndex];
        const stack = this.stacks[stackIndex];
        const yPos = getStackY(this.currentBox, stack, this.truckWallThickness);

        this.previewMesh = this.currentBox.mesh;
        this.previewMesh.position.set(pos.x, yPos, pos.z);
        this.truckGroup.add(this.previewMesh);

        // Verificar empilhamento + verificar se excede a altura da caçamba
        const topBox = getTopBox(stack);
        const exceedsHeight = (yPos + this.currentBox.height / 2) > this.truckHeight;

        if (!canStack(this.currentBox, topBox) || exceedsHeight) {
            this.currentBox.setErrorHighlight(true);
        } else {
            this.currentBox.setErrorHighlight(false);
        }
    }

    _removePreview() {
        if (this.previewMesh && this.previewMesh.parent) {
            this.previewMesh.parent.remove(this.previewMesh);
        }
        this.previewMesh = null;
    }

    cycleStack() {
        if (!this.truckPlaced) return;
        const total = this.stacks.length;
        this.selectedStackIndex = (this.selectedStackIndex + 1) % total;
        if (this.currentBox) {
            this._showPreviewAtStack(this.selectedStackIndex);
        }
        return this.selectedStackIndex;
    }

    /**
     * Tenta posicionar a caixa na caçamba.
     */
    placeBox() {
        if (!this.currentBox || !this.truckPlaced) {
            return { success: false, message: 'Gere uma caixa primeiro!' };
        }

        const stack = this.stacks[this.selectedStackIndex];
        const topBox = getTopBox(stack);

        // Verificar regra de cor
        const colorError = getStackError(this.currentBox, topBox);
        if (colorError) {
            return { success: false, message: colorError };
        }

        // Verificar altura da caçamba
        const yPos = getStackY(this.currentBox, stack, this.truckWallThickness);
        if ((yPos + this.currentBox.height / 2) > this.truckHeight) {
            return {
                success: false,
                message: 'Caixa excede a altura da caçamba! Escolha outra coluna.'
            };
        }

        // Posicionar definitivamente
        this.currentBox.setPreviewMode(false);
        this.currentBox.setErrorHighlight(false);

        const pos = this._stackPositions[this.selectedStackIndex];
        this.currentBox.mesh.position.set(pos.x, yPos, pos.z);

        if (!this.currentBox.mesh.parent || this.currentBox.mesh.parent !== this.truckGroup) {
            this.truckGroup.add(this.currentBox.mesh);
        }

        stack.push(this.currentBox);
        this.boxCount++;
        this.currentBox = null;
        this.previewMesh = null;

        return {
            success: true,
            message: `Caixa carregada! (Posição ${this.selectedStackIndex + 1}, Total: ${this.boxCount})`
        };
    }

    reset() {
        if (this.truckGroup) {
            this.scene.remove(this.truckGroup);
            this.truckGroup = null;
        }
        this.truckPlaced = false;
        this.stacks = [];
        this._stackPositions = [];
        this.currentBox = null;
        this.previewMesh = null;
        this.boxCount = 0;
        this.selectedStackIndex = 0;
    }

    getBoxCount() {
        return this.boxCount;
    }

    isTruckPlaced() {
        return this.truckPlaced;
    }
}

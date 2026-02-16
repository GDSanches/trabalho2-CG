import * as THREE from 'three';

export class HitTestManager {
    constructor(renderer, scene) {
        this.renderer = renderer;
        this.scene = scene;
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        this.hitPose = null;
        this.reticle = this._createReticle();
        this.scene.add(this.reticle);
    }

    _createReticle() {
        const ring = new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        const reticle = new THREE.Mesh(ring, material);
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        return reticle;
    }

    async requestHitTestSource(session, referenceSpace) {
        if (this.hitTestSourceRequested) return;
        this.hitTestSourceRequested = true;

        const viewerSpace = await session.requestReferenceSpace('viewer');
        this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

        session.addEventListener('end', () => {
            this.hitTestSource = null;
            this.hitTestSourceRequested = false;
            this.reticle.visible = false;
        });
    }

    update(frame, referenceSpace) {
        this.hitPose = null;

        if (!this.hitTestSource) return;

        const results = frame.getHitTestResults(this.hitTestSource);

        if (results.length > 0) {
            const hit = results[0];
            const pose = hit.getPose(referenceSpace);

            if (pose) {
                this.reticle.visible = true;
                this.reticle.matrix.fromArray(pose.transform.matrix);
                this.hitPose = pose;
            }
        } else {
            this.reticle.visible = false;
        }
    }

    getHitPosition() {
        if (!this.hitPose) return null;
        const pos = this.hitPose.transform.position;
        return new THREE.Vector3(pos.x, pos.y, pos.z);
    }

    getHitMatrix() {
        if (!this.hitPose) return null;
        const matrix = new THREE.Matrix4();
        matrix.fromArray(this.hitPose.transform.matrix);
        return matrix;
    }

    isHitDetected() {
        return this.hitPose !== null;
    }

    dispose() {
        if (this.hitTestSource) {
            this.hitTestSource.cancel();
            this.hitTestSource = null;
        }
        this.scene.remove(this.reticle);
    }
}

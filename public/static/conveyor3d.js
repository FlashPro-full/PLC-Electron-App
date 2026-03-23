import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

class ConveyorSystem3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            return;
        }
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.conveyorBelt = null;
        this.pushers = [];
        this.buckets = [];
        this.items = [];
        this.itemsByBarcode = {};
        this.scanner = null;
        this.photoEye = null;
        this.photoEyeDetectionZone = null;
        this.animationId = null;
        this.conveyorSpeed = 0.02;
        this.beltSpeedCmPerSec = 32.1;
        this.settings = null;
        this.positionIdToZ = this.calculatePositionMapping();
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.positionIdToCm = {};
        this.calculatePositionIdToCm();
        
        try {
            fetch('/get-settings')
                .then(response => response.json())
                .then(settings => {
                    this.settings = settings;
                    const speed = Number(settings?.belt_speed);
                    this.beltSpeedCmPerSec = (speed > 0) ? speed : 32.1;
                    this.init();
                    this.animate();
                    this.setupEventListeners();
                    this.positionIdToZ = this.calculatePositionMapping();
                    this.updatePusherPositions();
                    this.updateCameraForConveyor();
                })
                .catch(() => {
                    this.init();
                    this.animate();
                    this.setupEventListeners();
                });
        } catch (error) {
            if (this.container) {
                this.container.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #fff; background: #ff4444; border-radius: 8px;">
                        <h3>❌ 3D Visualization Error</h3>
                        <p>${error.message}</p>
                        <p style="font-size: 0.8em; margin-top: 10px;">Check browser console (F12) for details</p>
                    </div>
                `;
            }
        }
    }

    init() {
        if (!this.isWebGLSupported()) {
            this.container.innerHTML = '<div style="padding: 20px; text-align: center; color: #fff;">❌ WebGL is not supported in your browser. Please use a modern browser like Chrome, Firefox, or Edge.</div>';
            return;
        }

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xe8e8e8);

        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;
        const aspect = width / height;
        
        let maxPusherDistance = 972;
        if (this.settings) {
            const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
            maxPusherDistance = Math.max(...distances, 972);
        }
        const startBuffer = 200;
        const endBuffer = 200;
        const conveyorLength = startBuffer + maxPusherDistance + endBuffer;
        const conveyorWidth = 80;
        
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 5000);
        
        const conveyorHalfLength = conveyorLength / 2;
        const conveyorHalfWidth = conveyorWidth / 2;
        
        const cameraHeight = Math.max(conveyorWidth * 2, 200);
        const cameraDistance = Math.max(conveyorHalfWidth * 3, 150);
        
        this.camera.position.set(
            cameraDistance,
            cameraHeight,
            0
        );
        
        this.camera.lookAt(0, 0, 0);

        const loadingDiv = document.getElementById('conveyor3d-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }

        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: false });
            const width = this.container.clientWidth || 800;
            const height = this.container.clientHeight || 600;
            this.renderer.setSize(width, height);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.BasicShadowMap;
            this.container.appendChild(this.renderer.domElement);
        } catch (error) {
            this.container.innerHTML = '<div style="padding: 20px; text-align: center; color: #fff;">❌ Failed to initialize 3D renderer. Check browser console for details.</div>';
            return;
        }

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        this.controls.minDistance = Math.max(conveyorHalfLength * 0.5, 200);
        this.controls.maxDistance = Math.max(conveyorHalfLength * 3, 2000);
        
        this.controls.minPolarAngle = Math.PI / 12;
        this.controls.maxPolarAngle = Math.PI - Math.PI / 12;
        
        this.controls.enablePan = true;
        this.controls.panSpeed = 0.8;
        this.controls.rotateSpeed = 0.5;
        
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
        directionalLight.position.set(0, 700, 0);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.left = -800;
        directionalLight.shadow.camera.right = 800;
        directionalLight.shadow.camera.top = 800;
        directionalLight.shadow.camera.bottom = -800;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 2000;
        this.scene.add(directionalLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-300, 400, 300);
        this.scene.add(fillLight);

        this.createWorkingRoom();

        this.createConveyorBelt();
        this.createBarcodeScanner();
        this.createPhotoEye();
        this.createPushers();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    createWorkingRoom() {
        const floorGeometry = new THREE.PlaneGeometry(3000, 3000);
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x9e9e9e,
            roughness: 0.9,
            metalness: 0.1
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        floor.receiveShadow = true;
        this.scene.add(floor);

        const backWallGeometry = new THREE.PlaneGeometry(3000, 800);
        const wallMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xd0d0d0,
            roughness: 0.8
        });
        const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        backWall.position.set(0, 400, -1500);
        backWall.receiveShadow = true;
        this.scene.add(backWall);

        const leftWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-1500, 400, 0);
        leftWall.receiveShadow = true;
        this.scene.add(leftWall);

        const rightWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(1500, 400, 0);
        rightWall.receiveShadow = true;
        this.scene.add(rightWall);

        const ceilingGeometry = new THREE.PlaneGeometry(3000, 3000);
        const ceilingMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xf5f5f5,
            roughness: 0.7
        });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 800;
        ceiling.receiveShadow = false;
        this.scene.add(ceiling);

        const gridHelper = new THREE.GridHelper(3000, 30, 0x888888, 0xaaaaaa);
        gridHelper.position.y = 0.1;
        this.scene.add(gridHelper);

        for (let i = -1200; i <= 1200; i += 400) {
            for (let j = -1200; j <= 1200; j += 400) {
                const lightGeometry = new THREE.BoxGeometry(60, 10, 60);
                const lightMaterial = new THREE.MeshStandardMaterial({ 
                    color: 0xffffff,
                    emissive: 0xffffff,
                    emissiveIntensity: 0.3
                });
                const lightFixture = new THREE.Mesh(lightGeometry, lightMaterial);
                lightFixture.position.set(i, 750, j);
                this.scene.add(lightFixture);

                const pointLight = new THREE.PointLight(0xffffff, 0.5, 500);
                pointLight.position.set(i, 750, j);
                this.scene.add(pointLight);
            }
        }
    }

    createConveyorBelt() {
        const group = new THREE.Group();
        
        let maxPusherDistance = 972;
        if (this.settings?.pushers) {
            const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
            maxPusherDistance = Math.max(...distances, 972);
        }
        
        const startBuffer = 200;
        const endBuffer = 200;
        const frameLength = startBuffer + maxPusherDistance + endBuffer;
        
        const frameWidth = 80;
        const frameHeight = 20;

        const railGeometry = new THREE.BoxGeometry(10, frameHeight, frameLength);
        const railMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        
        const leftRail = new THREE.Mesh(railGeometry, railMaterial);
        leftRail.position.set(-frameWidth/2, frameHeight/2, 0);
        leftRail.castShadow = true;
        group.add(leftRail);

        const rightRail = new THREE.Mesh(railGeometry, railMaterial);
        rightRail.position.set(frameWidth/2, frameHeight/2, 0);
        rightRail.castShadow = true;
        group.add(rightRail);
        
        group.position.y = 0;

        const beltGeometry = new THREE.PlaneGeometry(frameWidth - 20, frameLength);
        const beltMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });
        const belt = new THREE.Mesh(beltGeometry, beltMaterial);
        belt.rotation.x = -Math.PI / 2;
        belt.position.y = frameHeight;
        belt.receiveShadow = true;
        group.add(belt);

        const rollerCount = 40;
        const rollerSpacing = frameLength / rollerCount;
        const rollerGeometry = new THREE.CylinderGeometry(3, 3, frameWidth - 20, 16);
        const rollerMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
        
        for (let i = 0; i < rollerCount; i++) {
            const roller = new THREE.Mesh(rollerGeometry, rollerMaterial);
            roller.rotation.z = Math.PI / 2;
            roller.position.set(0, frameHeight - 3, -frameLength/2 + i * rollerSpacing);
            roller.castShadow = true;
            group.add(roller);
        }

        this.conveyorBelt = group;
        this.scene.add(group);
    }

    createBarcodeScanner() {
        const group = new THREE.Group();
        group.userData.name = "Barcode Scanner";
        
        const SCANNER_POSITION_CM = -50;
        
        let maxPusherDistance = 972;
        if (this.settings?.pushers) {
            const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
            maxPusherDistance = Math.max(...distances, 972);
        }
        const startBuffer = 200;
        const totalLength = startBuffer + maxPusherDistance + 200;
        const conveyorStart = -totalLength / 2;
        const scannerZ = this.cmToZPosition(SCANNER_POSITION_CM);
        
        const bodyGeometry = new THREE.BoxGeometry(40, 30, 35);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1a5490,
            emissive: 0x1a5490,
            emissiveIntensity: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.set(0, 60, scannerZ);
        body.castShadow = true;
        group.add(body);

        const lensGeometry = new THREE.BoxGeometry(20, 12, 3);
        const lensMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00,
            emissive: 0x00ff00,
            emissiveIntensity: 1.0
        });
        const lens = new THREE.Mesh(lensGeometry, lensMaterial);
        lens.position.set(0, 60, scannerZ + 18);
        group.add(lens);

        const bracketGeometry = new THREE.BoxGeometry(45, 8, 8);
        const bracketMaterial = new THREE.MeshStandardMaterial({ color: 0x7f8c8d });
        const bracket = new THREE.Mesh(bracketGeometry, bracketMaterial);
        bracket.position.set(0, 40, scannerZ);
        bracket.castShadow = true;
        group.add(bracket);

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffff00';
        context.fillRect(0, 0, 512, 128);
        context.fillStyle = '#000000';
        context.font = 'Bold 48px Arial';
        context.textAlign = 'center';
        context.fillText('SCANNER', 256, 75);
        const texture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.MeshStandardMaterial({ map: texture, transparent: true });
        const labelGeometry = new THREE.PlaneGeometry(40, 10);
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.set(0, 80, scannerZ);
        label.lookAt(this.camera.position);
        group.add(label);

        this.scanner = group;
        this.scene.add(group);
    }

    createPhotoEye() {
        if (this.photoEye) {
            this.scene.remove(this.photoEye);
        }
        
        const group = new THREE.Group();
        group.userData.name = "Photo Eye";
        group.userData.detectionActive = false;
        group.userData.lastDetectionTime = 0;
        
        const PHOTO_EYE_POSITION_CM = 0;
        
        let maxPusherDistance = 972;
        if (this.settings) {
            const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
            maxPusherDistance = Math.max(...distances, 972);
        }
        const photoEyeZ = this.cmToZPosition(PHOTO_EYE_POSITION_CM);
        
        const bodyGeometry = new THREE.CylinderGeometry(8, 8, 15, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xff6b35,
            emissive: 0xff6b35,
            emissiveIntensity: 0.6
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.rotation.z = Math.PI / 2;
        body.position.set(-35, 25, photoEyeZ);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);
        group.userData.emitter = body;

        const receiverGeometry = new THREE.CylinderGeometry(8, 8, 15, 16);
        const receiver = new THREE.Mesh(receiverGeometry, bodyMaterial);
        receiver.rotation.z = Math.PI / 2;
        receiver.position.set(35, 25, photoEyeZ);
        receiver.castShadow = true;
        receiver.receiveShadow = true;
        group.add(receiver);
        group.userData.receiver = receiver;

        const beamGeometry = new THREE.CylinderGeometry(1.5, 1.5, 70, 8);
        const beamMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xff6b35,
            transparent: true,
            opacity: 0.5,
            emissive: 0xff6b35,
            emissiveIntensity: 0.8
        });
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.rotation.z = Math.PI / 2;
        beam.position.set(0, 25, photoEyeZ);
        group.add(beam);
        group.userData.beam = beam;

        const flashGeometry = new THREE.CylinderGeometry(2, 2, 70, 8);
        const flashMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00,
            transparent: true,
            opacity: 0,
            emissive: 0x00ff00,
            emissiveIntensity: 2.0
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.rotation.z = Math.PI / 2;
        flash.position.set(0, 25, photoEyeZ);
        group.add(flash);
        group.userData.flash = flash;

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ff6b35';
        context.fillRect(0, 0, 512, 128);
        context.fillStyle = '#ffffff';
        context.font = 'Bold 48px Arial';
        context.textAlign = 'center';
        context.fillText('PHOTO EYE', 256, 80);
        const texture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.MeshStandardMaterial({ map: texture, transparent: true });
        const labelGeometry = new THREE.PlaneGeometry(40, 10);
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.set(0, 45, photoEyeZ);
        label.lookAt(this.camera.position);
        group.add(label);
        group.userData.label = label;

        group.userData.positionCm = PHOTO_EYE_POSITION_CM;
        group.userData.zPosition = photoEyeZ;

        this.photoEye = group;
        this.scene.add(group);
    }

    createPushers() {
        let pusherDistances = [222, 313, 464, 380, 607, 710, 850, 972];
        
        if (this.settings) {
            pusherDistances = [1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                const pusherKey = `Pusher ${num}`;
                return this.settings?.pushers?.[pusherKey]?.distance ?? pusherDistances[num - 1];
            });
        }
        
        pusherDistances.forEach((distance, index) => {
            const pusherNumber = index + 1;
            const positionId = this.getPusherPositionId(pusherNumber);
            const pusher = this.createPusher(pusherNumber, distance, positionId);
            this.pushers.push(pusher);
            this.scene.add(pusher);
            if (pusher.userData.bucket) {
                this.buckets.push(pusher.userData.bucket);
            }
        });
    }
    
    getPusherPositionId(pusherNumber) {
        const pusherPositionIdMap = {
            1: 109,
            2: 113,
            3: 119,
            4: 116,
            5: 125,
            6: 129,
            7: 135,
            8: 140
        };
        
        return pusherPositionIdMap[pusherNumber] || 140;
    }
    
    calculatePusherPositionId(pusherDistance) {
        const POSITION_ID_MIN = 101;
        const POSITION_ID_MAX = 150;
        
        let pusher8Distance = 972;
        if (this.settings) {
            const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
            pusher8Distance = Math.max(...distances, 972);
        }
        
        const trackingRangeCm = Math.max(pusher8Distance * 1.25, 1200);
        
        if (trackingRangeCm === 0) {
            return POSITION_ID_MIN;
        }
        
        const normalized = Math.min(pusherDistance / trackingRangeCm, 1.0);
        
        const positionRange = POSITION_ID_MAX - POSITION_ID_MIN;
        const positionId = POSITION_ID_MIN + Math.floor(normalized * positionRange);
        
        return Math.min(Math.max(positionId, POSITION_ID_MIN), POSITION_ID_MAX);
    }

    createPusher(number, distance, positionId) {
        const group = new THREE.Group();
        group.userData = { number, distance, positionId, activated: false };

        const armGeometry = new THREE.BoxGeometry(60, 8, 15);
        const armMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });
        const arm = new THREE.Mesh(armGeometry, armMaterial);
        arm.position.set(-30, 20, 0);
        arm.castShadow = true;
        arm.userData.isArm = true;
        arm.userData.originalX = -30;
        group.add(arm);
        group.userData.arm = arm;

        const headGeometry = new THREE.BoxGeometry(10, 20, 20);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0x2980b9 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.set(0, 20, 0);
        head.castShadow = true;
        head.userData.isHead = true;
        head.userData.originalX = 0;
        group.add(head);
        group.userData.head = head;

        const baseGeometry = new THREE.BoxGeometry(30, 15, 30);
        const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x34495e });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.set(0, 7.5, 0);
        base.castShadow = true;
        group.add(base);

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        context.fillStyle = '#3498db';
        context.fillRect(0, 0, 512, 256);
        context.fillStyle = '#ffffff';
        context.font = 'Bold 120px Arial';
        context.textAlign = 'center';
        context.fillText(`P${number}`, 256, 160);
        const texture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.MeshStandardMaterial({ map: texture, transparent: true });
        const labelGeometry = new THREE.PlaneGeometry(30, 15);
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.set(0, 45, 0);
        label.lookAt(this.camera.position);
        group.add(label);
        
        const distCanvas = document.createElement('canvas');
        distCanvas.width = 256;
        distCanvas.height = 64;
        const distContext = distCanvas.getContext('2d');
        distContext.fillStyle = '#ffffff';
        distContext.font = 'Bold 24px Arial';
        distContext.textAlign = 'center';
        distContext.fillText(`${distance}cm`, 128, 40);
        const distTexture = new THREE.CanvasTexture(distCanvas);
        const distLabelMaterial = new THREE.MeshStandardMaterial({ map: distTexture, transparent: true });
        const distLabelGeometry = new THREE.PlaneGeometry(20, 5);
        const distLabel = new THREE.Mesh(distLabelGeometry, distLabelMaterial);
        distLabel.position.set(0, 25, 0);
        distLabel.lookAt(this.camera.position);
        group.add(distLabel);

        const pusherZ = this.cmToZPosition(distance);
        if (pusherZ !== undefined) {
            group.position.z = pusherZ;
        } else {
            let maxPusherDistance = 972;
            if (this.settings) {
                const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
                maxPusherDistance = Math.max(...distances, 972);
            }
            const startBuffer = 200;
            const totalLength = startBuffer + maxPusherDistance + 200;
            const conveyorStart = -totalLength / 2;
            group.position.z = conveyorStart + startBuffer + distance;
        }
        
        group.position.x = -40;
        group.position.y = 0;

        const bucket = this.createBucket(number, distance, positionId);
        if (bucket) {
            this.scene.add(bucket);
            group.userData.bucket = bucket; // Store reference
        }

        return group;
    }

    createBucket(pusherNumber, distance, positionId) {
        const group = new THREE.Group();
        group.userData = { pusherNumber, distance, positionId, type: "bucket" };

        const bucketZ = this.cmToZPosition(distance);
        if (bucketZ !== undefined) {
            group.position.z = bucketZ;
        } else {
            let maxPusherDistance = 972;
            if (this.settings) {
                const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
                maxPusherDistance = Math.max(...distances, 972);
            }
            const startBuffer = 200;
            const totalLength = startBuffer + maxPusherDistance + 200;
            const conveyorStart = -totalLength / 2;
            group.position.z = conveyorStart + startBuffer + distance;
        }
        
        const bucketGeometry = new THREE.BoxGeometry(40, 30, 40);
        const bucketMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x95a5a6,
            roughness: 0.8,
            metalness: 0.2
        });
        const bucket = new THREE.Mesh(bucketGeometry, bucketMaterial);
        bucket.position.set(0, 15, 0);
        bucket.castShadow = true;
        bucket.receiveShadow = true;
        group.add(bucket);

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.fillStyle = '#95a5a6';
        context.fillRect(0, 0, 256, 128);
        context.fillStyle = '#ffffff';
        context.font = 'Bold 60px Arial';
        context.textAlign = 'center';
        context.fillText(`B${pusherNumber}`, 128, 80);
        const texture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.MeshStandardMaterial({ map: texture, transparent: true });
        const labelGeometry = new THREE.PlaneGeometry(25, 12);
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.set(0, 32, 0);
        label.lookAt(this.camera.position);
        group.add(label);

        group.position.x = 50;
        group.position.y = 0;

        return group;
    }

    createItem(barcode, positionZ = null) {
        if (positionZ === null) {
            positionZ = this.cmToZPosition(-50);
        }
        
        const bookLength = 25;
        const bookWidth = 18;
        const bookThickness = 3;
        
        if (!this._sharedBookMaterial) {
            this._sharedBookMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x8b4513,
                roughness: 0.7,
                metalness: 0.1
            });
        }
        
        if (!this._sharedBookGeometry) {
            this._sharedBookGeometry = new THREE.BoxGeometry(bookLength, bookThickness, bookWidth);
        }
        
        const book = new THREE.Mesh(this._sharedBookGeometry, this._sharedBookMaterial);
        book.castShadow = true;
        book.receiveShadow = true;
        
        const frameHeight = 20;
        book.position.z = positionZ;
        book.position.y = frameHeight + bookThickness / 2;
        book.position.x = 0;

        book.userData.barcode = barcode;
        book.userData.routed = false;
        book.userData.pusher = null;
        
        this.items.push(book);
        this.scene.add(book);
        return book;
    }


    activatePusher(pusherNumber) {
        if (pusherNumber < 1 || pusherNumber > 8) {
            return;
        }
        
        if (!this.pushers || this.pushers.length === 0) {
            return;
        }
        
        const pusher = this.pushers[pusherNumber - 1];
        if (!pusher) {
            return;
        }

        if (pusher.userData.activated) {
            return;
        }

        pusher.userData.activated = true;
        
        let arm = pusher.userData.arm;
        let head = pusher.userData.head;
        
        if (!arm || !head) {
            for (let i = 0; i < pusher.children.length; i++) {
                const child = pusher.children[i];
                if (child.userData.isArm) arm = child;
                if (child.userData.isHead) head = child;
            }
        }
        
        if (arm && head) {
            const originalArmX = arm.userData.originalX !== undefined ? arm.userData.originalX : arm.position.x;
            const originalHeadX = head.userData.originalX !== undefined ? head.userData.originalX : head.position.x;
            
            setTimeout(() => {
                const extendDistance = 50;
                const duration = 0.4;
                let startTime = performance.now();
                
                const extendAnimation = (currentTime) => {
                const elapsed = (currentTime - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);
                
                const eased = 1 - Math.pow(1 - progress, 3);
                const currentArmX = originalArmX + (extendDistance * eased);
                const currentHeadX = originalHeadX + (extendDistance * eased);
                
                arm.position.x = currentArmX;
                head.position.x = currentHeadX;
                
                if (progress < 1) {
                    requestAnimationFrame(extendAnimation);
                } else {
                    setTimeout(() => {
                        startTime = performance.now();
                        const retractAnimation = (currentTime) => {
                            const elapsed = (currentTime - startTime) / 1000;
                            const progress = Math.min(elapsed / duration, 1);
                            
                            const eased = Math.pow(progress, 3);
                            const currentArmX = originalArmX + extendDistance - (extendDistance * eased);
                            const currentHeadX = originalHeadX + extendDistance - (extendDistance * eased);
                            
                            arm.position.x = currentArmX;
                            head.position.x = currentHeadX;
                            
                            if (progress < 1) {
                                requestAnimationFrame(retractAnimation);
                            } else {
                                arm.position.x = originalArmX;
                                head.position.x = originalHeadX;
                                pusher.userData.activated = false;
                            }
                         };
                         requestAnimationFrame(retractAnimation);
                     }, 50);
                 }
             };
             requestAnimationFrame(extendAnimation);
            }, 50);
        } else {
            pusher.userData.activated = false;
        }
    }

    loadSettings() {
        fetch('/get-settings')
            .then(response => response.json())
            .then(settings => {
                this.settings = settings;
                const speed = Number(settings?.belt_speed);
                this.beltSpeedCmPerSec = (speed > 0) ? speed : 32.1;
                this.updatePusherPositions();
                this.positionIdToZ = this.calculatePositionMapping();
                this.createPhotoEye();
                this.updateCameraForConveyor();
                
            })
            .catch(error => {
            });
    }

    updatePusherPositions() {
        if (!this.settings) return;

        this.calculatePositionIdToCm();

        this.pushers.forEach((pusher, index) => {
            const pusherNumber = index + 1;
            const pusherKey = `Pusher ${pusherNumber}`;
            const pusherConfig = this.settings?.pushers?.[pusherKey];
            if (pusherConfig) {
                const distance = pusherConfig.distance;
                const positionId = this.getPusherPositionId(pusherNumber);
                
                const pusherZ = this.cmToZPosition(distance);
                pusher.position.z = pusherZ;
                pusher.position.x = -40;
                pusher.userData.distance = distance;
                pusher.userData.positionId = positionId;
                
                if (pusher.userData.bucket) {
                    pusher.userData.bucket.position.z = pusherZ;
                    pusher.userData.bucket.position.x = 50;
                    pusher.userData.bucket.userData.positionId = positionId;
                }
            }
        });
    }

    animate() {
        if (!this.renderer || !this.scene || !this.camera) {
            if (!this._animateErrorLogged) {
                this._animateErrorLogged = true;
            }
            this.animationId = requestAnimationFrame(() => this.animate());
            return;
        }
        
        if (this._animateErrorLogged) {
            this._animateErrorLogged = false;
        }
        
        const currentTime = performance.now();
        const deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = currentTime;
        this.frameCount++;
        
        this.animationId = requestAnimationFrame(() => this.animate());
        
        const itemsLength = this.items.length;
        for (let i = 0; i < itemsLength; i++) {
            const item = this.items[i];
            
            if (!item || !item.userData) continue;
            
            if (item.userData.routed || item.userData.beingPushed) continue;
            
            let currentPosition = null;
            if (item.userData.positionCm !== undefined && item.userData.positionCm !== null) {
                currentPosition = item.userData.positionCm;
            } else if (item.userData.start_time) {
                currentPosition = this.calculatePositionFromStartTime(item.userData.start_time);
            }
            if (currentPosition !== null) {

                const targetZ = this.cmToZPosition(currentPosition);
                
                const currentZ = item.position.z;
                const distanceToTarget = targetZ - currentZ;
                const absDistance = Math.abs(distanceToTarget);
                
                if (absDistance > 0.01) {
                    const lerpFactor = 0.15;
                    item.position.z = currentZ + (distanceToTarget * lerpFactor);
                } else {
                    item.position.z = targetZ;
                }
                
                if (item.userData.status === "progress" && 
                    item.userData.pusher && 
                    item.userData.distance && 
                    !item.userData.beingPushed && 
                    !item.userData.routed) {
                    
                    const pusherNum = typeof item.userData.pusher === 'number' ? 
                        item.userData.pusher : parseInt(item.userData.pusher);
                    const pusherDistance = typeof item.userData.distance === 'number' ? 
                        item.userData.distance : parseFloat(item.userData.distance);
                    
                    if (pusherNum >= 1 && pusherNum <= 8 && pusherDistance > 0) {
                        const COMPLETION_OFFSET = 3.21;
                        const activationThreshold = pusherDistance - COMPLETION_OFFSET;
                        if (currentPosition >= activationThreshold - 3.21 && !item.userData.beingPushed) {
                            item.userData.beingPushed = true;
                            this.activatePusher(pusherNum);
                            this.pushItemIntoBucket(item, pusherNum);
                        }
                    }
                }
                
                let maxPusherDistance = 972;
                if (this.settings) {
                    const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
                    maxPusherDistance = Math.max(...distances, 972);
                }
                if (currentPosition >= maxPusherDistance + 200 && !item.userData.routed) {
                    item.userData.routed = true;
                    setTimeout(() => this.removeItem(item), 200);
                }
            }
        }

        if (this.controls) {
            this.controls.update();
        }

               if (this.renderer && this.scene && this.camera) {
                   try {
                       this.renderer.render(this.scene, this.camera);
                   } catch (renderError) {
                       if (!this._renderErrorLogged) {
                           this._renderErrorLogged = true;
                       }
                   }
               }
    }

    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    updateCameraForConveyor() {
        if (!this.camera) return;
        
        let maxPusherDistance = 972;
        if (this.settings) {
            const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
            maxPusherDistance = Math.max(...distances, 972);
        }
        const startBuffer = 200;
        const endBuffer = 200;
        const conveyorLength = startBuffer + maxPusherDistance + endBuffer;
        const conveyorWidth = 80;
        const conveyorHalfLength = conveyorLength / 2;
        const conveyorHalfWidth = conveyorWidth / 2;
        
        const cameraHeight = Math.max(conveyorWidth * 2, 200);
        const cameraDistance = Math.max(conveyorHalfWidth * 3, 150);
        
        this.camera.position.set(
            cameraDistance,
            cameraHeight,
            0
        );
        
        this.camera.lookAt(0, 0, 0);
        
        if (this.controls) {
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
        
    }

    cmToZPosition(positionCm) {
        let maxPusherDistance = 972;
        if (this.settings?.pushers) {
            const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
            maxPusherDistance = Math.max(...distances, 972);
        }
        const startBuffer = 200;
        const totalLength = startBuffer + maxPusherDistance + 200;
        const conveyorStart = -totalLength / 2;
        const photoEyeZ = conveyorStart + startBuffer;
        
        return photoEyeZ + positionCm;
    }
    
    calculatePositionMapping() {
        return {};
    }

    calculatePositionFromStartTime(startTime) {
        if (!startTime) return null;
        const now = Date.now() / 1000;
        const elapsed = now - startTime;
        if (elapsed < 0) return 0;
        return elapsed * this.beltSpeedCmPerSec;
    }

    calculatePositionIdToCm() {
        const POSITION_ID_MIN = 101;
        const POSITION_ID_MAX = 150;
        
        let maxPusherDistance = 972;
        if (this.settings) {
            const distances = Object.values(this.settings?.pushers || {}).map(p => p?.distance ?? 0);
            maxPusherDistance = Math.max(...distances, 972);
        }
        
        for (let posId = POSITION_ID_MIN; posId <= POSITION_ID_MAX; posId++) {
            const normalized = (posId - POSITION_ID_MIN) / (POSITION_ID_MAX - POSITION_ID_MIN);
            const positionCm = normalized * maxPusherDistance;
            this.positionIdToCm[posId] = positionCm;
        }
    }

    updateItemFromPositionId(item, positionId) {
        return false;
    }

    setupEventListeners() {
        document.addEventListener('itemScanned', (event) => {
            const { barcode } = event.detail;
            this.createItem(barcode);
        });

        document.addEventListener('activeItemsUpdated', (event) => {
            const { items } = event.detail;
            this.updateItemsFromTracking(items);
        });

        document.addEventListener('settingsUpdated', () => {
            this.loadSettings();
            this.positionIdToZ = this.calculatePositionMapping();
        });
        
        document.addEventListener('pusherActivate', (event) => {
            const { barcode, pusher } = event.detail;
            if (barcode) {
                const item = this.itemsByBarcode[barcode];
                if (item) {
                    item.userData.pusherActivated = true;
                }
            }
        });
    }

    updateItemsFromTracking(trackedItems) {
        const trackedBarcodes = new Set(trackedItems.map(item => item.barcode));
        
        trackedItems.forEach(trackedItem => {
            const barcode = trackedItem.barcode;
            trackedBarcodes.add(barcode);
            
            if (this.itemsByBarcode[barcode]) {
                const item = this.itemsByBarcode[barcode];
                if (!item || !item.userData || item.userData.routed) {
                    return;
                }
                
                item.userData.start_time = trackedItem.start_time;
                item.userData.distance = trackedItem.distance;
                item.userData.status = trackedItem.status;
                item.userData.label = trackedItem.label;
                item.userData.pusher = trackedItem.pusher;
                item.userData.positionId = trackedItem.positionId;
                if (trackedItem.positionCm !== undefined && trackedItem.positionCm !== null) {
                    item.userData.positionCm = typeof trackedItem.positionCm === 'string' ? parseFloat(trackedItem.positionCm) : trackedItem.positionCm;
                }
                if (item.userData.pusherActivated === undefined) {
                    item.userData.pusherActivated = false;
                }
                if (item.userData.beingPushed === undefined) {
                    item.userData.beingPushed = false;
                }
                
                if (this.photoEye && !item.userData.photoEyeDetected) {
                    let currentPositionCm = null;
                    if (trackedItem.positionCm !== undefined && trackedItem.positionCm !== null) {
                        currentPositionCm = typeof trackedItem.positionCm === 'string' ? parseFloat(trackedItem.positionCm) : trackedItem.positionCm;
                    } else if (trackedItem.start_time && trackedItem.positionId) {
                        currentPositionCm = this.calculatePositionFromStartTime(trackedItem.start_time);
                    }
                    
                    if (currentPositionCm !== null && currentPositionCm >= -5 && currentPositionCm <= 5) {
                        this.triggerPhotoEyeDetection(item);
                        item.userData.photoEyeDetected = true;
                    }
                }
                
            } else {
                let currentPosition = null;
                if (trackedItem.positionCm !== undefined && trackedItem.positionCm !== null) {
                    currentPosition = typeof trackedItem.positionCm === 'string' ? parseFloat(trackedItem.positionCm) : trackedItem.positionCm;
                } else if (trackedItem.start_time) {
                    currentPosition = this.calculatePositionFromStartTime(trackedItem.start_time);
                }
                if (currentPosition === null) {
                    return;
                }
                
                let zPosition;
                if (currentPosition !== null && currentPosition !== undefined) {
                    zPosition = this.cmToZPosition(currentPosition);
                } else {
                    zPosition = this.cmToZPosition(-50);
                }
                
                const item = this.createItem(trackedItem.barcode, zPosition);
                
                item.userData.start_time = trackedItem.start_time;
                item.userData.distance = trackedItem.distance;
                item.userData.status = trackedItem.status;
                item.userData.label = trackedItem.label;
                item.userData.pusher = trackedItem.pusher;
                item.userData.positionId = trackedItem.positionId;
                item.userData.routed = false;
                item.userData.pusherActivated = false;
                item.userData.beingPushed = false;
                item.userData.photoEyeDetected = false;
                item.userData.positionCm = currentPosition;
                
                this.itemsByBarcode[barcode] = item;
            }
        });
        
        const itemsToRemove = Object.keys(this.itemsByBarcode).filter(barcode => !trackedBarcodes.has(barcode));
        itemsToRemove.forEach(barcode => {
            const item = this.itemsByBarcode[barcode];
            if (item && this.scene) {
                try {
                    this.scene.remove(item);
                    const index = this.items.indexOf(item);
                    if (index > -1) {
                        this.items.splice(index, 1);
                    }
                } catch (e) {
                }
            }
            delete this.itemsByBarcode[barcode];
        });
    }

    triggerPhotoEyeDetection(item) {
        if (!this.photoEye) return;
        
        const now = performance.now();
        const timeSinceLastDetection = now - this.photoEye.userData.lastDetectionTime;
        
        if (timeSinceLastDetection < 200) return;
        
        this.photoEye.userData.lastDetectionTime = now;
        this.photoEye.userData.detectionActive = true;
        
        const flash = this.photoEye.userData.flash;
        const emitter = this.photoEye.userData.emitter;
        const receiver = this.photoEye.userData.receiver;
        const beam = this.photoEye.userData.beam;
        
        if (!flash || !emitter || !receiver || !beam) return;
        
        flash.material.opacity = 0.9;
        flash.material.emissiveIntensity = 3.0;
        
        const originalEmissive = emitter.material.emissiveIntensity;
        emitter.material.emissiveIntensity = 1.5;
        receiver.material.emissiveIntensity = 1.5;
        beam.material.emissiveIntensity = 2.0;
        beam.material.opacity = 0.9;
        
        setTimeout(() => {
            const fadeOut = (progress) => {
                if (progress >= 1) {
                    flash.material.opacity = 0;
                    flash.material.emissiveIntensity = 2.0;
                    emitter.material.emissiveIntensity = originalEmissive;
                    receiver.material.emissiveIntensity = originalEmissive;
                    beam.material.emissiveIntensity = 1.0;
                    beam.material.opacity = 0.6;
                    this.photoEye.userData.detectionActive = false;
                } else {
                    flash.material.opacity = 0.9 * (1 - progress);
                    flash.material.emissiveIntensity = 2.0 + (1.0 * (1 - progress));
                    emitter.material.emissiveIntensity = originalEmissive + (1.5 - originalEmissive) * (1 - progress);
                    receiver.material.emissiveIntensity = originalEmissive + (1.5 - originalEmissive) * (1 - progress);
                    beam.material.emissiveIntensity = 1.0 + (1.0 * (1 - progress));
                    beam.material.opacity = 0.6 + (0.3 * (1 - progress));
                    requestAnimationFrame(() => fadeOut(progress + 0.1));
                }
            };
            fadeOut(0);
        }, 300);
        
    }

    pushItemIntoBucket(item, pusherNumber) {
        if (!item || !this.scene) return;
        
        const pusher = this.pushers[pusherNumber - 1];
        if (!pusher || !pusher.userData.bucket) {
            this.removeItem(item);
            return;
        }
        
        const bucket = pusher.userData.bucket;
        const bucketPosition = bucket.position;
        
        const startX = item.position.x;
        const startY = item.position.y;
        const startZ = item.position.z;
        const startRotationX = item.rotation.x;
        const startRotationZ = item.rotation.z;
        
        const targetX = bucketPosition.x;
        const targetY = bucketPosition.y + 10;
        const targetZ = bucketPosition.z;
        
        const pushDuration = 0.6;
        const fallDuration = 0.4;
        const totalDuration = pushDuration + fallDuration;
        
        let startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = (currentTime - startTime) / 1000;
            const progress = Math.min(elapsed / totalDuration, 1);
            
            if (progress < 1) {
                if (elapsed < pushDuration) {
                    const pushProgress = elapsed / pushDuration;
                    const easedPush = 1 - Math.pow(1 - pushProgress, 3);
                    
                    item.position.x = startX + (targetX - startX) * easedPush;
                    item.position.z = startZ + (targetZ - startZ) * easedPush * 0.3;
                    item.position.y = startY + Math.sin(pushProgress * Math.PI) * 5;
                } else {
                    const fallProgress = (elapsed - pushDuration) / fallDuration;
                    const easedFall = Math.pow(fallProgress, 2);
                    
                    item.position.x = targetX;
                    item.position.z = targetZ;
                    item.position.y = startY + (targetY - startY) * easedFall;
                    
                    item.rotation.x = startRotationX + (fallProgress * Math.PI * 0.5);
                    item.rotation.z = startRotationZ + (fallProgress * Math.PI * 0.3);
                }
                
                requestAnimationFrame(animate);
            } else {
                item.position.x = targetX;
                item.position.y = targetY;
                item.position.z = targetZ;
                
                item.userData.routed = true;
                setTimeout(() => {
                    this.removeItem(item);
                }, 500);
            }
        };
        
        requestAnimationFrame(animate);
    }

    removeItem(item) {
        if (!item || !this.scene) return;
        
        this.scene.remove(item);
        
        const index = this.items.indexOf(item);
        if (index > -1) {
            this.items.splice(index, 1);
        }
        
        if (item.userData.barcode) {
            delete this.itemsByBarcode[item.userData.barcode];
        }
        
    }

    isWebGLSupported() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && 
                     (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {
            return false;
        }
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        window.removeEventListener('resize', this.onWindowResize);
        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}

if (typeof window !== 'undefined') {
    window.ConveyorSystem3D = ConveyorSystem3D;
    
    try {
        window.dispatchEvent(new CustomEvent('conveyor3d-loaded'));
    } catch (e) {
    }
}

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Renderer, scene, sky and lighting tuned for a bright, glossy, toy-like look. */
export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 400);

    // Environment reflections: this is what makes ink and characters look glossy.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(this.makeEnvScene(), 0.02).texture;
    this.scene.environmentIntensity = 0.9;
    this.studioEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.scene.background = new THREE.Color('#9fdcff');
    this.scene.fog = new THREE.Fog('#bfe6ff', 70, 180);
    this.scene.add(this.makeSky());

    const hemi = new THREE.HemisphereLight('#d6eeff', '#6f6658', 0.85);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight('#fff1d6', 3.2);
    this.sun.position.set(-30, 60, -20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const s = this.sun.shadow.camera;
    s.left = -55; s.right = 55; s.top = 55; s.bottom = -55; s.near = 1; s.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    window.addEventListener('resize', () => this.resize());
  }

  /** Studio lighting env for the Locker turntable. */
  studioEnv: THREE.Texture;

  /** Outdoor reflection environment: sky dome, a hot sun spot, and a warm ground. */
  private makeEnvScene() {
    const env = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          top: { value: new THREE.Color('#5cb8ff') },
          horizon: { value: new THREE.Color('#d8f0ff') },
          ground: { value: new THREE.Color('#8a8378') },
        },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vP;
          void main(){
            float h = vP.y;
            vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, ground, smoothstep(0.0, 0.25, -h));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    env.add(dome);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5) }));
    sun.position.copy(new THREE.Vector3(-30, 60, -20).normalize().multiplyScalar(40));
    env.add(sun);
    return env;
  }

  private makeSky() {
    const geo = new THREE.SphereGeometry(300, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#3fa9ff') },
        mid: { value: new THREE.Color('#a8e4ff') },
        bottom: { value: new THREE.Color('#fff2d9') },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bottom, mid, smoothstep(-0.05, 0.15, h));
          // soft puffy cloud bands
          float cl = sin(vP.x*9.0 + sin(vP.z*7.0)*1.5) * sin(vP.z*8.0 + vP.x*3.0);
          cl = smoothstep(0.55, 0.9, cl) * smoothstep(0.05, 0.25, h) * (1.0 - smoothstep(0.35, 0.6, h));
          c = mix(c, vec3(1.0), cl*0.75);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -1;
    return sky;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

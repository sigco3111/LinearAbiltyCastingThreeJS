import GUI from 'lil-gui';
import { settings, CAST_ANIMATIONS } from '../config/settings.js';
import { PresetManager } from './PresetManager.js';

/**
 * Real-time VFX editor.
 *
 * Every control binds straight to a field in `config/settings.js`. Because all
 * shaders, particle systems, lights and post passes *read* those fields each
 * frame, no controller needs an onChange handler: moving a slider updates the
 * ice field that is already standing, the bolt that is already in the air, the
 * next cast, the environment and the post stack simultaneously, with no rebuild
 * and no shader recompilation.
 *
 * That holds while the simulation is paused (`P`), which is the point — the
 * silhouette of a frozen eruption and the shape of a frozen bolt are the things
 * worth tuning, and both abilities re-resolve themselves from these values on a
 * zero-length frame.
 */
export class Editor {
  /**
   * @param {object} hooks { onClear, onToast }
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.presets = new PresetManager();

    this.gui = new GUI({ title: 'VFX 에디터', width: 330 });
    this.gui.domElement.style.setProperty('--title-height', '30px');

    this._presetState = { name: '내 프리셋', selected: this.presets.names[0] ?? '' };

    this._buildPresets();
    this._buildGlobal();
    this._buildAim();
    this._buildZone();
    this._buildIce();
    this._buildThunder();
    this._buildMeteor();
    this._buildBeam();
    this._buildSnare();
    this._buildGlacier();
    this._buildEnvironment();
    this._buildPost();
    this._buildCamera();
    this._buildCharacter();

    // Everything starts collapsed, top-level folders included. There are enough
    // controls here that any folder left open pushes the rest off the screen,
    // so the panel opens as a list of sections and the user picks one.
    this.gui.foldersRecursive().forEach((folder) => folder.close());
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  static range(folder, object, key, min, max, step, label) {
    return folder.add(object, key, min, max, step).name(label ?? key);
  }

  /**
   * Which clip the body throws when this ability fires.
   *
   * One per ability, because the gesture is part of how a spell reads — the
   * beam and the snare should not be cast the same way. `App` reads the value
   * at the moment of the cast, so switching it applies to the very next click.
   */
  static castAnimation(folder, object) {
    return folder.add(object, 'castAnim', CAST_ANIMATIONS).name('캐스트 동작');
  }

  /**
   * The four colour stops of a particle system's lifetime gradient.
   *
   * `ParticleSystem#setGradient` samples them across a particle's own life, so
   * they are labelled by *when* they are seen rather than by what they are —
   * `A` is the instant it is born, `D` is the moment it dies.
   *
   * @param {string} prefix settings key without the A/B/C/D suffix
   */
  static gradient(folder, object, prefix, title) {
    const group = folder.addFolder(title);
    group.addColor(object, `${prefix}A`).name('생성');
    group.addColor(object, `${prefix}B`).name('초기');
    group.addColor(object, `${prefix}C`).name('후기');
    group.addColor(object, `${prefix}D`).name('소멸');
    return group;
  }

  refresh() {
    this.gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  }

  toggle() {
    this._hidden = !this._hidden;
    this.gui.show(!this._hidden);
  }

  /* ------------------------------------------------------------------ */
  /* folders                                                             */
  /* ------------------------------------------------------------------ */

  _buildPresets() {
    const folder = this.gui.addFolder('프리셋');
    const state = this._presetState;

    let selector = folder
      .add(state, 'selected', this.presets.names.length ? this.presets.names : [''])
      .name('프리셋');

    // lil-gui rebuilds the controller when the option list changes, so the
    // reference has to be replaced rather than mutated.
    const refreshOptions = () => {
      const names = this.presets.names;
      selector = selector.options(names.length ? names : ['']).name('프리셋');
      selector.setValue(names.includes(state.selected) ? state.selected : (names[0] ?? ''));
    };

    folder.add(state, 'name').name('이름');

    folder
      .add(
        {
          save: () => {
            this.presets.save(state.name);
            state.selected = state.name;
            refreshOptions();
            this.hooks.onToast?.(`Saved preset "${state.name}"`);
          }
        },
        'save'
      )
      .name('프리셋 저장');

    folder
      .add(
        {
          load: () => {
            if (this.presets.load(state.selected)) {
              this.refresh();
              this.hooks.onToast?.(`Loaded "${state.selected}"`);
            }
          }
        },
        'load'
      )
      .name('프리셋 불러오기');

    folder
      .add(
        {
          duplicate: () => {
            const copy = this.presets.duplicate(state.selected);
            if (copy) {
              state.selected = copy;
              refreshOptions();
              this.hooks.onToast?.(`Duplicated to "${copy}"`);
            }
          }
        },
        'duplicate'
      )
      .name('복제');

    folder
      .add(
        {
          remove: () => {
            if (this.presets.remove(state.selected)) {
              refreshOptions();
              this.hooks.onToast?.('Preset deleted');
            }
          }
        },
        'remove'
      )
      .name('삭제');

    folder.add({ exportOne: () => this.presets.exportJSON() }, 'exportOne').name('현재 설정 내보내기(JSON)');
    folder.add({ exportAll: () => this.presets.exportAll() }, 'exportAll').name('전체 프리셋 내보내기');

    folder
      .add(
        {
          import: async () => {
            const result = await this.presets.importFromFile();
            refreshOptions();
            this.refresh();
            this.hooks.onToast?.(
              result.applied
                ? 'Settings imported'
                : result.imported.length
                  ? `Imported ${result.imported.length} preset(s)`
                  : 'Nothing imported'
            );
          }
        },
        'import'
      )
      .name('JSON 가져오기…');

    folder
      .add(
        {
          reset: () => {
            this.presets.reset();
            this.refresh();
            this.hooks.onToast?.('Reset to defaults');
          }
        },
        'reset'
      )
      .name('기본값으로 초기화');

    this.presetFolder = folder;
  }

  _buildGlobal() {
    const folder = this.gui.addFolder('전체 설정');
    const g = settings.global;
    const R = Editor.range;

    R(folder, g, 'timeScale', 0.02, 2, 0.01, '시간 배율');
    R(folder, g, 'speed', 0.1, 4, 0.01, '시전 속도');
    R(folder, g, 'lifetime', 0.1, 4, 0.01, '수명');
    R(folder, g, 'glow', 0, 5, 0.01, '발광 강도');
    R(folder, g, 'shaderIntensity', 0, 2, 0.01, '셰이더 강도');
    R(folder, g, 'opacity', 0, 2, 0.01, '불투명도');
    R(folder, g, 'noiseFrequency', 0.1, 4, 0.01, '노이즈 주파수');
    R(folder, g, 'noiseSpeed', 0, 4, 0.01, '노이즈 속도');
    R(folder, g, 'turbulence', 0, 4, 0.01, '난류');
    R(folder, g, 'randomness', 0, 2, 0.01, '무작위성');
    R(folder, g, 'fresnel', 0, 3, 0.01, '프레넬 강도');
    R(folder, g, 'distortion', 0, 3, 0.01, '열 왜곡');

    const particles = folder.addFolder('파티클');
    R(particles, g, 'particleCount', 0, 3, 0.01, '개수');
    R(particles, g, 'particleLifetime', 0.1, 3, 0.01, '수명');
    R(particles, g, 'particleSpeed', 0.1, 3, 0.01, '속도');
    R(particles, g, 'particleSize', 0.1, 3, 0.01, '크기');
    R(particles, g, 'emissionRate', 0, 3, 0.01, '방출 비율');

    const lighting = folder.addFolder('조명 및 충격');
    R(lighting, g, 'lightIntensity', 0, 4, 0.01, '조명 강도');
    R(lighting, g, 'lightRadius', 0.1, 4, 0.01, '조명 반지름');
    R(lighting, g, 'explosionIntensity', 0, 3, 0.01, '충돌 강도');
    R(lighting, g, 'cameraShake', 0, 3, 0.01, '카메라 흔들림');
    R(lighting, g, 'animationSpeed', 0, 3, 0.01, '애니메이션 속도');

    this.globalFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  _buildAim() {
    const folder = this.gui.addFolder('➤ 조준 표시기');
    const a = settings.aim;
    const R = Editor.range;

    const shape = folder.addFolder('외형 (미터)');
    R(shape, a, 'shaftWidth', 0.05, 2, 0.01, '자루 반폭');
    R(shape, a, 'headLength', 0.2, 8, 0.05, '촉 길이');
    R(shape, a, 'headWidth', 0.1, 5, 0.01, '촉 반폭');
    R(shape, a, 'round', 0, 0.6, 0.01, '모서리 둥글기');
    R(shape, a, 'startOffset', 0, 5, 0.05, '시전자 간격');
    R(shape, a, 'height', 0.005, 0.4, 0.005, '부유 높이');

    const look = folder.addFolder('렌더링');
    R(look, a, 'edge', 0.01, 0.5, 0.005, '외곽선 두께');
    R(look, a, 'edgeGlow', 0, 8, 0.05, '외곽선 발광');
    R(look, a, 'softness', 0.005, 0.5, 0.005, '가장자리 부드러움');
    R(look, a, 'fill', 0, 1.5, 0.01, '내부 채우기');
    R(look, a, 'fillFalloff', 0.1, 4, 0.05, '채우기 감쇠');
    R(look, a, 'opacity', 0, 2, 0.01, '불투명도');
    look.addColor(a, 'colorCore').name('중심 색');
    look.addColor(a, 'colorEdge').name('가장자리 색');
    look.addColor(a, 'colorInvalid').name('근접 경고 색');

    const energy = folder.addFolder('에너지 및 서리');
    R(energy, a, 'stripes', 0, 4, 0.01, '셰브론 (미터당)');
    R(energy, a, 'stripeSharp', 0, 1, 0.01, '셰브론 선명도');
    R(energy, a, 'stripeDepth', 0, 1, 0.01, '셰브론 깊이');
    R(energy, a, 'scrollSpeed', -10, 10, 0.05, '스크롤 속도');
    R(energy, a, 'pulse', 0, 1, 0.01, '맥동');
    R(energy, a, 'pulseSpeed', 0, 8, 0.05, '맥동 속도');
    R(energy, a, 'noise', 0, 1.5, 0.01, '서리 노이즈');
    R(energy, a, 'noiseScale', 0.1, 8, 0.05, '노이즈 규모');
    R(energy, a, 'noiseSpeed', 0, 3, 0.01, '노이즈 속도');
    R(energy, a, 'crystals', 0, 2, 0.01, '서리 판');
    R(energy, a, 'crystalScale', 0.2, 10, 0.05, '판 규모');

    const furniture = folder.addFolder('고리 및 로제트');
    R(furniture, a, 'baseRing', 0, 3, 0.01, '바닥 고리 반지름');
    R(furniture, a, 'baseRingWidth', 0.005, 0.4, 0.005, '바닥 고리 폭');
    R(furniture, a, 'tipGlyph', 0, 2, 0.01, '끝 로제트');
    R(furniture, a, 'tipGlyphSize', 0.1, 4, 0.05, '로제트 반지름');
    R(furniture, a, 'tipSpin', -3, 3, 0.01, '로제트 회전');
    R(furniture, a, 'rangeArc', 0, 2, 0.01, '사거리 호');
    R(furniture, a, 'reveal', 0.01, 1, 0.005, '펼쳐지는 시간');
  }

  /* ------------------------------------------------------------------ */

  /**
   * The far-cast indicator — the circle every zone ability is aimed with.
   *
   * Shared, like the arrow: it is a property of the *targeting*, not of any one
   * ability, so a second far cast inherits the whole thing and brings only its
   * own `zoneRadius`. The two controls worth reaching for first are `boundary`
   * (how thick the footprint edge reads) and `snap` (how hard it overshoots on
   * the way out), which between them decide whether the circle feels like a UI
   * overlay or like something the caster is doing.
   */
  _buildZone() {
    const folder = this.gui.addFolder('◎ 원거리 시전 원');
    const z = settings.zone;
    const R = Editor.range;

    const edge = folder.addFolder('경계선 (미터)');
    R(edge, z, 'boundary', 0.02, 2, 0.01, '띠 두께');
    R(edge, z, 'boundaryBias', 0, 1, 0.01, '띠 편향 (밖/안)');
    R(edge, z, 'boundaryGlow', 0, 8, 0.05, '띠 발광');
    R(edge, z, 'liner', 0.005, 0.4, 0.005, '내부 라이너');
    R(edge, z, 'softness', 0.005, 0.4, 0.005, '가장자리 부드러움');
    R(edge, z, 'height', 0.005, 0.4, 0.005, '부유 높이');

    const inside = folder.addFolder('내부');
    R(inside, z, 'fill', 0, 1.5, 0.01, '내부 채우기');
    R(inside, z, 'fillFalloff', 0.1, 5, 0.05, '채우기 감쇠');
    R(inside, z, 'rings', 0, 12, 0.1, '등고선 고리');
    R(inside, z, 'ringWidth', 0.005, 0.5, 0.005, '고리 폭');
    R(inside, z, 'ringSpeed', -4, 4, 0.01, '고리 속도');
    R(inside, z, 'crawl', 0, 3, 0.01, '필라멘트');
    R(inside, z, 'crawlScale', 0.1, 8, 0.05, '필라멘트 (미터당)');
    R(inside, z, 'crawlSpeed', -4, 4, 0.01, '필라멘트 기어감');
    R(inside, z, 'noise', 0, 1.5, 0.01, '파쇄');
    R(inside, z, 'noiseScale', 0.1, 8, 0.05, '파쇄 규모');

    const furniture = folder.addFolder('눈금·소인·조준선');
    R(furniture, z, 'ticks', 0, 96, 1, '경계 눈금');
    R(furniture, z, 'tickLength', 0.05, 3, 0.01, '눈금 길이');
    R(furniture, z, 'tickWidth', 0.02, 0.9, 0.01, '눈금 듀티');
    R(furniture, z, 'tickSpin', -2, 2, 0.005, '눈금 회전');
    R(furniture, z, 'sweep', 0, 3, 0.01, '레이더 소인');
    R(furniture, z, 'sweepSpeed', -3, 3, 0.01, '소인 속도');
    R(furniture, z, 'core', 0, 3, 0.01, '중심 표시');
    R(furniture, z, 'coreSize', 0.05, 3, 0.01, '중심 크기');
    R(furniture, z, 'crosshair', 0, 3, 0.01, '조준선 팔');
    R(furniture, z, 'crosshairLength', 0.1, 6, 0.05, '팔 길이');
    R(furniture, z, 'pulse', 0, 1, 0.01, '맥동');
    R(furniture, z, 'pulseSpeed', 0, 8, 0.05, '맥동 속도');

    const reach = folder.addFolder('사거리 고리');
    R(reach, z, 'reach', 0, 3, 0.01, '사거리 밝기');
    R(reach, z, 'reachWidth', 0.005, 0.5, 0.005, '사거리 폭');
    R(reach, z, 'reachDashes', 0, 200, 1, '대시');
    R(reach, z, 'reachDashGap', 0, 0.95, 0.01, '대시 간격');
    R(reach, z, 'reachSpin', -1, 1, 0.005, '대시 이동');
    R(reach, z, 'reachLead', 0, 3, 0.01, '선행 표시');

    const look = folder.addFolder('렌더링');
    R(look, z, 'opacity', 0, 2, 0.01, '불투명도');
    R(look, z, 'reveal', 0.01, 1, 0.005, '튀어나오는 시간');
    R(look, z, 'snap', 1, 2, 0.01, '확산 오버슈트');
    look.addColor(z, 'colorCore').name('중심 색');
    look.addColor(z, 'colorEdge').name('채우기 색');
    look.addColor(z, 'colorInvalid').name('근접 경고 색');
  }

  /* ------------------------------------------------------------------ */

  _buildIce() {
    const folder = this.gui.addFolder('❄ 프로스트 랜스');
    const c = settings.ice;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'range', 2, 40, 0.1, '최대 사거리');
    R(cast, c, 'minRange', 0, 10, 0.1, '최소 사거리');
    R(cast, c, 'speed', 2, 80, 0.5, '전선 속도');
    R(cast, c, 'lifetime', 0.2, 12, 0.1, '전장 수명');
    R(cast, c, 'cooldown', 0, 6, 0.05, '재사용 대기시간');
    Editor.castAnimation(cast, c);

    const field = folder.addFolder('범위 바닥');
    R(field, c, 'widthNear', 0.05, 6, 0.01, '시전자 폭');
    R(field, c, 'width', 0.1, 10, 0.05, '목표 폭');
    R(field, c, 'widthCurve', 0.2, 4, 0.01, '폭 곡선');
    R(field, c, 'spikeCount', 4, 288, 1, '결정 개수');
    R(field, c, 'density', 0.05, 1, 0.01, '밀도');
    R(field, c, 'clumping', 0.3, 4, 0.01, '중심 당김');
    R(field, c, 'scatter', 0, 2, 0.01, '좌우 산란');
    R(field, c, 'frontBias', 0.3, 3, 0.01, '목표 쪽 밀집');

    const shape = folder.addFolder('외형');
    R(shape, c, 'heightNear', 0.05, 6, 0.01, '시전자 높이');
    R(shape, c, 'height', 0.1, 12, 0.05, '목표 높이');
    R(shape, c, 'heightCurve', 0.2, 5, 0.01, '높이 곡선');
    R(shape, c, 'heightJitter', 0, 1.5, 0.01, '높이 흔들림');
    R(shape, c, 'crown', 0, 0.95, 0.01, '측면 감쇠');
    R(shape, c, 'peak', 1, 4, 0.01, '목표 부풀기');
    R(shape, c, 'peakWidth', 0.02, 1, 0.01, '부풀기 폭');
    R(shape, c, 'rubble', 0, 1, 0.01, '잔해 비율');
    R(shape, c, 'rubbleScale', 0.05, 1, 0.01, '잔해 높이');

    // These four regenerate the crystal geometry — see IceAbility#_syncGeometry.
    const crystal = folder.addFolder('결정');
    R(crystal, c, 'radius', 0.02, 1.5, 0.01, '밑둥 반지름');
    R(crystal, c, 'radiusJitter', 0, 1.5, 0.01, '반지름 흔들림');
    R(crystal, c, 'taper', 0.01, 0.8, 0.01, '끝 테이퍼');
    R(crystal, c, 'facets', 3, 10, 1, '면');
    R(crystal, c, 'roughness', 0, 1, 0.01, '표면 거칠기');
    R(crystal, c, 'bend', 0, 1.5, 0.01, '휨');
    R(crystal, c, 'lean', 0, 1.4, 0.01, '시전자 기울기');
    R(crystal, c, 'leanJitter', 0, 1.5, 0.01, '기울기 흔들림');
    R(crystal, c, 'twist', 0, 1, 0.01, '무작위 요');

    const rise = folder.addFolder('분출');
    R(rise, c, 'riseTime', 0.02, 1.5, 0.01, '상승 시간');
    R(rise, c, 'riseOvershoot', 0, 1, 0.01, '펀치 오버슈트');
    R(rise, c, 'riseStagger', 0, 1, 0.005, '시차');
    R(rise, c, 'settle', 0.05, 2, 0.01, '안정 시간');
    R(rise, c, 'shatterDelay', 0, 4, 0.05, '가라앉기 전 유지');
    R(rise, c, 'sinkTime', 0.1, 4, 0.05, '가라앉는 시간');

    const material = folder.addFolder('얼음 재질');
    material.addColor(c, 'colorDeep').name('심층');
    material.addColor(c, 'colorIce').name('본체');
    material.addColor(c, 'colorRim').name('가장자리');
    material.addColor(c, 'colorCore').name('내부 빛');
    R(material, c, 'opacity', 0, 1, 0.01, '불투명도');
    R(material, c, 'depthTint', 0, 3, 0.01, '두께 틴트');
    R(material, c, 'fresnel', 0, 6, 0.01, '프레넬');
    R(material, c, 'fresnelPower', 0.5, 6, 0.05, '프레넬 세기');
    R(material, c, 'translucency', 0, 4, 0.01, '반투명');
    R(material, c, 'envIntensity', 0, 3, 0.01, '반사');
    R(material, c, 'facetSharp', 0, 1.5, 0.01, '면 대비');
    R(material, c, 'fracture', 0, 2, 0.01, '내부 균열');
    R(material, c, 'fractureScale', 0.5, 20, 0.1, '균열 규모');
    R(material, c, 'veins', 0, 2, 0.01, '깃털 서리');
    R(material, c, 'veinScale', 0.2, 10, 0.05, '서리 규모');
    R(material, c, 'glint', 0, 5, 0.01, '표면 반짝임');
    R(material, c, 'glintScale', 4, 90, 0.5, '반짝임 규모');
    R(material, c, 'glintSpeed', 0, 4, 0.01, '반짝임 속도');
    R(material, c, 'frostLine', 0, 1.5, 0.01, '밑둥 서리');
    R(material, c, 'glow', 0, 5, 0.01, '발광');
    R(material, c, 'edgeGlow', 0, 6, 0.01, '가장자리 발광');
    R(material, c, 'birthGlow', 0, 10, 0.05, '생성 섬광');
    R(material, c, 'birthFade', 0.02, 2, 0.01, '생성 섬광 시간');

    const ground = folder.addFolder('바닥 서리');
    R(ground, c, 'frostSpread', 0.1, 5, 0.01, '자국 반지름');
    R(ground, c, 'frostRate', 0.2, 12, 0.1, '자국 (미터당)');
    R(ground, c, 'frostLife', 0.5, 20, 0.1, '자국 수명');
    R(ground, c, 'frostIntensity', 0, 2, 0.01, '강도');
    R(ground, c, 'frostCrystals', 0, 4, 0.01, '눈 입자');
    R(ground, c, 'shockRadius', 0.5, 20, 0.1, '충격파 반지름');
    ground.addColor(c, 'colorFrost').name('눈');
    ground.addColor(c, 'colorFrostEdge').name('눈 그림자');
    ground.addColor(c, 'colorShockA').name('충격파 고리');
    ground.addColor(c, 'colorShockB').name('충격파 마루');

    const mist = folder.addFolder('안개·파편·반짝이');
    R(mist, c, 'mistRate', 0, 900, 1, '안개 비율');
    R(mist, c, 'mistSize', 0.05, 4, 0.01, '안개 크기');
    R(mist, c, 'mistSpeed', 0, 8, 0.05, '안개 속도');
    R(mist, c, 'mistLifetime', 0.2, 8, 0.05, '안개 수명');
    R(mist, c, 'mistOpacity', 0, 2, 0.01, '안개 불투명도');
    R(mist, c, 'mistRise', -2, 4, 0.01, '안개 상승');
    R(mist, c, 'shardRate', 0, 500, 1, '파편 비율');
    R(mist, c, 'shardSize', 0.005, 0.5, 0.005, '파편 크기');
    R(mist, c, 'shardSpeed', 0, 25, 0.1, '파편 속도');
    R(mist, c, 'shardLifetime', 0.1, 5, 0.05, '파편 수명');
    R(mist, c, 'shardGravity', -40, 0, 0.1, '파편 중력');
    R(mist, c, 'sparkleRate', 0, 600, 1, '반짝이 비율');
    R(mist, c, 'sparkleSize', 0.005, 0.4, 0.005, '반짝이 크기');
    R(mist, c, 'sparkleSpeed', 0, 12, 0.05, '반짝이 속도');
    R(mist, c, 'sparkleLifetime', 0.2, 8, 0.05, '반짝이 수명');
    R(mist, c, 'sparkleRise', -2, 8, 0.05, '반짝이 오름');
    R(mist, c, 'sparkleTurbulence', 0, 3, 0.01, '반짝이 난류');
    Editor.gradient(mist, c, 'colorMist', '안개 색');
    Editor.gradient(mist, c, 'colorShard', '파편 색');
    Editor.gradient(mist, c, 'colorSparkle', '반짝이 색');

    const impact = folder.addFolder('충돌');
    R(impact, c, 'burstSize', 0.2, 14, 0.05, '폭발 크기');
    R(impact, c, 'burstIntensity', 0, 4, 0.01, '폭발 강도');
    R(impact, c, 'burstShards', 0, 400, 1, '폭발 파편');
    R(impact, c, 'impactShake', 0, 3, 0.01, '흔들림');
    R(impact, c, 'shakeDuration', 0.1, 4, 0.01, '흔들림 지속');
    R(impact, c, 'impactFlash', 0, 2, 0.01, '화면 섬광');
    R(impact, c, 'rumble', 0, 0.5, 0.005, '이동 진동');
    impact.addColor(c, 'colorBurstA').name('증기 껍질');
    impact.addColor(c, 'colorBurstB').name('껍질 본체');
    impact.addColor(c, 'colorBurstC').name('판 및 가장자리');
    impact.addColor(c, 'colorFlash').name('화면 섬광 색');

    const light = folder.addFolder('동적 조명');
    R(light, c, 'lightIntensity', 0, 80, 0.1, '조명 강도');
    R(light, c, 'lightRadius', 0.5, 40, 0.1, '조명 반지름');
    light.addColor(c, 'lightColor').name('조명 색');

    this.iceFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Storm Lance.
   *
   * Every control here is read by the vertex shader on the frame it changes, so
   * the whole folder reshapes a bolt that is already in the air. The ones worth
   * reaching for first are `jitter` and `jitterScale` (how violently it kinks),
   * `strands` and `spread` (how wide the bundle reads) and `restrike` (how hard
   * it strobes) — those four carry the character of the effect.
   */
  _buildThunder() {
    const folder = this.gui.addFolder('⚡ 스톰 랜스');
    const c = settings.thunder;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'range', 2, 60, 0.1, '최대 사거리');
    R(cast, c, 'minRange', 0, 10, 0.1, '최소 사거리');
    R(cast, c, 'speed', 5, 400, 1, '타격 속도');
    R(cast, c, 'lifetime', 0.05, 6, 0.01, '번개 수명');
    R(cast, c, 'fadeTime', 0.05, 4, 0.01, '소멸 시간');
    R(cast, c, 'cooldown', 0, 6, 0.05, '재사용 대기시간');
    Editor.castAnimation(cast, c);

    const anchor = folder.addFolder('손에서 나가는 지점');
    R(anchor, c, 'handHeight', 0, 3, 0.01, '손 높이');
    R(anchor, c, 'handForward', -1, 3, 0.01, '손 전방');
    R(anchor, c, 'handSide', -1.5, 1.5, 0.01, '손 좌우');
    R(anchor, c, 'endHeight', 0, 4, 0.01, '목표 높이');
    R(anchor, c, 'sag', -3, 3, 0.01, '중간 휨');

    const bundle = folder.addFolder('다발');
    R(bundle, c, 'strands', 1, 24, 1, '필라멘트');
    R(bundle, c, 'spread', 0, 5, 0.01, '목표 부채꼴');
    R(bundle, c, 'spreadNear', 0, 2, 0.01, '손 부채꼴');
    R(bundle, c, 'spreadCurve', 0.2, 5, 0.01, '부채꼴 곡선');
    R(bundle, c, 'twist', -4, 4, 0.01, '길이당 비틀림');
    R(bundle, c, 'twistSpeed', -6, 6, 0.01, '비틀림 속도');
    R(bundle, c, 'branchDim', 0, 1, 0.01, '외부 필라멘트 어둡기');

    const shape = folder.addFolder('필라멘트');
    R(shape, c, 'jitter', 0, 3, 0.01, '꺾임 진폭');
    R(shape, c, 'jitterScale', 0.05, 6, 0.01, '꺾임 (미터당)');
    R(shape, c, 'octaves', 1, 5, 1, '옥타브');
    R(shape, c, 'jitterFalloff', 0.1, 0.95, 0.01, '옥타브 감쇠');
    R(shape, c, 'crawl', -20, 20, 0.1, '꺾임 기어감');
    R(shape, c, 'pinch', 0.01, 0.5, 0.005, '끝 조임');
    R(shape, c, 'converge', 0, 1, 0.01, '목표 고정');

    const ribbon = folder.addFolder('리본');
    R(ribbon, c, 'width', 0.005, 0.6, 0.005, '손 폭');
    R(ribbon, c, 'widthTip', 0.02, 3, 0.01, '목표 폭');
    R(ribbon, c, 'widthCurve', 0.1, 4, 0.01, '테이퍼 곡선');
    R(ribbon, c, 'coreWidth', 1, 6, 0.01, '척추 두께');
    R(ribbon, c, 'coreSharp', 0.5, 12, 0.05, '중심 선명도');
    R(ribbon, c, 'glowWidth', 1, 30, 0.1, '후광 폭');
    R(ribbon, c, 'glowFalloff', 0.2, 8, 0.05, '후광 감쇠');
    R(ribbon, c, 'glowOpacity', 0, 2, 0.01, '후광 불투명도');
    R(ribbon, c, 'softFade', 0.02, 3, 0.01, '부드러운 교차');

    const strobe = folder.addFolder('깜빡임 및 재타격');
    R(strobe, c, 'restrike', 0.5, 90, 0.5, '재타격 (초당)');
    R(strobe, c, 'flicker', 0, 1, 0.01, '밝기 끊김');
    R(strobe, c, 'flickerSpeed', 1, 120, 1, '끊김 비율');
    R(strobe, c, 'strandFlash', 0, 1, 0.01, '필라멘트 깜빡임');
    R(strobe, c, 'tipGlow', 0, 8, 0.05, '선단 발광');
    R(strobe, c, 'tipLength', 0.005, 0.5, 0.005, '선단 길이');

    const material = folder.addFolder('번개 색상');
    material.addColor(c, 'colorCore').name('중심');
    material.addColor(c, 'colorInner').name('내부');
    material.addColor(c, 'colorOuter').name('외부');
    material.addColor(c, 'colorHalo').name('후광');
    R(material, c, 'glow', 0, 8, 0.01, '발광');
    R(material, c, 'opacity', 0, 2, 0.01, '불투명도');

    const ground = folder.addFolder('바닥 화상');
    R(ground, c, 'arcRate', 0.05, 8, 0.05, '화상 (미터당)');
    R(ground, c, 'arcRadius', 0.1, 8, 0.05, '연소 반지름');
    R(ground, c, 'arcLife', 0.05, 5, 0.05, '연소 수명');
    R(ground, c, 'arcIntensity', 0, 3, 0.01, '연소 강도');
    R(ground, c, 'arcBranches', 0, 3, 0.01, '가지 디테일');
    R(ground, c, 'scorchRadius', 0.05, 4, 0.05, '그을음 반지름');
    R(ground, c, 'scorchLife', 0.5, 20, 0.1, '그을음 수명');
    R(ground, c, 'scorchIntensity', 0, 2, 0.01, '그을음 강도');
    R(ground, c, 'shockRadius', 0.5, 25, 0.1, '충격파 반지름');
    ground.addColor(c, 'colorArc').name('화상');
    ground.addColor(c, 'colorEmber').name('불씨');
    ground.addColor(c, 'colorScorch').name('그을음');
    ground.addColor(c, 'colorShockA').name('충격파 고리');
    ground.addColor(c, 'colorShockB').name('충격파 마루');

    const sparks = folder.addFolder('불꽃 및 미립자');
    R(sparks, c, 'sparkRate', 0, 1200, 1, '불꽃 비율');
    R(sparks, c, 'sparkSize', 0.005, 0.8, 0.005, '불꽃 크기');
    R(sparks, c, 'sparkSpeed', 0, 40, 0.1, '불꽃 속도');
    R(sparks, c, 'sparkLifetime', 0.05, 4, 0.01, '불꽃 수명');
    R(sparks, c, 'sparkGravity', -50, 5, 0.1, '불꽃 중력');
    R(sparks, c, 'sparkStretch', 0, 3, 0.01, '불꽃 늘어남');
    R(sparks, c, 'moteRate', 0, 600, 1, '미립자 비율');
    R(sparks, c, 'moteSize', 0.005, 0.4, 0.005, '미립자 크기');
    R(sparks, c, 'moteSpeed', 0, 12, 0.05, '미립자 속도');
    R(sparks, c, 'moteLifetime', 0.1, 8, 0.05, '미립자 수명');
    R(sparks, c, 'moteRise', -3, 8, 0.05, '미립자 상승');
    R(sparks, c, 'moteTurbulence', 0, 3, 0.01, '미립자 난류');
    Editor.gradient(sparks, c, 'colorSpark', '불꽃 색');
    Editor.gradient(sparks, c, 'colorMote', '미립자 색');

    const dust = folder.addFolder('연기 및 파편');
    R(dust, c, 'smokeRate', 0, 500, 1, '연기 비율');
    R(dust, c, 'smokeSize', 0.05, 4, 0.01, '연기 크기');
    R(dust, c, 'smokeSpeed', 0, 8, 0.05, '연기 속도');
    R(dust, c, 'smokeLifetime', 0.2, 8, 0.05, '연기 수명');
    R(dust, c, 'smokeOpacity', 0, 1, 0.005, '연기 불투명도');
    R(dust, c, 'smokeRise', -2, 4, 0.01, '연기 상승');
    R(dust, c, 'debrisRate', 0, 300, 1, '잔해 비율');
    R(dust, c, 'debrisSize', 0.005, 0.4, 0.005, '잔해 크기');
    R(dust, c, 'debrisSpeed', 0, 25, 0.1, '잔해 속도');
    R(dust, c, 'debrisLifetime', 0.1, 5, 0.05, '잔해 수명');
    R(dust, c, 'debrisGravity', -50, 0, 0.1, '잔해 중력');
    Editor.gradient(dust, c, 'colorSmoke', '연기 색');
    Editor.gradient(dust, c, 'colorDebris', '잔해 색');

    const impact = folder.addFolder('발사구 및 충돌');
    R(impact, c, 'muzzleSize', 0.05, 6, 0.05, '발사구 크기');
    R(impact, c, 'muzzleIntensity', 0, 5, 0.01, '발사구 강도');
    R(impact, c, 'castFlash', 0, 2, 0.01, '방출 섬광');
    impact.addColor(c, 'colorMuzzleA').name('발사구 외피');
    impact.addColor(c, 'colorMuzzleB').name('발사구 본체');
    impact.addColor(c, 'colorMuzzleC').name('발사구 아크');
    impact.addColor(c, 'colorCastFlash').name('방출 섬광 색');
    R(impact, c, 'burstSize', 0.2, 14, 0.05, '폭발 크기');
    R(impact, c, 'burstIntensity', 0, 5, 0.01, '폭발 강도');
    R(impact, c, 'burstSparks', 0, 600, 1, '폭발 불꽃');
    R(impact, c, 'burstDebris', 0, 300, 1, '폭발 잔해');
    R(impact, c, 'impactShake', 0, 3, 0.01, '흔들림');
    R(impact, c, 'shakeDuration', 0.1, 4, 0.01, '흔들림 지속');
    R(impact, c, 'impactFlash', 0, 2, 0.01, '화면 섬광');
    R(impact, c, 'rumble', 0, 0.5, 0.005, '이동 진동');
    impact.addColor(c, 'colorBurstA').name('폭발 외피');
    impact.addColor(c, 'colorBurstB').name('폭발 본체');
    impact.addColor(c, 'colorBurstC').name('폭발 아크');
    impact.addColor(c, 'colorFlash').name('충돌 섬광 색');

    const light = folder.addFolder('동적 조명');
    R(light, c, 'lightIntensity', 0, 120, 0.5, '조명 강도');
    R(light, c, 'lightRadius', 0.5, 50, 0.1, '조명 반지름');
    R(light, c, 'lightFlicker', 0, 1, 0.01, '조명 꺼짐');
    R(light, c, 'lightFlickerSpeed', 1, 90, 1, '꺼짐 비율');
    light.addColor(c, 'lightColor').name('조명 색');

    this.thunderFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Cinder Fall.
   *
   * The seven controls under "The rock" regenerate real geometry — see
   * `MeteorAbility#_syncGeometry` — and everything else is read by a shader or
   * resolved from scratch on the frame it changes, so the whole folder reshapes
   * a meteor that is already in the air. The ones worth reaching for first are
   * `arc` (how hard it is lobbed), `crackWidth` and `chargeCurve` (how the lava
   * seams open on the way in), `trailSpan` and `trailWidth` (how much fire
   * streams off it) and `chunkSpeed` (how far the wreckage is thrown).
   */
  _buildMeteor() {
    const folder = this.gui.addFolder('☄ 신더 폴');
    const c = settings.meteor;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'range', 2, 60, 0.1, '최대 사거리');
    R(cast, c, 'minRange', 0, 10, 0.1, '최소 사거리');
    R(cast, c, 'speed', 3, 90, 0.5, '이동 속도');
    R(cast, c, 'lifetime', 0.2, 10, 0.1, '분화구 수명');
    R(cast, c, 'fadeTime', 0.1, 6, 0.05, '정리 시간');
    R(cast, c, 'cooldown', 0, 6, 0.05, '재사용 대기시간');
    Editor.castAnimation(cast, c);

    const path = folder.addFolder('비행 경로');
    R(path, c, 'handHeight', 0, 3, 0.01, '손 높이');
    R(path, c, 'handForward', -1, 3, 0.01, '손 전방');
    R(path, c, 'handSide', -1.5, 1.5, 0.01, '손 좌우');
    R(path, c, 'endHeight', 0, 4, 0.01, '목표 높이');
    R(path, c, 'arc', -4, 12, 0.05, '포물 높이');
    R(path, c, 'arcCurve', 0.1, 4, 0.01, '포물 곡선');

    // Everything down to `craterSize` rebuilds the asteroid geometry. `cuts` is
    // the one that decides whether it reads as stone: it slices flat fracture
    // faces off the ball, which no amount of noise can fake.
    const rock = folder.addFolder('암석');
    R(rock, c, 'radius', 0.05, 3, 0.01, '반지름');
    R(rock, c, 'facets', 0, 3, 1, '세분화');
    R(rock, c, 'lumpiness', 0, 0.8, 0.01, '울퉁불퉁');
    R(rock, c, 'lumpScale', 0.2, 6, 0.05, '덩어리 (반지름당)');
    R(rock, c, 'surfaceRoughness', 0, 1, 0.01, '표면 거칠기');
    R(rock, c, 'cuts', 0, 16, 1, '균열 면');
    R(rock, c, 'cutDepth', 0, 0.5, 0.01, '균열 깊이');
    R(rock, c, 'craters', 0, 14, 1, '분화구');
    R(rock, c, 'craterDepth', 0, 0.6, 0.01, '분화구 깊이');
    R(rock, c, 'craterSize', 0.05, 1.4, 0.01, '분화구 크기');
    R(rock, c, 'spin', -20, 20, 0.1, '회전 비율');

    const seams = folder.addFolder('용암 틈새');
    R(seams, c, 'chargeCurve', 0.1, 5, 0.01, '가열 곡선');
    R(seams, c, 'crackScale', 0.3, 10, 0.05, '틈새 (반지름당)');
    R(seams, c, 'crackWidth', 0.005, 0.5, 0.005, '틈새 폭');
    R(seams, c, 'crackBranches', 0, 1.5, 0.01, '가지 틈새');
    R(seams, c, 'crackGlow', 0, 10, 0.05, '틈새 발광');
    R(seams, c, 'crackFlow', 0, 1, 0.01, '마그마 기어감');
    R(seams, c, 'crackFlowSpeed', 0, 5, 0.01, '기어가는 속도');
    R(seams, c, 'rockScale', 0.2, 10, 0.05, '암석 얼룩');
    R(seams, c, 'facetTint', 0, 1.2, 0.01, '면별 틴트');
    R(seams, c, 'cavity', 0, 1, 0.01, '움푹 음영');
    R(seams, c, 'soot', 0, 1.5, 0.01, '틈새 그을음');
    R(seams, c, 'rimHeat', 0, 4, 0.01, '열 외피');
    R(seams, c, 'leadGlow', 0, 6, 0.01, '선단면 열기');
    R(seams, c, 'leadSharp', 0.5, 8, 0.05, '선단면 감쇠');
    R(seams, c, 'glow', 0, 4, 0.01, '발광');
    R(seams, c, 'envIntensity', 0, 3, 0.01, '반사');
    seams.addColor(c, 'colorRock').name('암석');
    seams.addColor(c, 'colorChar').name('숯');
    seams.addColor(c, 'colorCrack').name('틈새');
    seams.addColor(c, 'colorHot').name('백열');

    // The trail is a raymarched volume, so these are volume parameters, not
    // surface ones — see `materials/VolumetricFireMaterial.js`. `trailWidth`,
    // `trailPlume` and `trailSpan` set its shape; `trailSteps` is the cost dial.
    const trail = folder.addFolder('화염 궤적');
    R(trail, c, 'trailSpan', 0.5, 30, 0.1, '궤적 길이');
    R(trail, c, 'trailWidth', 0.02, 2, 0.01, '튜브 반지름');
    R(trail, c, 'trailHeadSize', 0.5, 5, 0.01, '촉 크기');
    R(trail, c, 'trailPlume', 0.3, 4, 0.01, '위쪽 늘어남');
    R(trail, c, 'trailWakeSpread', 0, 3, 0.01, '후류 확산');
    R(trail, c, 'trailRise', 0, 3, 0.01, '후류 상승');
    R(trail, c, 'trailDetachment', 0, 1.5, 0.01, '꼬리 파쇄');
    R(trail, c, 'trailSoftness', 0.05, 1, 0.01, '표면 부드러움');
    R(trail, c, 'trailBurnout', 0.05, 4, 0.05, '연소 종료 시간');
    R(trail, c, 'trailTailFade', 0.01, 0.8, 0.01, '꼬리 연소 종료');

    // Metre-scale lobes. Without these the outline stays a capsule no matter how
    // much fine turbulence is piled on top of it.
    const silhouette = trail.addFolder('외형');
    R(silhouette, c, 'trailBulge', 0, 1, 0.01, '로브 깊이');
    R(silhouette, c, 'trailBulgeScale', 0.05, 2, 0.01, '로브 (미터당)');
    R(silhouette, c, 'trailShred', 0, 4, 0.01, '가장자리 찢김');
    R(silhouette, c, 'trailWisps', 0, 2, 0.01, '실오라기');
    R(silhouette, c, 'trailLick', 0, 8, 0.05, '방사 전단');

    const motion = trail.addFolder('움직임 및 난류');
    R(motion, c, 'trailSpeed', 0, 12, 0.01, '흐름 속도');
    R(motion, c, 'trailBuoyancy', 0, 10, 0.01, '부력');
    R(motion, c, 'trailTurbulence', 0, 8, 0.01, '난류');
    R(motion, c, 'trailNoiseStrength', 0, 4, 0.01, '노이즈 강도');
    R(motion, c, 'trailNoiseFrequency', 0.1, 10, 0.01, '노이즈 주파수');
    R(motion, c, 'trailWarp', 0, 1.5, 0.01, '도메인 왜곡');
    R(motion, c, 'trailCurl', 0, 3, 0.01, '축 소용돌이');
    R(motion, c, 'trailVortex', 0, 2, 0.01, '소용돌이 말림');
    R(motion, c, 'trailRingFrequency', 0, 3, 0.01, '고리 (미터당)');
    R(motion, c, 'trailRingSpeed', 0, 10, 0.05, '고리 속도');
    R(motion, c, 'trailTongue', 0.2, 3, 0.01, '불꽃 늘어남');
    R(motion, c, 'trailStreamStretch', 0.2, 3, 0.01, '흐름 늘어남');
    R(motion, c, 'trailFlicker', 0, 2, 0.01, '깜빡임');
    R(motion, c, 'trailOctaves', 1, 5, 1, '디테일 옥타브');

    // The flame is shaded as a Planckian radiator: colour comes out of the
    // temperature. `trailPalette` blends toward the hand-authored stops instead.
    const heat = trail.addFolder('온도 및 복사열');
    R(heat, c, 'trailTempCore', 1000, 5000, 10, '중심 온도 (K)');
    R(heat, c, 'trailTempEdge', 1000, 4000, 10, '가장자리 온도 (K)');
    R(heat, c, 'trailEmissionCurve', 1, 6, 0.01, '복사 지수');
    R(heat, c, 'trailHeatFocus', 0.05, 3, 0.01, '열 초점');
    R(heat, c, 'trailHeatFalloff', 0.05, 4, 0.01, '열 감쇠');
    R(heat, c, 'trailHeatFollow', 0, 1, 0.01, '열 노이즈 추적');
    R(heat, c, 'trailTailHeat', 0, 1, 0.01, '잔류 가스 열기');
    R(heat, c, 'trailScatter', 0, 4, 0.01, '산란');
    R(heat, c, 'trailScatterFalloff', 0.2, 8, 0.05, '산란 감쇠');
    R(heat, c, 'trailPalette', 0, 1, 0.01, '팔레트 대 물리');
    heat.addColor(c, 'colorFlameMid').name('불꽃 중간');
    heat.addColor(c, 'colorFlameEdge').name('불꽃 가장자리');
    heat.addColor(c, 'colorFlameSmoke').name('불꽃 연기');

    const march = trail.addFolder('볼륨 렌더링');
    R(march, c, 'trailDensity', 0, 6, 0.01, '밀도');
    R(march, c, 'trailSoot', 0, 5, 0.01, '그을음 흡수');
    R(march, c, 'trailCoreClarity', 0, 1, 0.01, '중심 선명도');
    R(march, c, 'trailGlow', 0, 8, 0.01, '발광');
    R(march, c, 'trailOpacity', 0, 2, 0.01, '불투명도');
    R(march, c, 'trailSteps', 6, 72, 1, '레이마치 단계');

    const chunks = folder.addFolder('잔해');
    R(chunks, c, 'chunkCount', 0, 28, 1, '덩어리');
    R(chunks, c, 'chunkScale', 0.05, 0.8, 0.01, '덩어리 크기');
    R(chunks, c, 'chunkSpeed', 0, 30, 0.1, '투척 속도');
    R(chunks, c, 'chunkForward', 0, 2, 0.01, '전방 편향');
    R(chunks, c, 'chunkLoft', 0, 1.5, 0.01, '띄우기');
    R(chunks, c, 'chunkGravity', -50, -1, 0.1, '중력');
    R(chunks, c, 'chunkSpin', 0, 20, 0.1, '회전 비율');
    R(chunks, c, 'chunkCool', 0.1, 8, 0.05, '냉각 시간');
    R(chunks, c, 'chunkLinger', 0, 4, 0.05, '가라앉기 전 유지');
    R(chunks, c, 'chunkSink', 0.1, 4, 0.05, '가라앉는 시간');

    const embers = folder.addFolder('불씨 및 불꽃');
    R(embers, c, 'emberRate', 0, 900, 1, '불씨 비율');
    R(embers, c, 'emberSize', 0.005, 0.5, 0.005, '불씨 크기');
    R(embers, c, 'emberSpeed', 0, 15, 0.05, '불씨 속도');
    R(embers, c, 'emberLifetime', 0.1, 8, 0.05, '불씨 수명');
    R(embers, c, 'emberRise', -3, 8, 0.05, '불씨 상승');
    R(embers, c, 'emberGlow', 0, 4, 0.01, '불씨 발광');
    R(embers, c, 'emberTurbulence', 0, 3, 0.01, '불씨 난류');
    R(embers, c, 'sparkRate', 0, 900, 1, '불꽃 비율');
    R(embers, c, 'sparkSize', 0.005, 0.8, 0.005, '불꽃 크기');
    R(embers, c, 'sparkSpeed', 0, 40, 0.1, '불꽃 속도');
    R(embers, c, 'sparkLifetime', 0.05, 4, 0.01, '불꽃 수명');
    R(embers, c, 'sparkGravity', -50, 5, 0.1, '불꽃 중력');
    R(embers, c, 'sparkStretch', 0, 3, 0.01, '불꽃 늘어남');
    Editor.gradient(embers, c, 'colorEmber', '불씨 색');
    Editor.gradient(embers, c, 'colorSpark', '불꽃 색');

    const dust = folder.addFolder('연기 및 모래');
    R(dust, c, 'smokeRate', 0, 500, 1, '연기 비율');
    R(dust, c, 'smokeSize', 0.05, 4, 0.01, '연기 크기');
    R(dust, c, 'smokeSpeed', 0, 8, 0.05, '연기 속도');
    R(dust, c, 'smokeLifetime', 0.2, 10, 0.05, '연기 수명');
    R(dust, c, 'smokeOpacity', 0, 1, 0.005, '연기 불투명도');
    R(dust, c, 'smokeRise', -2, 5, 0.01, '연기 상승');
    R(dust, c, 'debrisSize', 0.005, 0.4, 0.005, '모래 크기');
    R(dust, c, 'debrisSpeed', 0, 25, 0.1, '모래 속도');
    R(dust, c, 'debrisLifetime', 0.1, 5, 0.05, '모래 수명');
    R(dust, c, 'debrisGravity', -50, 0, 0.1, '모래 중력');
    Editor.gradient(dust, c, 'colorSmoke', '연기 색');
    Editor.gradient(dust, c, 'colorDebris', '모래 색');

    const cracks = folder.addFolder('녹은 균열');
    R(cracks, c, 'fissureRadius', 0.5, 16, 0.05, '도달');
    R(cracks, c, 'fissureLife', 0.5, 25, 0.1, '수명');
    R(cracks, c, 'fissureArms', 2, 12, 1, '주 균열');
    R(cracks, c, 'fissureWander', 0, 6, 0.05, '구불거림');
    R(cracks, c, 'fissureBranches', 0, 1, 0.01, '가지 밀도');
    R(cracks, c, 'fissureBranchLength', 0, 1, 0.01, '가지 길이');
    R(cracks, c, 'fissureWidth', 0.01, 1, 0.005, '틈새 폭');
    R(cracks, c, 'fissureHeat', 0, 4, 0.01, '중심 열기');
    R(cracks, c, 'fissurePulse', 0, 5, 0.01, '열파 속도');
    R(cracks, c, 'fissureGrowth', 0.5, 40, 0.1, '확산 속도');
    R(cracks, c, 'fissureRockSize', 0, 1.2, 0.01, '가장자리 잔해 크기');

    const ground = folder.addFolder('분화구');
    R(ground, c, 'scorchRadius', 0.2, 12, 0.05, '그을음 반지름');
    R(ground, c, 'scorchLife', 0.5, 20, 0.1, '그을음 수명');
    R(ground, c, 'scorchIntensity', 0, 2, 0.01, '그을음 강도');
    R(ground, c, 'shockRadius', 0.5, 25, 0.1, '충격파 반지름');
    ground.addColor(c, 'colorScorch').name('그을음');
    ground.addColor(c, 'colorShockA').name('충격파 고리');
    ground.addColor(c, 'colorShockB').name('충격파 마루');

    const impact = folder.addFolder('발사 및 폭발');
    R(impact, c, 'muzzleSize', 0, 6, 0.05, '발사 플레어'); // 0 = no flare
    R(impact, c, 'muzzleIntensity', 0, 5, 0.01, '발사 강도');
    R(impact, c, 'castFlash', 0, 2, 0.01, '방출 섬광');
    impact.addColor(c, 'colorCastFlash').name('방출 섬광 색');
    R(impact, c, 'burstSize', 0.2, 18, 0.05, '화염구 크기');
    R(impact, c, 'burstIntensity', 0, 5, 0.01, '화염구 강도');
    R(impact, c, 'burstTurbulence', 0, 4, 0.01, '화염구 난류');
    R(impact, c, 'burstEmbers', 0, 800, 1, '폭발 불씨');
    R(impact, c, 'burstSparks', 0, 600, 1, '폭발 불꽃');
    R(impact, c, 'burstDebris', 0, 400, 1, '폭발 모래');
    R(impact, c, 'burstSmoke', 0, 300, 1, '폭발 연기');
    R(impact, c, 'impactShake', 0, 3, 0.01, '흔들림');
    R(impact, c, 'shakeDuration', 0.1, 4, 0.01, '흔들림 지속');
    R(impact, c, 'impactFlash', 0, 2, 0.01, '화면 섬광');
    R(impact, c, 'rumble', 0, 0.5, 0.005, '이동 진동');
    impact.addColor(c, 'colorFlash').name('충돌 섬광 색');

    const light = folder.addFolder('동적 조명');
    R(light, c, 'lightIntensity', 0, 120, 0.5, '조명 강도');
    R(light, c, 'lightRadius', 0.5, 50, 0.1, '조명 반지름');
    R(light, c, 'lightFlicker', 0, 1, 0.01, '조명 꺼짐');
    R(light, c, 'lightFlickerSpeed', 1, 60, 0.5, '꺼짐 비율');
    light.addColor(c, 'lightColor').name('조명 색');

    this.meteorFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Nova Beam.
   *
   * Every control here is read by a shader on the frame it changes, so the whole
   * folder reshapes a beam that is already burning — pause with **P** halfway
   * through the hold and the entire panel stays live. The ones worth reaching
   * for first are `radius` and `flare` (how heavy the column reads), `charge`
   * and `lifetime` (the wind-up and the hold, which are what make this ability
   * different from the other three), `coils` / `coilTurns` (the ribbons around
   * it) and `streak` / `flowSpeed` (how hard the energy streams downrange).
   */
  _buildBeam() {
    const folder = this.gui.addFolder('✦ 노바 빔');
    const c = settings.beam;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'range', 2, 60, 0.1, '최대 사거리');
    R(cast, c, 'minRange', 0, 10, 0.1, '최소 사거리');
    R(cast, c, 'charge', 0, 3, 0.01, '예비 시간');
    R(cast, c, 'speed', 5, 400, 1, '이동 속도');
    R(cast, c, 'lifetime', 0.05, 8, 0.01, '연소 시간');
    R(cast, c, 'fadeTime', 0.05, 4, 0.01, '붕괴 시간');
    R(cast, c, 'cooldown', 0, 6, 0.05, '재사용 대기시간');
    Editor.castAnimation(cast, c);

    const anchor = folder.addFolder('양손에서 나가는 지점');
    R(anchor, c, 'handHeight', 0, 3, 0.01, '손 높이');
    R(anchor, c, 'handForward', -1, 3, 0.01, '손 전방');
    R(anchor, c, 'handSide', -1.5, 1.5, 0.01, '손 좌우');
    R(anchor, c, 'endHeight', 0, 4, 0.01, '목표 높이');

    const column = folder.addFolder('기둥');
    R(column, c, 'radiusNear', 0.01, 3, 0.01, '손 반지름');
    R(column, c, 'radius', 0.02, 5, 0.01, '목표 반지름');
    R(column, c, 'radiusCurve', 0.1, 4, 0.01, '반지름 곡선');
    R(column, c, 'flare', 0, 4, 0.01, '목표 플레어');
    R(column, c, 'flareWidth', 0.02, 1, 0.01, '플레어 폭');
    R(column, c, 'throb', 0, 0.6, 0.005, '압력 파동');
    R(column, c, 'throbScale', 0, 12, 0.1, '파동 (길이당)');
    R(column, c, 'throbSpeed', 0, 10, 0.05, '파동 속도');
    R(column, c, 'wander', 0, 1, 0.005, '축 흔들림');
    R(column, c, 'wanderScale', 0.1, 6, 0.05, '표류 규모');
    R(column, c, 'wanderSpeed', 0, 5, 0.01, '표류 속도');

    // The three tube passes. `coreSharp` and `shellRim` are the pair that decide
    // whether the beam reads as a solid rod or as a lit pipe — see
    // `materials/BeamMaterial.js`.
    const layers = folder.addFolder('중심·외피·후광');
    R(layers, c, 'coreWidth', 0.05, 1.5, 0.01, '중심 폭');
    R(layers, c, 'coreSharp', 0.1, 8, 0.05, '중심 초점');
    R(layers, c, 'coreFill', 0, 3, 0.01, '중심 채우기');
    R(layers, c, 'shellWidth', 0.2, 3, 0.01, '외피 폭');
    R(layers, c, 'shellRim', 0, 3, 0.01, '외피 가장자리');
    R(layers, c, 'shellFill', 0, 1.5, 0.01, '외피 채우기');
    R(layers, c, 'shellOpacity', 0, 2, 0.01, '외피 불투명도');
    R(layers, c, 'edgePower', 0.2, 8, 0.05, '림 감쇠');
    R(layers, c, 'haloWidth', 0.5, 8, 0.05, '후광 폭');
    R(layers, c, 'haloRim', 0.5, 10, 0.05, '후광 감쇠');
    R(layers, c, 'haloOpacity', 0, 2, 0.01, '후광 불투명도');

    const surface = folder.addFolder('표면 및 흐름');
    R(surface, c, 'ripple', 0, 1, 0.005, '표면 잔물결');
    R(surface, c, 'rippleBands', 0.1, 8, 0.05, '주변 잔물결');
    R(surface, c, 'rippleScale', 0.1, 12, 0.05, '세로 잔물결');
    R(surface, c, 'rippleSpeed', 0, 12, 0.05, '잔물결 기어감');
    R(surface, c, 'streak', 0, 3, 0.01, '필라멘트');
    R(surface, c, 'streakSharp', 0, 1, 0.01, '필라멘트 선명도');
    R(surface, c, 'streakScale', 0.2, 20, 0.1, '필라멘트 (길이당)');
    R(surface, c, 'streakBands', 0.2, 10, 0.05, '주변 필라멘트');
    R(surface, c, 'streakGlow', 0, 4, 0.01, '필라멘트 열기');
    R(surface, c, 'flowSpeed', 0, 30, 0.1, '흐름 속도');
    R(surface, c, 'mouthGlow', 0, 6, 0.05, '발사구 열기');
    R(surface, c, 'mouthLength', 0.005, 0.5, 0.005, '발사구 길이');
    R(surface, c, 'tipGlow', 0, 6, 0.05, '연소 끝 열기');
    R(surface, c, 'tipLength', 0.005, 0.5, 0.005, '연소 끝 길이');
    R(surface, c, 'softFade', 0.02, 3, 0.01, '부드러운 교차');

    const material = folder.addFolder('광선 색상');
    material.addColor(c, 'colorCore').name('축');
    material.addColor(c, 'colorInner').name('내부');
    material.addColor(c, 'colorOuter').name('외피');
    material.addColor(c, 'colorHalo').name('후광');
    R(material, c, 'glow', 0, 8, 0.01, '발광');
    R(material, c, 'opacity', 0, 2, 0.01, '불투명도');

    const coils = folder.addFolder('코일');
    R(coils, c, 'coils', 0, 8, 1, '리본');
    R(coils, c, 'coilTurns', -8, 8, 0.05, '길이당 회전');
    R(coils, c, 'coilSpeed', -6, 6, 0.01, '구름 속도');
    R(coils, c, 'coilRadius', 0.2, 4, 0.01, '탑승 반지름');
    R(coils, c, 'coilFlare', 0, 4, 0.01, '목표 플레어');
    R(coils, c, 'coilWidth', 0.005, 0.6, 0.005, '양손 폭');
    R(coils, c, 'coilWidthTip', 0.05, 6, 0.01, '목표 폭');
    R(coils, c, 'coilSharp', 0.2, 8, 0.05, '가장자리 감쇠');
    R(coils, c, 'coilPulse', 0, 1, 0.01, '충전 맥동');
    R(coils, c, 'coilPulseFreq', 0, 12, 0.05, '맥동 (길이당)');
    R(coils, c, 'coilPulseSpeed', -8, 8, 0.05, '맥동 속도');
    // Headroom above the shipped values on purpose — they sit high, and a
    // control that starts pinned to its own maximum can only ever come down.
    R(coils, c, 'coilGlow', 0, 14, 0.01, '발광');
    R(coils, c, 'coilOpacity', 0, 3, 0.01, '불투명도');
    coils.addColor(c, 'colorCoil').name('리본 중심');
    coils.addColor(c, 'colorCoilEdge').name('리본 가장자리');

    const rings = folder.addFolder('충격 디스크');
    R(rings, c, 'rings', 0, 12, 1, '디스크');
    R(rings, c, 'ringSpeed', 0, 6, 0.01, '발동 (초당)');
    R(rings, c, 'ringInner', 0.2, 4, 0.01, '내부 입술');
    R(rings, c, 'ringOuter', 0.3, 6, 0.01, '외부 입술');
    R(rings, c, 'ringSwell', 0, 3, 0.01, '전방 부풀기');
    R(rings, c, 'ringFade', 0, 1, 0.01, '전방 페이드');
    R(rings, c, 'ringSharp', 0.2, 8, 0.05, '띠 선명도');
    R(rings, c, 'ringGlow', 0, 8, 0.01, '발광');
    R(rings, c, 'ringOpacity', 0, 2, 0.01, '불투명도');
    rings.addColor(c, 'colorRing').name('디스크 색');

    const orb = folder.addFolder('충전');
    R(orb, c, 'orbSize', 0.02, 2, 0.01, '구체 반지름');
    R(orb, c, 'orbThrob', 0, 0.6, 0.005, '구체 맥동');
    R(orb, c, 'orbThrobSpeed', 0, 20, 0.1, '맥동 비율');
    R(orb, c, 'orbTurbulence', 0, 1, 0.01, '표면 난류');
    R(orb, c, 'orbScale', 0.2, 8, 0.05, '표면 규모');
    R(orb, c, 'orbFlow', 0, 5, 0.01, '표면 기어감');
    R(orb, c, 'orbBands', 0.5, 15, 0.1, '필라멘트 규모');
    R(orb, c, 'orbRim', 0.2, 6, 0.05, '림 감쇠');
    R(orb, c, 'orbGlow', 0, 8, 0.01, '발광');
    R(orb, c, 'orbOpacity', 0, 2, 0.01, '불투명도');
    R(orb, c, 'intakeRate', 0, 900, 1, '흡입 비율');
    R(orb, c, 'intakeRadius', 0.2, 8, 0.05, '흡입 반지름');
    R(orb, c, 'intakeSpeed', 0.5, 25, 0.1, '흡입 속도');
    R(orb, c, 'chargeShake', 0, 0.5, 0.005, '예비 진동');

    const ground = folder.addFolder('바닥 효과');
    R(ground, c, 'scorchRate', 0.05, 8, 0.05, '화상 (미터당)');
    R(ground, c, 'scorchRadius', 0.05, 4, 0.05, '연소 반지름');
    R(ground, c, 'scorchLife', 0.5, 20, 0.1, '연소 수명');
    R(ground, c, 'scorchIntensity', 0, 2, 0.01, '연소 강도');
    R(ground, c, 'dustRate', 0, 20, 0.1, '먼지 고리 (초당)');
    R(ground, c, 'dustRadius', 0.2, 10, 0.05, '먼지 고리 반지름');
    R(ground, c, 'dustLife', 0.1, 5, 0.05, '먼지 고리 수명');
    R(ground, c, 'shockRate', 0, 20, 0.1, '충격 고리 (초당)');
    R(ground, c, 'shockRadius', 0.5, 25, 0.1, '충격파 반지름');
    ground.addColor(c, 'colorScorch').name('그을음');
    ground.addColor(c, 'colorEmber').name('불씨');
    ground.addColor(c, 'colorDustA').name('먼지');
    ground.addColor(c, 'colorDustB').name('먼지 마루');
    ground.addColor(c, 'colorShockA').name('충격파 고리');
    ground.addColor(c, 'colorShockB').name('충격파 마루');

    const sparks = folder.addFolder('불꽃 및 미립자');
    R(sparks, c, 'sparkRate', 0, 1200, 1, '불꽃 비율');
    R(sparks, c, 'sparkSize', 0.005, 0.8, 0.005, '불꽃 크기');
    R(sparks, c, 'sparkSpeed', 0, 40, 0.1, '불꽃 속도');
    R(sparks, c, 'sparkLifetime', 0.05, 4, 0.01, '불꽃 수명');
    R(sparks, c, 'sparkGravity', -50, 5, 0.1, '불꽃 중력');
    R(sparks, c, 'sparkStretch', 0, 3, 0.01, '불꽃 늘어남');
    R(sparks, c, 'sparkForward', 0, 4, 0.01, '전방 끌림');
    R(sparks, c, 'moteRate', 0, 600, 1, '미립자 비율');
    R(sparks, c, 'moteSize', 0.005, 0.4, 0.005, '미립자 크기');
    R(sparks, c, 'moteSpeed', 0, 12, 0.05, '미립자 속도');
    R(sparks, c, 'moteLifetime', 0.1, 8, 0.05, '미립자 수명');
    R(sparks, c, 'moteRise', -3, 8, 0.05, '미립자 상승');
    R(sparks, c, 'moteTurbulence', 0, 3, 0.01, '미립자 난류');
    Editor.gradient(sparks, c, 'colorSpark', '불꽃 색');
    Editor.gradient(sparks, c, 'colorMote', '미립자 색');

    const dust = folder.addFolder('수증기 및 파편');
    R(dust, c, 'smokeRate', 0, 500, 1, '수증기 비율');
    R(dust, c, 'smokeSize', 0.05, 4, 0.01, '수증기 크기');
    R(dust, c, 'smokeSpeed', 0, 8, 0.05, '수증기 속도');
    R(dust, c, 'smokeLifetime', 0.2, 8, 0.05, '수증기 수명');
    R(dust, c, 'smokeOpacity', 0, 1, 0.005, '수증기 불투명도');
    R(dust, c, 'smokeRise', -2, 4, 0.01, '수증기 상승');
    R(dust, c, 'debrisRate', 0, 300, 1, '잔해 비율');
    R(dust, c, 'debrisSize', 0.005, 0.4, 0.005, '잔해 크기');
    R(dust, c, 'debrisSpeed', 0, 25, 0.1, '잔해 속도');
    R(dust, c, 'debrisLifetime', 0.1, 5, 0.05, '잔해 수명');
    R(dust, c, 'debrisGravity', -50, 0, 0.1, '잔해 중력');
    Editor.gradient(dust, c, 'colorSmoke', '수증기 색');
    Editor.gradient(dust, c, 'colorDebris', '잔해 색');

    const impact = folder.addFolder('방출·충돌·연소');
    R(impact, c, 'muzzleSize', 0.05, 8, 0.05, '방출 껍질');
    R(impact, c, 'muzzleIntensity', 0, 5, 0.01, '방출 강도');
    R(impact, c, 'castFlash', 0, 2, 0.01, '방출 섬광');
    impact.addColor(c, 'colorCastFlash').name('방출 섬광 색');
    R(impact, c, 'burstSize', 0.2, 18, 0.05, '충돌 껍질');
    R(impact, c, 'burstIntensity', 0, 5, 0.01, '충돌 강도');
    R(impact, c, 'burstSparks', 0, 800, 1, '충돌 불꽃');
    R(impact, c, 'burstDebris', 0, 400, 1, '충돌 잔해');
    R(impact, c, 'pulseRate', 0, 12, 0.1, '연소 껍질 (초당)');
    R(impact, c, 'pulseSize', 0.1, 10, 0.05, '연소 껍질 크기');
    R(impact, c, 'pulseIntensity', 0, 5, 0.01, '연소 껍질 강도');
    R(impact, c, 'splashRate', 0, 900, 1, '역튀김 비율');
    R(impact, c, 'impactShake', 0, 3, 0.01, '흔들림');
    R(impact, c, 'shakeDuration', 0.1, 4, 0.01, '흔들림 지속');
    R(impact, c, 'impactFlash', 0, 2, 0.01, '화면 섬광');
    R(impact, c, 'rumble', 0, 0.5, 0.005, '이동 진동');
    R(impact, c, 'burnShake', 0, 0.5, 0.005, '연소 진동');
    impact.addColor(c, 'colorBurstA').name('충돌 외피');
    impact.addColor(c, 'colorBurstB').name('충돌 본체');
    impact.addColor(c, 'colorBurstC').name('충돌 아크');
    impact.addColor(c, 'colorFlash').name('충돌 섬광 색');

    const light = folder.addFolder('동적 조명');
    R(light, c, 'lightIntensity', 0, 120, 0.5, '광선 강도');
    R(light, c, 'lightRadius', 0.5, 60, 0.1, '광선 반지름');
    R(light, c, 'lightPulse', 0, 1, 0.01, '웅웅 깊이');
    R(light, c, 'lightPulseSpeed', 0, 30, 0.1, '웅웅 비율');
    R(light, c, 'muzzleLightIntensity', 0, 120, 0.5, '손 강도');
    R(light, c, 'muzzleLightRadius', 0.5, 40, 0.1, '손 반지름');
    light.addColor(c, 'lightColor').name('조명 색');

    this.beamFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Voltaic Snare — the first far cast.
   *
   * `zoneRadius` is the control that matters most here and the only one that
   * reaches outside the ability: it is read by the circle indicator *and* by
   * the tendrils, the rim arcs and the burnt field, so dragging it re-scales
   * what you aim with and what you get at the same time. After that,
   * `snapTime` and `height` carry the moment the trap opens, and `tendrils` /
   * `rimArcs` / `strands` decide how much of the footprint is actually lit.
   */
  _buildSnare() {
    const folder = this.gui.addFolder('◈ 볼타이크 스네어');
    const c = settings.snare;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'zoneRadius', 0.5, 14, 0.05, '범위 반지름');
    R(cast, c, 'range', 2, 50, 0.1, '최대 사거리');
    R(cast, c, 'minRange', 0, 10, 0.1, '최소 사거리');
    R(cast, c, 'speed', 5, 300, 1, '전류 속도');
    R(cast, c, 'snapTime', 0.02, 1.5, 0.01, '확산 시간');
    R(cast, c, 'lifetime', 0.1, 12, 0.05, '유지 시간');
    R(cast, c, 'fadeTime', 0.05, 4, 0.01, '붕괴 시간');
    R(cast, c, 'cooldown', 0, 8, 0.05, '재사용 대기시간');
    Editor.castAnimation(cast, c);

    const leash = folder.addFolder('전류 끈');
    R(leash, c, 'handHeight', 0, 3, 0.01, '손 높이');
    R(leash, c, 'handForward', -1, 3, 0.01, '손 전방');
    R(leash, c, 'handSide', -1.5, 1.5, 0.01, '손 좌우');
    R(leash, c, 'leashStrands', 0, 6, 1, '필라멘트');
    R(leash, c, 'leashSag', -3, 3, 0.01, '중간 휨');
    R(leash, c, 'leashSpread', 0, 2, 0.01, '부채꼴');
    R(leash, c, 'leashCling', 0, 1.5, 0.01, '끝 높이');
    R(leash, c, 'leashKink', 0, 2, 0.01, '꺾임 진폭');
    R(leash, c, 'leashWidth', 0.1, 4, 0.01, '리본 폭');

    const column = folder.addFolder('기둥');
    R(column, c, 'strands', 0, 16, 1, '필라멘트');
    R(column, c, 'height', 0.5, 24, 0.1, '높이');
    R(column, c, 'heightCurve', 0.1, 4, 0.01, '상승 곡선');
    R(column, c, 'throat', 0.005, 1, 0.005, '목 (범위 대비)');
    R(column, c, 'columnSpread', 0.01, 1, 0.005, '위 (범위 대비)');
    R(column, c, 'columnCurve', 0.1, 5, 0.01, '개방 곡선');
    R(column, c, 'columnFlare', 0, 1, 0.005, '위쪽 플레어');
    R(column, c, 'columnTwist', -4, 4, 0.01, '높이당 비틀림');
    R(column, c, 'columnSpin', -4, 4, 0.01, '회전');
    R(column, c, 'columnKink', 0, 2, 0.01, '꺾임 진폭');
    R(column, c, 'columnWidth', 0.1, 6, 0.01, '리본 폭');
    R(column, c, 'columnTaper', 0.05, 2, 0.01, '위쪽 테이퍼');

    const tendrils = folder.addFolder('덩굴손');
    R(tendrils, c, 'tendrils', 0, 20, 1, '덩굴손');
    R(tendrils, c, 'tendrilInner', 0, 1, 0.005, '시작 (범위 대비)');
    R(tendrils, c, 'tendrilReach', 0.05, 1.6, 0.01, '끝 (범위 대비)');
    R(tendrils, c, 'tendrilCurve', 0.1, 4, 0.01, '도달 곡선');
    R(tendrils, c, 'tendrilWander', 0, 4, 0.01, '방향 전환');
    R(tendrils, c, 'tendrilArch', 0, 3, 0.01, '바닥 뜀');
    R(tendrils, c, 'tendrilHug', 0.005, 1, 0.005, '바닥 간격');
    R(tendrils, c, 'tendrilSpin', -2, 2, 0.005, '부채꼴 회전');
    R(tendrils, c, 'tendrilKink', 0, 2, 0.01, '꺾임 진폭');
    R(tendrils, c, 'tendrilWidth', 0.05, 4, 0.01, '리본 폭');
    R(tendrils, c, 'tendrilDim', 0, 1, 0.01, '기둥 대비 어둡기');

    const rim = folder.addFolder('가장자리 아크');
    R(rim, c, 'rimArcs', 0, 14, 1, '아크');
    R(rim, c, 'rimSpan', 0.01, 1, 0.005, '호 범위 (원 대비)');
    R(rim, c, 'rimSpeed', -3, 3, 0.01, '이동 속도');
    R(rim, c, 'rimHeight', 0, 3, 0.01, '뜀 높이');
    R(rim, c, 'rimJitter', 0, 1, 0.01, '방사 흔들림');
    R(rim, c, 'rimKink', 0, 2, 0.01, '꺾임 진폭');
    R(rim, c, 'rimWidth', 0.05, 4, 0.01, '리본 폭');
    R(rim, c, 'rimDim', 0, 1, 0.01, '기둥 대비 어둡기');

    const shape = folder.addFolder('필라멘트 및 깜빡임');
    R(shape, c, 'jitter', 0, 4, 0.01, '꺾임 마스터');
    R(shape, c, 'jitterScale', 0.05, 8, 0.01, '꺾임 (미터당)');
    R(shape, c, 'octaves', 1, 5, 1, '옥타브');
    R(shape, c, 'jitterFalloff', 0.1, 0.95, 0.01, '옥타브 감쇠');
    R(shape, c, 'crawl', -20, 20, 0.1, '꺾임 기어감');
    R(shape, c, 'pinch', 0.01, 0.5, 0.005, '끝 조임');
    R(shape, c, 'restrike', 0.5, 90, 0.5, '재타격 (초당)');
    R(shape, c, 'flicker', 0, 1, 0.01, '밝기 끊김');
    R(shape, c, 'flickerSpeed', 1, 120, 1, '끊김 비율');
    R(shape, c, 'strandFlash', 0, 1, 0.01, '필라멘트 깜빡임');

    const ribbon = folder.addFolder('리본 및 색상');
    R(ribbon, c, 'width', 0.005, 0.4, 0.001, '필라멘트 폭');
    R(ribbon, c, 'coreSharp', 0.5, 12, 0.05, '중심 선명도');
    R(ribbon, c, 'glowWidth', 1, 30, 0.1, '후광 폭');
    R(ribbon, c, 'glowFalloff', 0.2, 8, 0.05, '후광 감쇠');
    R(ribbon, c, 'glowOpacity', 0, 2, 0.01, '후광 불투명도');
    R(ribbon, c, 'softFade', 0.02, 3, 0.01, '부드러운 교차');
    R(ribbon, c, 'glow', 0, 8, 0.01, '발광');
    R(ribbon, c, 'opacity', 0, 2, 0.01, '불투명도');
    ribbon.addColor(c, 'colorCore').name('중심');
    ribbon.addColor(c, 'colorInner').name('내부');
    ribbon.addColor(c, 'colorOuter').name('외부');
    ribbon.addColor(c, 'colorHalo').name('후광');

    const field = folder.addFolder('바닥 전장');
    R(field, c, 'fieldBoundary', 0.02, 2, 0.01, '띠 두께');
    R(field, c, 'fieldBoundaryGlow', 0, 8, 0.05, '띠 발광');
    R(field, c, 'fieldFill', 0, 2, 0.01, '내부 채우기');
    R(field, c, 'fieldFalloff', 0.1, 5, 0.05, '채우기 감쇠');
    R(field, c, 'fieldVeins', 0, 3, 0.01, '탄 흔적');
    R(field, c, 'fieldVeinScale', 0.1, 8, 0.05, '맥 (미터당)');
    R(field, c, 'fieldVeinSharp', 0, 1, 0.01, '맥 선명도');
    R(field, c, 'fieldWarp', 0, 2, 0.01, '도메인 왜곡');
    R(field, c, 'fieldCrawl', -4, 4, 0.01, '맥 기어감');
    R(field, c, 'fieldRings', 0, 12, 0.1, '압력 고리');
    R(field, c, 'fieldRingSpeed', -6, 6, 0.01, '고리 속도');
    R(field, c, 'fieldSpokes', 0, 96, 1, '경계 눈금');
    R(field, c, 'fieldSpokeLength', 0.05, 3, 0.01, '눈금 길이');
    R(field, c, 'fieldSpin', -2, 2, 0.005, '눈금 회전');
    R(field, c, 'fieldCore', 0, 4, 0.01, '중심 웅덩이');
    R(field, c, 'fieldCoreSize', 0.02, 1, 0.005, '웅덩이 크기 (범위 대비)');
    R(field, c, 'fieldPulse', 0, 1, 0.01, '맥동');
    R(field, c, 'fieldPulseSpeed', 0, 10, 0.05, '맥동 속도');
    R(field, c, 'fieldOpacity', 0, 2, 0.01, '불투명도');
    R(field, c, 'fieldHeight', 0.005, 0.4, 0.005, '부유 높이');
    field.addColor(c, 'colorField').name('전장');
    field.addColor(c, 'colorFieldEdge').name('띠 및 웅덩이');

    const ground = folder.addFolder('바닥 화상');
    R(ground, c, 'arcRate', 0, 30, 0.1, '가장자리 화상 (초당)');
    R(ground, c, 'arcRadius', 0.1, 8, 0.05, '연소 반지름');
    R(ground, c, 'arcLife', 0.05, 5, 0.05, '연소 수명');
    R(ground, c, 'arcIntensity', 0, 3, 0.01, '연소 강도');
    R(ground, c, 'arcBranches', 0, 3, 0.01, '가지 디테일');
    R(ground, c, 'trailRate', 0.05, 8, 0.05, '전류 화상 (미터당)');
    R(ground, c, 'scorchRadius', 0.05, 8, 0.05, '그을음 반지름');
    R(ground, c, 'scorchLife', 0.5, 20, 0.1, '그을음 수명');
    R(ground, c, 'scorchIntensity', 0, 2, 0.01, '그을음 강도');
    R(ground, c, 'shockRadius', 0.5, 25, 0.1, '충격파 반지름');
    R(ground, c, 'ringRate', 0, 12, 0.1, '먼지 고리 (초당)');
    ground.addColor(c, 'colorArc').name('화상');
    ground.addColor(c, 'colorEmber').name('불씨');
    ground.addColor(c, 'colorScorch').name('그을음');
    ground.addColor(c, 'colorShockA').name('충격파 고리');
    ground.addColor(c, 'colorShockB').name('충격파 마루');

    const sparks = folder.addFolder('불꽃 및 상승기류');
    R(sparks, c, 'sparkRate', 0, 1200, 1, '불꽃 비율');
    R(sparks, c, 'sparkSize', 0.005, 0.8, 0.005, '불꽃 크기');
    R(sparks, c, 'sparkSpeed', 0, 40, 0.1, '불꽃 속도');
    R(sparks, c, 'sparkLifetime', 0.05, 4, 0.01, '불꽃 수명');
    R(sparks, c, 'sparkGravity', -50, 5, 0.1, '불꽃 중력');
    R(sparks, c, 'sparkStretch', 0, 3, 0.01, '불꽃 늘어남');
    R(sparks, c, 'updraftRate', 0, 900, 1, '상승기류 비율');
    R(sparks, c, 'updraftSize', 0.005, 0.4, 0.005, '상승기류 크기');
    R(sparks, c, 'updraftSpeed', 0, 25, 0.1, '흡입 속도');
    R(sparks, c, 'updraftLifetime', 0.1, 8, 0.05, '상승기류 수명');
    R(sparks, c, 'updraftRise', -5, 25, 0.1, '리프트');
    R(sparks, c, 'updraftInset', 0, 0.95, 0.01, '흡입 안쪽');
    R(sparks, c, 'updraftTurbulence', 0, 3, 0.01, '상승기류 소용돌이');
    Editor.gradient(sparks, c, 'colorSpark', '불꽃 색');
    Editor.gradient(sparks, c, 'colorUpdraft', '상승기류 색');

    const dust = folder.addFolder('연기 및 파편');
    R(dust, c, 'smokeRate', 0, 500, 1, '연기 비율');
    R(dust, c, 'smokeSize', 0.05, 4, 0.01, '연기 크기');
    R(dust, c, 'smokeSpeed', 0, 8, 0.05, '연기 속도');
    R(dust, c, 'smokeLifetime', 0.2, 8, 0.05, '연기 수명');
    R(dust, c, 'smokeOpacity', 0, 1, 0.005, '연기 불투명도');
    R(dust, c, 'smokeRise', -2, 4, 0.01, '연기 상승');
    R(dust, c, 'debrisRate', 0, 300, 1, '잔해 비율');
    R(dust, c, 'debrisSize', 0.005, 0.4, 0.005, '잔해 크기');
    R(dust, c, 'debrisSpeed', 0, 25, 0.1, '잔해 속도');
    R(dust, c, 'debrisLifetime', 0.1, 5, 0.05, '잔해 수명');
    R(dust, c, 'debrisGravity', -50, 0, 0.1, '잔해 중력');
    Editor.gradient(dust, c, 'colorSmoke', '연기 색');
    Editor.gradient(dust, c, 'colorDebris', '잔해 색');

    const impact = folder.addFolder('투척·확산·유지');
    R(impact, c, 'muzzleSize', 0.05, 6, 0.05, '발사구 크기');
    R(impact, c, 'muzzleIntensity', 0, 5, 0.01, '발사구 강도');
    R(impact, c, 'castFlash', 0, 2, 0.01, '방출 섬광');
    R(impact, c, 'burstSize', 0.2, 14, 0.05, '확산 껍질 크기');
    R(impact, c, 'burstIntensity', 0, 5, 0.01, '확산 껍질 강도');
    R(impact, c, 'burstSparks', 0, 600, 1, '확산 불꽃');
    R(impact, c, 'burstDebris', 0, 300, 1, '확산 잔해');
    R(impact, c, 'pulseRate', 0, 12, 0.1, '유지 껍질 (초당)');
    R(impact, c, 'pulseSize', 0.1, 10, 0.05, '유지 껍질 크기');
    R(impact, c, 'pulseIntensity', 0, 5, 0.01, '유지 껍질 강도');
    R(impact, c, 'impactShake', 0, 3, 0.01, '흔들림');
    R(impact, c, 'shakeDuration', 0.1, 4, 0.01, '흔들림 지속');
    R(impact, c, 'holdShake', 0, 0.5, 0.005, '유지 진동');
    R(impact, c, 'impactFlash', 0, 2, 0.01, '화면 섬광');
    R(impact, c, 'rumble', 0, 0.5, 0.005, '이동 진동');
    impact.addColor(c, 'colorCastFlash').name('방출 섬광 색');
    impact.addColor(c, 'colorBurstA').name('껍질');
    impact.addColor(c, 'colorBurstB').name('껍질 본체');
    impact.addColor(c, 'colorBurstC').name('껍질 아크');
    impact.addColor(c, 'colorFlash').name('확산 섬광 색');

    const light = folder.addFolder('동적 조명');
    R(light, c, 'lightIntensity', 0, 120, 0.5, '조명 강도');
    R(light, c, 'lightRadius', 0.5, 50, 0.1, '조명 반지름');
    R(light, c, 'lightHeight', 0, 1, 0.01, '기둥 높이');
    R(light, c, 'lightFlicker', 0, 1, 0.01, '조명 꺼짐');
    R(light, c, 'lightFlickerSpeed', 1, 90, 1, '꺼짐 비율');
    light.addColor(c, 'lightColor').name('조명 색');

    this.snareFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Glacial Crown — the far cast that comes out of the floor.
   *
   * `zoneRadius` is again the control that reaches outside the ability: it is
   * read by the circle indicator *and* by the ring of blades, the sheet and the
   * curtain, so dragging it re-scales what you aim with and what you get
   * together. After that the two groups that carry the cast are **The bloom**,
   * where `sweepTime` decides how the ring closes, and **Freeze front &
   * shatter**, which is how the ice arrives and how it leaves.
   */
  _buildGlacier() {
    const folder = this.gui.addFolder('❆ 글레이셜 크라운');
    const c = settings.glacier;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'zoneRadius', 0.5, 14, 0.05, '범위 반지름');
    R(cast, c, 'range', 2, 50, 0.1, '최대 사거리');
    R(cast, c, 'minRange', 0, 10, 0.1, '최소 사거리');
    R(cast, c, 'speed', 5, 200, 1, '전선 속도');
    R(cast, c, 'snapTime', 0.02, 1.5, 0.01, '동결 시간');
    R(cast, c, 'lifetime', 0.2, 14, 0.05, '유지 시간');
    R(cast, c, 'shatterDelay', 0, 4, 0.01, '파쇄 전 지연');
    R(cast, c, 'shatterStagger', 0, 3, 0.01, '파쇄 시차');
    R(cast, c, 'sinkTime', 0.05, 5, 0.01, '붕괴 시간');
    R(cast, c, 'cooldown', 0, 8, 0.05, '재사용 대기시간');
    Editor.castAnimation(cast, c);

    const hand = folder.addFolder('전선이 손을 떠나는 지점');
    R(hand, c, 'handHeight', 0, 3, 0.01, '손 높이');
    R(hand, c, 'handForward', -1, 3, 0.01, '손 전방');
    R(hand, c, 'handSide', -1.5, 1.5, 0.01, '손 좌우');
    R(hand, c, 'muzzleSize', 0.05, 6, 0.05, '발사구 크기');
    R(hand, c, 'muzzleIntensity', 0, 5, 0.01, '발사구 강도');
    R(hand, c, 'castFlash', 0, 2, 0.01, '방출 섬광');
    hand.addColor(c, 'colorCastFlash').name('방출 섬광 색');

    const fill = folder.addFolder('범위 채우기');
    R(fill, c, 'spikeCount', 1, 320, 1, '조각');
    R(fill, c, 'density', 0.1, 2, 0.01, '밀도');
    R(fill, c, 'ringShare', 0, 1, 0.01, '벽 비율');
    R(fill, c, 'coreShare', 0, 0.5, 0.01, '첨탑 비율');
    R(fill, c, 'lateShare', 0, 0.5, 0.01, '보류 비율');
    R(fill, c, 'ringSeat', 0.2, 1.4, 0.01, '벽 착석 (범위 대비)');
    R(fill, c, 'ringScatter', 0, 0.6, 0.005, '벽 흔들림 (범위 대비)');
    R(fill, c, 'skirtSeat', 0, 1.4, 0.01, '스커트 안입술 (범위 대비)');
    R(fill, c, 'skirtBand', 0.02, 1.4, 0.01, '스커트 폭 (범위 대비)');
    R(fill, c, 'skirtBias', 0.2, 3, 0.01, '스커트 밀집');
    R(fill, c, 'coreSpread', 0.01, 0.6, 0.005, '첨탑 군집 (범위 대비)');

    const shape = folder.addFolder('외형');
    R(shape, c, 'ringHeight', 0.2, 12, 0.05, '벽 높이');
    R(shape, c, 'ringWave', 0, 1, 0.01, '마루 울퉁불퉁');
    R(shape, c, 'skirtHeight', 0.05, 6, 0.05, '스커트 높이');
    R(shape, c, 'coreHeight', 0.2, 12, 0.05, '첨탑 높이');
    R(shape, c, 'heightJitter', 0, 1.5, 0.01, '높이 흔들림');
    R(shape, c, 'ringLean', -1.5, 1.5, 0.01, '벽 기울기 (0 = 울타리)');
    R(shape, c, 'skirtLean', -1.5, 1.5, 0.01, '스커트 기울기');
    R(shape, c, 'coreLean', -1.5, 1.5, 0.01, '첨탑 기울기');
    R(shape, c, 'leanJitter', 0, 3, 0.01, '기울기 흔들림');
    R(shape, c, 'fan', 0, 1.6, 0.01, '반지름 펼침');
    R(shape, c, 'twist', 0, 1, 0.01, '무작위 요');
    R(shape, c, 'rubble', 0, 1, 0.01, '잔해 비율');
    R(shape, c, 'rubbleScale', 0.05, 1, 0.01, '잔해 높이');

    const crystal = folder.addFolder('결정');
    R(crystal, c, 'radius', 0.05, 1.2, 0.005, '밑둥 반지름');
    R(crystal, c, 'radiusJitter', 0, 1.5, 0.01, '반지름 흔들림');
    R(crystal, c, 'taper', 0.01, 0.9, 0.01, '끝 테이퍼');
    R(crystal, c, 'facets', 3, 12, 1, '면');
    R(crystal, c, 'roughness', 0, 1, 0.01, '면 거칠기');
    R(crystal, c, 'bend', 0, 1.5, 0.01, '휨');

    const bloom = folder.addFolder('개화');
    R(bloom, c, 'sweepTime', 0, 3, 0.01, '고리 주위 소인');
    R(bloom, c, 'skirtDelay', 0, 2, 0.01, '스커트 지연');
    R(bloom, c, 'skirtWave', 0, 2, 0.01, '스커트 파동');
    R(bloom, c, 'coreDelay', 0, 2, 0.01, '첨탑 지연');
    R(bloom, c, 'stagger', 0, 1, 0.005, '무작위 시차');
    R(bloom, c, 'bloomSpread', 0, 1, 0.01, '후기 조각 확산');
    R(bloom, c, 'riseTime', 0.02, 1.5, 0.01, '상승 시간');
    R(bloom, c, 'riseOvershoot', 0, 1.5, 0.01, '펀치 오버슈트');
    R(bloom, c, 'settle', 0.05, 2, 0.01, '안정');

    const material = folder.addFolder('프리즘 유리');
    R(material, c, 'opacity', 0, 1, 0.01, '불투명도');
    R(material, c, 'body', 0, 2, 0.01, '본체 (0 = 가장자리만)');
    R(material, c, 'edgePower', 0.5, 8, 0.01, '가장자리 조임');
    R(material, c, 'edgeGain', 0, 6, 0.01, '가장자리 게인');
    R(material, c, 'dispersion', 0, 1, 0.01, '색 분리');
    R(material, c, 'pipe', 0, 5, 0.01, '유도광');
    R(material, c, 'tipBias', 0.2, 6, 0.01, '지점 밀집');
    R(material, c, 'bands', 0, 8, 0.05, '이동 띠');
    R(material, c, 'pulseSpeed', -4, 4, 0.01, '띠 속도');
    R(material, c, 'tipStart', 0, 1, 0.01, '끝 시작');
    R(material, c, 'tipGlow', 0, 6, 0.01, '끝 발광');
    R(material, c, 'stria', 0, 3, 0.01, '유선');
    R(material, c, 'striaScale', 0.5, 24, 0.1, '유선 규모');
    R(material, c, 'envIntensity', 0, 3, 0.01, '환경 반사');
    R(material, c, 'specular', 0, 8, 0.05, '태양 반짝임');
    R(material, c, 'glow', 0, 4, 0.01, '발광');
    R(material, c, 'birthGlow', 0, 6, 0.01, '생성 섬광');
    R(material, c, 'birthFade', 0.02, 3, 0.01, '생성 페이드');
    material.addColor(c, 'colorGlass').name('본체');
    material.addColor(c, 'colorEdge').name('가장자리 및 반짝임');
    material.addColor(c, 'colorPrismA').name('분산 A');
    material.addColor(c, 'colorPrismB').name('분산 B');
    material.addColor(c, 'colorCore').name('유도광');
    material.addColor(c, 'colorTip').name('끝');

    const growth = folder.addFolder('동결 전선 및 파쇄');
    R(growth, c, 'frontRough', 0, 1.5, 0.01, '전선 거칠기');
    R(growth, c, 'frontWidth', 0.01, 0.8, 0.01, '전선 폭');
    R(growth, c, 'frontGlow', 0, 8, 0.05, '전선 발광');
    R(growth, c, 'shatterScale', 1, 24, 0.1, '파쇄 셀');
    R(growth, c, 'shatterEdge', 0.005, 0.4, 0.005, '파쇄 가장자리 폭');
    R(growth, c, 'shatterGlow', 0, 8, 0.05, '파쇄 발광');

    const field = folder.addFolder('바닥 빙판');
    R(field, c, 'fieldBoundary', 0.02, 2, 0.01, '띠 두께');
    R(field, c, 'fieldBoundaryGlow', 0, 8, 0.05, '띠 발광');
    R(field, c, 'fieldFill', 0, 2, 0.01, '내부 채우기');
    R(field, c, 'fieldFalloff', 0.1, 5, 0.05, '채우기 감쇠');
    R(field, c, 'fieldPlates', 0, 3, 0.01, '판 파쇄');
    R(field, c, 'fieldPlateScale', 0.2, 10, 0.05, '판 (미터당)');
    R(field, c, 'fieldSeam', 0, 3, 0.01, '틈새 서리');
    R(field, c, 'fieldFingers', 0, 3, 0.01, '서리 손가락');
    R(field, c, 'fieldFingerScale', 0.1, 8, 0.05, '손가락 (미터당)');
    R(field, c, 'fieldWarp', 0, 2, 0.01, '도메인 왜곡');
    R(field, c, 'fieldCrawl', -4, 4, 0.01, '손가락 기어감');
    R(field, c, 'fieldRings', 0, 12, 0.1, '압력 고리');
    R(field, c, 'fieldRingSpeed', -6, 6, 0.01, '고리 속도');
    R(field, c, 'fieldSweep', 0, 3, 0.01, '냉기 소인');
    R(field, c, 'fieldSweepSpeed', -2, 2, 0.01, '소인 속도');
    R(field, c, 'fieldCore', 0, 4, 0.01, '중심 웅덩이');
    R(field, c, 'fieldCoreSize', 0.02, 1, 0.005, '웅덩이 크기 (범위 대비)');
    R(field, c, 'fieldPulse', 0, 1, 0.01, '맥동');
    R(field, c, 'fieldPulseSpeed', 0, 10, 0.05, '맥동 속도');
    R(field, c, 'fieldOpacity', 0, 2, 0.01, '불투명도');
    R(field, c, 'fieldHeight', 0.005, 0.4, 0.005, '부유 높이');
    field.addColor(c, 'colorField').name('빙판');
    field.addColor(c, 'colorFieldEdge').name('띠 및 틈새');

    const veil = folder.addFolder('냉기 장막');
    R(veil, c, 'veil', 0, 2, 0.01, '불투명도 (0 = 숨김)');
    R(veil, c, 'veilHeight', 0.1, 8, 0.05, '높이');
    R(veil, c, 'veilRadius', 0.5, 1.6, 0.005, '착석 (범위 대비)');
    R(veil, c, 'veilFlare', -0.5, 1.5, 0.01, '바깥 기울기');
    R(veil, c, 'veilBillow', 0, 1.5, 0.01, '외형 로브');
    R(veil, c, 'veilScale', 0.1, 6, 0.05, '노이즈 (미터당)');
    R(veil, c, 'veilStretch', 0.05, 3, 0.01, '수직 늘어남');
    R(veil, c, 'veilFlow', -4, 4, 0.01, '낙하 속도');
    R(veil, c, 'veilErode', 0, 1, 0.01, '높이 침식');
    R(veil, c, 'veilFalloff', 0.2, 6, 0.05, '높이 얇아짐');
    R(veil, c, 'veilSpin', -1, 1, 0.005, '회전');
    R(veil, c, 'veilSoftFade', 0.02, 3, 0.01, '부드러운 교차');
    veil.addColor(c, 'colorVeil').name('장막');
    veil.addColor(c, 'colorVeilCrest').name('마루');

    const ground = folder.addFolder('서리');
    R(ground, c, 'trailFrostRate', 0.05, 10, 0.05, '궤적 서리 (미터당)');
    R(ground, c, 'trailFrostRadius', 0.05, 6, 0.05, '궤적 서리 반지름');
    R(ground, c, 'frostSpread', 0.2, 4, 0.05, '충돌 서리 (범위 대비)');
    R(ground, c, 'frostLife', 0.5, 20, 0.1, '서리 수명');
    R(ground, c, 'frostIntensity', 0, 2, 0.01, '서리 강도');
    R(ground, c, 'frostCrystals', 0, 4, 0.01, '눈 입자');
    R(ground, c, 'frostCollar', 0, 8, 0.05, '칼라 (파편 반지름 대비)');
    R(ground, c, 'rimeRate', 0, 20, 0.1, '가장자리 서리 (초당)');
    R(ground, c, 'rimeRadius', 0.05, 6, 0.05, '가장자리 서리 반지름');
    R(ground, c, 'shockRadius', 0.5, 25, 0.1, '충격파 반지름');
    R(ground, c, 'ringRate', 0, 12, 0.1, '압력 고리 (초당)');
    ground.addColor(c, 'colorFrost').name('눈');
    ground.addColor(c, 'colorFrostEdge').name('눈 그림자');
    ground.addColor(c, 'colorShockA').name('충격파 고리');
    ground.addColor(c, 'colorShockB').name('충격파 마루');

    const air = folder.addFolder('안개·반짝이·눈');
    R(air, c, 'mistRate', 0, 900, 1, '안개 비율');
    R(air, c, 'mistSize', 0.05, 4, 0.01, '안개 크기');
    R(air, c, 'mistSpeed', 0, 8, 0.05, '안개 속도');
    R(air, c, 'mistLifetime', 0.2, 8, 0.05, '안개 수명');
    R(air, c, 'mistOpacity', 0, 1, 0.005, '안개 불투명도');
    R(air, c, 'mistRise', -3, 3, 0.01, '안개 상승 (− 하강)');
    R(air, c, 'mistTurbulence', 0, 3, 0.01, '안개 소용돌이');
    R(air, c, 'glitterRate', 0, 900, 1, '반짝이 비율');
    R(air, c, 'glitterSize', 0.005, 0.4, 0.005, '반짝이 크기');
    R(air, c, 'glitterSpeed', 0, 20, 0.1, '반짝이 속도');
    R(air, c, 'glitterLifetime', 0.1, 8, 0.05, '반짝이 수명');
    R(air, c, 'glitterRise', -3, 8, 0.01, '반짝이 상승');
    R(air, c, 'glitterTurbulence', 0, 3, 0.01, '반짝이 소용돌이');
    R(air, c, 'glitterGlow', 0, 4, 0.01, '반짝이 발광');
    R(air, c, 'snowRate', 0, 600, 1, '눈 비율');
    R(air, c, 'snowSize', 0.005, 0.4, 0.005, '눈 크기');
    R(air, c, 'snowSpeed', 0, 10, 0.05, '초기 밀기');
    R(air, c, 'snowLifetime', 0.2, 10, 0.05, '눈 수명');
    R(air, c, 'snowFall', -12, 2, 0.05, '눈 중력');
    R(air, c, 'snowTurbulence', 0, 3, 0.01, '눈 날림');
    R(air, c, 'snowGlow', 0, 4, 0.01, '눈 발광');
    R(air, c, 'snowInset', 0.05, 1.4, 0.01, '낙하 안쪽 (범위 대비)');
    R(air, c, 'snowHeight', 0.2, 4, 0.05, '낙하 높이 (벽 대비)');
    Editor.gradient(air, c, 'colorMist', '안개 색');
    Editor.gradient(air, c, 'colorGlitter', '반짝이 색');
    Editor.gradient(air, c, 'colorSnow', '눈 색');

    const chips = folder.addFolder('얼음 조각');
    R(chips, c, 'shardSize', 0.005, 0.5, 0.005, '파편 크기');
    R(chips, c, 'shardSpeed', 0, 30, 0.1, '파편 속도');
    R(chips, c, 'shardLifetime', 0.1, 6, 0.05, '파편 수명');
    R(chips, c, 'shardGravity', -50, 0, 0.1, '파편 중력');
    R(chips, c, 'breachShards', 0, 30, 1, '돌파 파편');
    R(chips, c, 'shatterShards', 0, 30, 1, '파쇄 파편');
    Editor.gradient(chips, c, 'colorShard', '파편 색');

    const impact = folder.addFolder('개화 및 유지');
    R(impact, c, 'burstSize', 0.2, 14, 0.05, '증기 껍질 크기');
    R(impact, c, 'burstIntensity', 0, 5, 0.01, '증기 껍질 강도');
    R(impact, c, 'burstShards', 0, 600, 1, '블룸 파편');
    R(impact, c, 'burstMist', 0, 400, 1, '블룸 안개');
    R(impact, c, 'burstGlitter', 0, 600, 1, '블룸 반짝이');
    R(impact, c, 'vapourRate', 0, 12, 0.05, '유지 껍질 (초당)');
    R(impact, c, 'vapourSize', 0.1, 10, 0.05, '유지 껍질 크기');
    R(impact, c, 'vapourIntensity', 0, 5, 0.01, '유지 껍질 강도');
    R(impact, c, 'impactShake', 0, 3, 0.01, '흔들림');
    R(impact, c, 'shakeDuration', 0.1, 4, 0.01, '흔들림 지속');
    R(impact, c, 'holdShake', 0, 0.5, 0.005, '유지 진동');
    R(impact, c, 'impactFlash', 0, 2, 0.01, '화면 섬광');
    R(impact, c, 'rumble', 0, 0.5, 0.005, '이동 진동');
    impact.addColor(c, 'colorBurstA').name('껍질');
    impact.addColor(c, 'colorBurstB').name('껍질 본체');
    impact.addColor(c, 'colorBurstC').name('껍질 판');
    impact.addColor(c, 'colorFlash').name('개화 섬광 색');

    const light = folder.addFolder('동적 조명');
    R(light, c, 'lightIntensity', 0, 120, 0.5, '조명 강도');
    R(light, c, 'lightRadius', 0.5, 50, 0.1, '조명 반지름');
    R(light, c, 'lightHeight', 0, 1, 0.01, '크라운 높이');
    light.addColor(c, 'lightColor').name('조명 색');

    this.glacierFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  _buildEnvironment() {
    const folder = this.gui.addFolder('환경');
    const e = settings.environment;
    const R = Editor.range;

    R(folder, e, 'sunIntensity', 0, 8, 0.01, '주광 강도');
    folder.addColor(e, 'sunColor').name('주광 색');
    R(folder, e, 'sunAzimuth', 0, Math.PI * 2, 0.01, '주광 방위각');
    R(folder, e, 'sunElevation', 0.05, 1.5, 0.01, '주광 고도');
    R(folder, e, 'ambientIntensity', 0, 3, 0.01, '환경광');
    folder.addColor(e, 'ambientColor').name('환경광 색');
    R(folder, e, 'hemiIntensity', 0, 3, 0.01, '반구광');
    R(folder, e, 'envIntensity', 0, 3, 0.01, '환경광 (IBL)');
    R(folder, e, 'shadowRadius', 0, 8, 0.05, '그림자 부드러움');
    R(folder, e, 'shadowBias', -0.01, 0.001, 0.0001, '그림자 바이어스');
    R(folder, e, 'contactShadow', 0, 1.5, 0.01, '접촉 그림자');

    const rim = folder.addFolder('림 라이트');
    R(rim, e, 'rimIntensity', 0, 4, 0.01, '림 강도');
    rim.addColor(e, 'rimColor').name('림 색');
    R(rim, e, 'rimAzimuth', 0, Math.PI * 2, 0.01, '림 방위각');
    R(rim, e, 'rimElevation', 0.05, 1.5, 0.01, '림 고도');
    rim.addColor(e, 'hemiSkyColor').name('반구 하늘');
    rim.addColor(e, 'hemiGroundColor').name('반구 반사');

    const fog = folder.addFolder('배경·안개·먼지');
    fog.addColor(e, 'backgroundColor').name('배경');
    fog.add(e, 'fogEnabled').name('안개 사용');
    fog.addColor(e, 'fogColor').name('안개 색');
    // near = where the fog starts, far = where it is total; widening the gap or
    // pushing both out thins the fog, closing it thickens it.
    R(fog, e, 'fogNear', 1, 200, 1, '안개 시작');
    R(fog, e, 'fogFar', 10, 400, 1, '안개 끝');
    R(fog, e, 'dustAmount', 0, 3, 0.01, '부유 먼지');

    const floor = folder.addFolder('무대 바닥');
    floor.add(e, 'floorTexture').name('석재 타일');
    R(floor, e, 'floorTextureScale', 0.5, 24, 0.1, '타일 크기 (m)');
    R(floor, e, 'floorNormalScale', 0, 3, 0.01, '음각 강도');
    R(floor, e, 'floorTexTint', 0, 1, 0.01, '바닥 쪽 틴트');
    floor.addColor(e, 'floorColor').name('바닥 색');
    floor.addColor(e, 'floorTint').name('바닥 틴트');
    R(floor, e, 'floorRoughness', 0.05, 1, 0.01, '거칠기');
    R(floor, e, 'floorSheen', 0, 1, 0.01, '광택');
    R(floor, e, 'floorPool', 0, 1, 0.01, '조명 웅덩이');
  }

  _buildPost() {
    const folder = this.gui.addFolder('후처리');
    const p = settings.post;
    const R = Editor.range;

    folder.add(p, 'enabled').name('사용');
    R(folder, p, 'exposure', 0.1, 3, 0.01, '노출');
    R(folder, p, 'bloomStrength', 0, 3, 0.01, '블룸 강도');
    R(folder, p, 'bloomRadius', 0, 1.5, 0.01, '블룸 반지름');
    R(folder, p, 'bloomThreshold', 0, 2, 0.01, '블룸 임계값');
    R(folder, p, 'contrast', 0.5, 2, 0.01, '대비');
    R(folder, p, 'saturation', 0, 2.5, 0.01, '채도');
    R(folder, p, 'temperature', -0.5, 0.5, 0.01, '온도');
    R(folder, p, 'lift', -0.2, 0.2, 0.005, '리프트');
    R(folder, p, 'gain', 0.5, 2, 0.01, '게인');
    R(folder, p, 'vignette', 0, 1.5, 0.01, '비네팅');
    R(folder, p, 'chromaticAberration', 0, 3, 0.01, '색수차');
    R(folder, p, 'grain', 0, 0.2, 0.001, '필름 그레인');
    R(folder, p, 'distortion', 0, 0.2, 0.001, '화면 왜곡');
    R(folder, p, 'flashStrength', 0, 2, 0.01, '충돌 섬광');
  }

  _buildCamera() {
    const folder = this.gui.addFolder('카메라');
    const c = settings.camera;
    const R = Editor.range;

    // The wheel writes `distance` straight into settings, so the slider listens.
    R(folder, c, 'distance', 1, 40, 0.1, '거리').listen();
    R(folder, c, 'minDistance', 1, 20, 0.1, '최소 거리');
    R(folder, c, 'maxDistance', 4, 40, 0.1, '최대 거리');
    R(folder, c, 'zoomSpeed', 0.1, 3, 0.01, '줌 속도');
    R(folder, c, 'fov', 20, 90, 0.5, '시야각');
    R(folder, c, 'targetHeight', 0, 4, 0.01, '목표 높이');
    R(folder, c, 'minPolar', 0.05, 1.5, 0.01, '최소 피치');
    R(folder, c, 'maxPolar', 0.2, 1.55, 0.01, '최대 피치');
    R(folder, c, 'damping', 0.001, 0.5, 0.001, '추적 감쇠');
    R(folder, c, 'autoFrame', 0, 1, 0.01, '자동 프레이밍');

    folder.add({ clear: () => this.hooks.onClear?.() }, 'clear').name('이펙트 지우기 (C)');
  }

  _buildCharacter() {
    const folder = this.gui.addFolder('캐릭터');
    const c = settings.character;
    const R = Editor.range;

    // The mixer's own rate, so it scales the idle and the cast clips together.
    // The same value as Global → animation speed, mirrored here where it is
    // actually reached for; `listen` keeps the two readouts honest.
    R(folder, settings.global, 'animationSpeed', 0.1, 3, 0.01, '재생 속도').listen();

    // Which clip each ability throws lives in that ability's own folder, under
    // "The cast"; these are the edges of the blend that lays it over the idle.
    const cast = folder.addFolder('캐스팅');
    R(cast, c, 'castBlendIn', 0.01, 1, 0.01, '시전 진입 블렌드');
    R(cast, c, 'castBlendOut', 0.01, 1.5, 0.01, '대기로 복귀 블렌드');
    cast.add(c, 'turnToAim').name('조준 방향 회전');
    R(cast, c, 'turnRate', 0.000001, 0.02, 0.000001, '회전 추적');

    // The procedural accent that rides on top of the clip. Zero both leans to
    // let the animation carry the cast on its own.
    const lunge = folder.addFolder('돌진');
    R(lunge, c, 'castLean', 0, 1.2, 0.01, '돌진 기울기');
    R(lunge, c, 'castRecoil', 0, 0.8, 0.005, '돌진 반동');
    R(lunge, c, 'castSettle', 0.2, 8, 0.05, '돌진 안정');
  }

  dispose() {
    this.gui.destroy();
  }
}

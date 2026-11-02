/**
 * 공용 3D 뷰어 (ARCHITECTURE §2·§8).
 * - iOS WebGL 컨텍스트 제한 때문에 페이지당 이 Canvas 하나만 쓴다.
 * - frameloop="demand": 값이 바뀌거나 회전할 때만 그린다 (배터리).
 * - 좌표는 전부 수학 관례(z 위쪽)로 받는다: 장면(children), 카메라 위치, 회전 중심 모두.
 *   안쪽 group과 toThree()가 Three.js의 y 위쪽으로 바꿔 준다.
 * - "탭해서 돌리기": 처음에는 조작이 꺼져 있어 그림 위에서 손가락으로 페이지를 스크롤할 수 있다.
 *   탭하면 한 손가락 회전·두 손가락 확대가 켜지고, 바깥을 누르거나 "다 봤어"·Esc로 다시 꺼진다 (2026-11-02, 4주차).
 */
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import styles from "./Viewer3D.module.css";

const MAX_DPR = 2;
const DEFAULT_AXIS_LENGTH = 2.6;
/** 수학 좌표 (x, y, z) → Three.js (x, z, -y): 안쪽 group을 x축으로 -90° 돌린다 */
const Z_UP_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];
const ZOOM_MIN_RATIO = 0.35;
const ZOOM_MAX_RATIO = 2.5;

type Tuple3 = readonly [number, number, number];

/** 수학 좌표 → Three.js 좌표 (group 회전과 같은 변환) */
export function toThree([x, y, z]: Tuple3): [number, number, number] {
  return [x, z, -y];
}

interface Viewer3DProps {
  /** 화면 낭독기용 장면 설명 */
  label: string;
  /** 카메라 위치 (수학 좌표, z 위쪽) */
  cameraPosition?: Tuple3;
  /** 카메라가 바라보고 회전하는 중심 (수학 좌표). 장면 가운데로 두면 잘리지 않는다 */
  target?: Tuple3;
  /** 좌표축 길이. 0이면 축을 그리지 않는다 */
  axisLength?: number;
  children: ReactNode;
}

interface ControlsProps {
  target: Tuple3;
  /** 처음 카메라와 회전 중심 사이 거리. 확대 한계의 기준 (사용자가 확대한 뒤에도 바뀌지 않게 props에서 구한다) */
  baseDistance: number;
  active: boolean;
}

function Controls({ target, baseDistance, active }: ControlsProps) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const controlsRef = useRef<OrbitControls | null>(null);
  // 만들 때도 지금 상태를 쓰도록 ref로 읽는다 (두 effect가 서로의 실행 순서에 기대지 않게)
  const activeRef = useRef(active);
  activeRef.current = active;
  const [tx, ty, tz] = toThree(target);

  useEffect(() => {
    const controls = new OrbitControls(camera, dom);
    controls.target.set(tx, ty, tz);
    controls.update();
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = baseDistance * ZOOM_MIN_RATIO;
    controls.maxDistance = baseDistance * ZOOM_MAX_RATIO;
    controls.rotateSpeed = 0.8;
    controls.enabled = activeRef.current;
    dom.style.touchAction = activeRef.current ? "none" : "pan-y";
    controlsRef.current = controls;
    const redraw = () => invalidate();
    controls.addEventListener("change", redraw);
    // iOS가 백그라운드에서 WebGL 컨텍스트를 빼앗았다 돌려주면, demand 모드라 직접 다시 그려야 한다
    dom.addEventListener("webglcontextrestored", redraw);
    return () => {
      dom.removeEventListener("webglcontextrestored", redraw);
      controls.removeEventListener("change", redraw);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, dom, invalidate, tx, ty, tz, baseDistance]);

  // 꺼져 있을 때는 세로 스크롤을 브라우저에 돌려준다 (OrbitControls는 touch-action: none을 건다)
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = active;
    dom.style.touchAction = active ? "none" : "pan-y";
  }, [active, dom]);

  return null;
}

const DEFAULT_CAMERA: Tuple3 = [4.5, -5.5, 4];
const DEFAULT_TARGET: Tuple3 = [0, 0, 0];

export default function Viewer3D({
  label,
  cameraPosition = DEFAULT_CAMERA,
  target = DEFAULT_TARGET,
  axisLength = DEFAULT_AXIS_LENGTH,
  children,
}: Viewer3DProps) {
  const [active, setActive] = useState(false);
  // WebGL이 실제로 켜졌을 때만 "탭해서 돌리기"를 보여준다 (꺼진 기기에서 누를 게 없는 버튼을 막는다)
  const [glReady, setGlReady] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  // 버튼·Esc로 바꿀 때만 포커스를 옮긴다. 바깥을 눌러 꺼질 때는 사용자가 누른 곳(슬라이더 등)에 포커스를 남긴다
  const focusNextRef = useRef<"start" | "done" | null>(null);
  const baseDistance = Math.hypot(...cameraPosition.map((c, i) => c - target[i]!));

  // 조작 중에 그림 바깥을 누르거나 Esc를 누르면 조작을 끈다 (다시 스크롤할 수 있게)
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      if (frameRef.current && !frameRef.current.contains(e.target as Node)) setActive(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      focusNextRef.current = "start";
      setActive(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [active]);

  // 버튼이 바뀌어도 키보드 포커스가 body로 떨어지지 않게 새 버튼으로 옮긴다 (처음 렌더·바깥 클릭에서는 옮기지 않는다)
  useEffect(() => {
    const next = focusNextRef.current;
    focusNextRef.current = null;
    if (next === "done") doneRef.current?.focus({ preventScroll: true });
    if (next === "start") startRef.current?.focus({ preventScroll: true });
  }, [active]);

  const toggle = (next: boolean) => {
    focusNextRef.current = next ? "done" : "start";
    setActive(next);
  };

  return (
    // role="img"는 자식을 숨겨서 WebGL 꺼짐 안내까지 가린다 → figure로 둔다
    <div ref={frameRef} className={styles.frame} role="figure" aria-label={label} data-active={active}>
      <Canvas
        frameloop="demand"
        dpr={[1, MAX_DPR]}
        camera={{ position: toThree(cameraPosition), fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        onCreated={() => setGlReady(true)}
        fallback={<p className={styles.fallback}>이 브라우저에서는 3D 장면을 그릴 수 없어 (WebGL 꺼짐).</p>}
      >
        <Controls target={target} baseDistance={baseDistance} active={active} />
        <group rotation={Z_UP_ROTATION}>
          {/* x 빨강, y 초록, z 파랑 (로봇·SLAM 관례 색) */}
          {axisLength > 0 && <axesHelper args={[axisLength]} />}
          {children}
        </group>
      </Canvas>
      {glReady && active && (
        <>
          <span className={styles.hint} aria-hidden="true">
            한 손가락 회전 · 두 손가락 확대
          </span>
          <button ref={doneRef} type="button" className={styles.done} onClick={() => toggle(false)}>
            다 봤어
          </button>
        </>
      )}
      {glReady && !active && (
        <button ref={startRef} type="button" className={styles.start} onClick={() => toggle(true)}>
          <span className={styles.startLabel}>탭해서 돌리기</span>
        </button>
      )}
    </div>
  );
}

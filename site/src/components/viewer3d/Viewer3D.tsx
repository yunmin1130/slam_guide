/**
 * 공용 3D 뷰어 (ARCHITECTURE §2·§8).
 * - iOS WebGL 컨텍스트 제한 때문에 페이지당 이 Canvas 하나만 쓴다.
 * - frameloop="demand": 값이 바뀌거나 회전할 때만 그린다 (배터리).
 * - 1주차는 한 손가락 회전만. 확대·이동과 "탭해서 조작 시작"은 4주차에 붙인다.
 * - 좌표는 수학 관례(z 위쪽)로 받는다. 안쪽 group이 Three.js의 y 위쪽으로 돌려준다.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, type ReactNode } from "react";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import styles from "./Viewer3D.module.css";

const MAX_DPR = 2;
const AXIS_LENGTH = 2.6;
/** 수학 좌표 (x, y, z) → Three.js (x, z, -y) */
const Z_UP_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];

type Tuple3 = [number, number, number];

interface Viewer3DProps {
  /** 화면 낭독기용 장면 설명 */
  label: string;
  /** 카메라 위치 (Three.js 좌표, y 위쪽) */
  cameraPosition?: Tuple3;
  /** 카메라가 바라보고 회전하는 중심 (Three.js 좌표). 장면 가운데로 두면 잘리지 않는다 */
  target?: Tuple3;
  children: ReactNode;
}

function RotateOnly({ target }: { target: Tuple3 }) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const [tx, ty, tz] = target;

  useEffect(() => {
    const controls = new OrbitControls(camera, dom);
    controls.target.set(tx, ty, tz);
    controls.update();
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.8;
    const redraw = () => invalidate();
    controls.addEventListener("change", redraw);
    // iOS가 백그라운드에서 WebGL 컨텍스트를 빼앗았다 돌려주면, demand 모드라 직접 다시 그려야 한다
    dom.addEventListener("webglcontextrestored", redraw);
    return () => {
      dom.removeEventListener("webglcontextrestored", redraw);
      controls.removeEventListener("change", redraw);
      controls.dispose();
    };
  }, [camera, dom, invalidate, tx, ty, tz]);

  return null;
}

const DEFAULT_CAMERA: Tuple3 = [4.5, 4, 5.5];
const DEFAULT_TARGET: Tuple3 = [0, 0, 0];

export default function Viewer3D({ label, cameraPosition = DEFAULT_CAMERA, target = DEFAULT_TARGET, children }: Viewer3DProps) {
  return (
    // role="img"는 자식을 숨겨서 WebGL 꺼짐 안내까지 가린다 → figure로 둔다
    <div className={styles.frame} role="figure" aria-label={label}>
      <Canvas
        frameloop="demand"
        dpr={[1, MAX_DPR]}
        camera={{ position: cameraPosition, fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        fallback={<p className={styles.fallback}>이 브라우저에서는 3D 장면을 그릴 수 없어 (WebGL 꺼짐).</p>}
      >
        <RotateOnly target={target} />
        <group rotation={Z_UP_ROTATION}>
          {/* x 빨강, y 초록, z 파랑 (로봇·SLAM 관례 색) */}
          <axesHelper args={[AXIS_LENGTH]} />
          {children}
        </group>
      </Canvas>
      <span className={styles.hint} aria-hidden="true">
        한 손가락으로 돌리기
      </span>
    </div>
  );
}

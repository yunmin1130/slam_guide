/**
 * 1주차 데모: 두 벡터 a, b와 내적·외적·[a]×.
 * dot·cross·skew는 core를 직접 import하지 않고 lib/impl.ts의 loadFn으로 가져온다 (ARCHITECTURE §4).
 * mine skew가 아직 TODO면 그 부분만 오류를 보여주고 나머지 장면은 그대로 그린다.
 */
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { loadFn, type ImplKind } from "../../lib/impl";
import { add, matVec, scale, sceneVectors, type M3, type V3 } from "../../lib/vectorScene";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import Arrow from "../viewer3d/Arrow";
import Viewer3D from "../viewer3d/Viewer3D";
import styles from "./VectorViewer.module.css";

type Dot = (a: V3, b: V3) => number;
type Cross = (a: V3, b: V3) => V3;
type Skew = (v: V3) => M3;
interface Fns {
  dot: Dot;
  cross: Cross;
  skew: Skew;
}

/** 축 색(빨강·초록·파랑)과 겹치지 않는 색 */
const COLOR = { a: "#f08a24", b: "#9a6ae0", cross: "#17a398", proj: "#c7a03a" } as const;
/** 장면(a, b, a×b)의 대략 가운데. Three.js 좌표 = 수학 (0.6, 0.4, 1.2) */
const SCENE_CENTER: [number, number, number] = [0.6, 1.2, -0.4];

interface VectorViewerProps {
  week: number;
  /** 데모가 쓰는 손코딩 함수의 테스트 상태 (빌드 시점) */
  statuses: FnStatusEntry[];
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fmt(x: number): string {
  const s = x.toFixed(2);
  return s === "-0.00" ? "0.00" : s;
}

const vecText = (v: V3): string => `[${v.map(fmt).join(", ")}]`;

interface LoadedFns {
  kind: ImplKind | null;
  fns: Fns | null;
  loadError: string | null;
}

/** 불러온 구현에 kind를 붙여 둔다. 토글 직후 이전 구현 결과가 새 라벨로 보이지 않게 한다 */
function useFns(week: number, kind: ImplKind): { fns: Fns | null; loadError: string | null } {
  const [state, setState] = useState<LoadedFns>({ kind: null, fns: null, loadError: null });
  useEffect(() => {
    let alive = true;
    Promise.all([loadFn<Dot>(week, "dot", kind), loadFn<Cross>(week, "cross", kind), loadFn<Skew>(week, "skew", kind)])
      .then(([dot, cross, skew]) => alive && setState({ kind, fns: { dot, cross, skew }, loadError: null }))
      .catch((e: unknown) => alive && setState({ kind, fns: null, loadError: errorText(e) }));
    return () => {
      alive = false;
    };
  }, [week, kind]);
  return state.kind === kind ? state : { fns: null, loadError: null };
}

/** 0, a, a+b, b가 만드는 평행사변형. 넓이 = |a×b| */
function Parallelogram({ a, b, color }: { a: V3; b: V3; color: string }) {
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const pos = geometry.getAttribute("position") as BufferAttribute;
    pos.set([0, 0, 0, ...a, ...add(a, b), ...b]);
    pos.needsUpdate = true;
    geometry.computeBoundingSphere();
    invalidate();
  }, [geometry, a, b, invalidate]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} transparent opacity={0.18} side={DoubleSide} depthWrite={false} />
    </mesh>
  );
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

function Slider({ id, label, value, min, max, step, unit, onChange }: SliderProps) {
  return (
    <div className={styles.slider}>
      <label htmlFor={id}>
        {label}{" "}
        <output htmlFor={id}>
          {value}
          {unit}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  );
}

function MatrixTable({ M }: { M: M3 }) {
  return (
    <table className={styles.matrix} aria-label="[a]× 행렬">
      <tbody>
        {M.map((row, i) => (
          <tr key={i}>
            {row.map((x, j) => (
              <td key={j}>{fmt(x)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const swatch = (c: string): CSSProperties => ({ ["--c" as string]: c });

export default function VectorViewer({ week, statuses }: VectorViewerProps) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  const [thetaDeg, setTheta] = useState(60);
  const [tiltDeg, setTilt] = useState(0);
  const [bLength, setBLength] = useState(1.5);
  const { fns, loadError } = useFns(week, kind);

  const { a, b } = useMemo(() => sceneVectors({ thetaDeg, tiltDeg, bLength }), [thetaDeg, tiltDeg, bLength]);

  const basic = useMemo(() => {
    if (!fns) return null;
    try {
      const d = fns.dot(a, b);
      const c = fns.cross(a, b);
      return { d, c, area: Math.sqrt(fns.dot(c, c)), proj: scale(a, d / fns.dot(a, a)) };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [fns, a, b]);

  const skewed = useMemo(() => {
    if (!fns) return null;
    try {
      const S = fns.skew(a);
      return { S, Sb: matVec(S, b) };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [fns, a, b]);

  const ok = basic && !("error" in basic) ? basic : null;

  return (
    <div className={styles.demo}>
      <ImplToggle statuses={statuses} value={kind} onChange={setKind} />

      <Viewer3D label={`벡터 a, b와 외적 a×b. a와 b 사이 각 ${thetaDeg}도`} target={SCENE_CENTER}>
        <Arrow to={a} color={COLOR.a} />
        <Arrow to={b} color={COLOR.b} />
        {ok && <Arrow to={ok.c} color={COLOR.cross} />}
        {ok && <Arrow to={ok.proj} color={COLOR.proj} />}
        <Parallelogram a={a} b={b} color={COLOR.cross} />
      </Viewer3D>

      <ul className={styles.legend} aria-label="색 범례">
        <li style={swatch(COLOR.a)}>a</li>
        <li style={swatch(COLOR.b)}>b</li>
        <li style={swatch(COLOR.cross)}>a×b · 평행사변형</li>
        <li style={swatch(COLOR.proj)}>b의 a 방향 투영</li>
      </ul>

      <div className={styles.controls}>
        <Slider id="vv-theta" label="a와 b 사이 각 θ" value={thetaDeg} min={0} max={180} step={5} unit="°" onChange={setTheta} />
        <Slider id="vv-len" label="b의 길이" value={bLength} min={0.5} max={2.5} step={0.1} unit="" onChange={setBLength} />
        <Slider id="vv-tilt" label="평면 기울이기" value={tiltDeg} min={0} max={180} step={5} unit="°" onChange={setTilt} />
      </div>

      <div className={styles.readout}>
        {!fns && !loadError && <p className={styles.loading}>구현 불러오는 중…</p>}
        {loadError && <p className={styles.error}>{loadError}</p>}
        {basic && "error" in basic && <p className={styles.error}>dot/cross 오류: {basic.error}</p>}
        {ok && (
          <dl className={styles.values}>
            <dt>a·b</dt>
            <dd>{fmt(ok.d)}</dd>
            <dt>|a×b|</dt>
            <dd>{fmt(ok.area)}</dd>
            <dt>a×b</dt>
            <dd>{vecText(ok.c)}</dd>
          </dl>
        )}
        {/* 슬라이더마다 읽히면 시끄러우니, 오류가 생기거나 사라질 때만 알린다 */}
        <div className={styles.skew} role="status">
          <p className={styles.skewTitle}>
            <code>skew(a)</code> = [a]×
          </p>
          {skewed && "error" in skewed && (
            <p className={styles.error}>
              {kind === "mine" ? "내 구현" : "정답"}이 예외를 던졌다: {skewed.error}
            </p>
          )}
          {skewed && !("error" in skewed) && (
            <>
              <MatrixTable M={skewed.S} />
              <p className={styles.check}>
                [a]×b = {vecText(skewed.Sb)}
                {ok && <> · a×b = {vecText(ok.c)}</>}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

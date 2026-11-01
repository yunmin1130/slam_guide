/**
 * 화살표 하나 (수학 좌표). 길이가 거의 0이면 숨긴다 (예: 평행한 두 벡터의 외적).
 * frameloop="demand"라서 값을 바꾼 뒤 직접 invalidate()로 다시 그리게 한다.
 */
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { ArrowHelper, Vector3 } from "three";

type Tuple3 = readonly [number, number, number];

const MIN_LENGTH = 1e-6;
const HEAD_RATIO = 0.25;
const HEAD_MAX = 0.4;
const HEAD_WIDTH_RATIO = 0.55;
const ORIGIN: Tuple3 = [0, 0, 0];

interface ArrowProps {
  to: Tuple3;
  from?: Tuple3;
  color: string;
}

export default function Arrow({ to, from = ORIGIN, color }: ArrowProps) {
  const invalidate = useThree((s) => s.invalidate);
  const arrow = useMemo(() => new ArrowHelper(), []);

  useEffect(() => () => arrow.dispose(), [arrow]);

  const [tx, ty, tz] = to;
  const [fx, fy, fz] = from;
  useLayoutEffect(() => {
    const dir = new Vector3(tx - fx, ty - fy, tz - fz);
    const length = dir.length();
    arrow.visible = length > MIN_LENGTH;
    if (arrow.visible) {
      const head = Math.min(HEAD_MAX, length * HEAD_RATIO);
      arrow.position.set(fx, fy, fz);
      arrow.setDirection(dir.normalize());
      arrow.setLength(length, head, head * HEAD_WIDTH_RATIO);
    }
    arrow.setColor(color);
    invalidate();
  }, [arrow, tx, ty, tz, fx, fy, fz, color, invalidate]);

  return <primitive object={arrow} />;
}

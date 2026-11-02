/**
 * 선분 여러 개 (수학 좌표). 꺾은선은 polylinesToSegments로 바꿔 넘긴다.
 * frameloop="demand"라서 값을 바꾼 뒤 직접 invalidate()로 다시 그리게 한다.
 */
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";

type Tuple3 = readonly [number, number, number];
export type Segment = readonly [Tuple3, Tuple3];

/** 꺾은선 목록 → 이웃한 점끼리 이은 선분 목록 */
export function polylinesToSegments(lines: readonly (readonly Tuple3[])[]): Segment[] {
  return lines.flatMap((pts) => pts.slice(1).map((p, i): Segment => [pts[i]!, p]));
}

interface SegmentsProps {
  segments: readonly Segment[];
  color: string;
  opacity?: number;
}

export default function Segments({ segments, color, opacity = 1 }: SegmentsProps) {
  const invalidate = useThree((s) => s.invalidate);
  const count = segments.length;
  // 선분 수가 바뀔 때만 버퍼를 새로 만든다 (슬라이더를 움직이는 동안은 값만 바꾼다)
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 6), 3));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const pos = geometry.getAttribute("position") as BufferAttribute;
    const arr = pos.array as Float32Array;
    segments.forEach(([a, b], i) => arr.set([...a, ...b], i * 6));
    pos.needsUpdate = true;
    geometry.computeBoundingSphere();
    invalidate();
  }, [geometry, segments, invalidate]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </lineSegments>
  );
}

# slam_guide

A self-study course on visual SLAM, built as an interactive website. The math core is written from scratch in TypeScript, with tests and browser demos.

**Site:** https://yunmin1130.github.io/slam_guide/

SLAM 독학 사이트다. 선형대수부터 미니 Visual Odometry(VO)까지, 핵심 함수를 직접 구현하고 테스트와 인터랙티브 데모로 확인한다.

## What is here

| Part | Contents |
| --- | --- |
| Lessons (weeks 0–11) | Linear algebra, rotations and SE(3), pinhole and fisheye cameras, epipolar geometry and RANSAC, triangulation and PnP, Gauss–Newton and LM, bundle adjustment with Schur complement, pose graphs, features and KLT, a mini monocular VO with ATE/RPE evaluation |
| `core/mine` | My own implementations (hand-coded, graded by `core/tests`) |
| `core/reference` | Reference solutions used to verify the tests and power the demos (written with AI assistance) |
| `datasets/` | PC-side Python tools: camera calibration, ORB matches, JetBot sequences, TUM RGB-D → feature tracks |

## Milestone M1 (in progress)

Run **my** mini VO on TUM RGB-D sequences and report Sim(3)-aligned ATE/RPE, re-measured with [evo](https://github.com/MichaelGrupp/evo), with an ablation table and a comparison against published ORB-SLAM numbers.

Reference implementation (not mine) on the same pipeline, for orientation: fr1/xyz 299/300 frames tracked, ATE 4.6 cm over a 6.5 m path; fr3/long_office_household 799/800 frames, ATE 17 cm over 20.8 m. The M1 report will use numbers from `core/mine`.

## Run locally

```bash
npm ci
npm run test:ref     # reference solutions vs tests
npm run test:mine    # my implementations vs tests (writes site/src/data/test-results.json: generated, gitignored; CI regenerates it on deploy)
npm run dev          # site at http://localhost:4321/slam_guide/
```

TUM tracks for the VO runner (lesson 11d):

```bash
pip install opencv-python numpy
python datasets/tum_tracks.py path/to/rgbd_dataset_freiburg1_xyz
```

## Data and licenses

- TUM RGB-D (CC BY 4.0) is used for evaluation. Datasets are not committed.
- No company code or data is used anywhere in this repository.

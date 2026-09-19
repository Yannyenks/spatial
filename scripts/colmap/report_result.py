#!/usr/bin/env python3
"""Parses COLMAP's exported sparse reconstruction (sparse/0/images.txt)
into real camera positions/orientations and reports the result back to the
app — success with real measured poses, or an honest failure (e.g. not
enough matched features to converge) rather than leaving the
CameraPoseJob stuck in RUNNING forever.
"""
import json
import math
import os
import urllib.request

IMAGES_TXT = "sparse/0/images.txt"


def quat_to_rotmat(qw, qx, qy, qz):
    return [
        [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
        [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
        [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
    ]


def transpose(m):
    return [[m[j][i] for j in range(3)] for i in range(3)]


def matvec(m, v):
    return [sum(m[i][j] * v[j] for j in range(3)) for i in range(3)]


def rotmat_to_euler_xyz(r):
    sy = math.sqrt(r[0][0] ** 2 + r[1][0] ** 2)
    if sy > 1e-6:
        x = math.atan2(r[2][1], r[2][2])
        y = math.atan2(-r[2][0], sy)
        z = math.atan2(r[1][0], r[0][0])
    else:
        x = math.atan2(-r[1][2], r[1][1])
        y = math.atan2(-r[2][0], sy)
        z = 0.0
    return x, y, z


def parse_images_txt(path):
    with open(path, encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip() and not line.startswith("#")]

    poses = []
    # Two lines per registered image: a pose line, then a 2D-points line we
    # don't need. IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME.
    for i in range(0, len(lines), 2):
        parts = lines[i].split()
        image_id = int(parts[0])
        qw, qx, qy, qz = (float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4]))
        tx, ty, tz = (float(parts[5]), float(parts[6]), float(parts[7]))
        name = parts[9]

        # COLMAP stores the WORLD-TO-CAMERA rotation/translation. The real
        # camera center in world space is C = -R^T * t — the standard SfM
        # convention, not something invented for this project.
        r = quat_to_rotmat(qw, qx, qy, qz)
        r_t = transpose(r)
        center = [-c for c in matvec(r_t, [tx, ty, tz])]
        euler = rotmat_to_euler_xyz(r_t)
        asset_id = os.path.splitext(name)[0]
        poses.append(
            {
                "assetId": asset_id,
                "x": center[0],
                "y": center[1],
                "z": center[2],
                "rotationX": euler[0],
                "rotationY": euler[1],
                "rotationZ": euler[2],
                "order": image_id,
            }
        )
    poses.sort(key=lambda p: p["order"])
    return poses


def post_result(app_url, secret, job_id, payload):
    req = urllib.request.Request(
        f"{app_url}/api/internal/camera-pose-jobs/{job_id}/complete",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        print(f"reported result: {resp.status}")


def main():
    app_url = os.environ["APP_URL"]
    secret = os.environ["CAMERA_POSE_SECRET"]
    job_id = os.environ["JOB_ID"]

    if not os.path.exists(IMAGES_TXT):
        post_result(
            app_url,
            secret,
            job_id,
            {
                "status": "FAILED",
                "error": "COLMAP did not produce a sparse reconstruction — likely not enough matched features between photos.",
            },
        )
        return

    poses = parse_images_txt(IMAGES_TXT)
    if len(poses) < 2:
        post_result(
            app_url,
            secret,
            job_id,
            {"status": "FAILED", "error": f"COLMAP only registered {len(poses)} camera(s) — not enough for a useful reconstruction."},
        )
        return

    post_result(app_url, secret, job_id, {"status": "COMPLETED", "poses": poses})


if __name__ == "__main__":
    main()

"""Build the simplified SVG paths of Argentine provinces used by the coverage map.

Source: Instituto Geográfico Nacional (IGN), WFS layer ign:provincia:
  curl -o provincias.json "https://wms.ign.gob.ar/geoserver/ign/ows?service=WFS&version=1.0.0\
&request=GetFeature&typeName=ign:provincia&outputFormat=application/json"

Usage (no dependencies):
  python3 -I web/scripts/build_map.py provincias.json web/src/data/argentina-provincias.json

It keeps the continental territory and Islas Malvinas, drops the Antarctic sector and the
farther South Atlantic islands (so the map fits on a phone), projects to Web Mercator and
simplifies each ring with Douglas-Peucker.
"""

import json
import math
import sys
from typing import Any

Point = tuple[float, float]

# lon/lat window kept on the map.
MIN_LON, MAX_LON, MIN_LAT, MAX_LAT = -74.0, -53.0, -56.0, -21.0
WIDTH = 400.0  # SVG width; height follows the projection.
TOLERANCE = 0.55  # Douglas-Peucker tolerance in SVG units.
MIN_RING_AREA = 1.5  # Drop islands smaller than this (SVG units²), unless it is the main ring.


def mercator(lon: float, lat: float) -> Point:
    x = math.radians(lon)
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def douglas_peucker(points: list[Point], tol: float) -> list[Point]:
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        (x1, y1), (x2, y2) = points[start], points[end]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-12
        best, idx = 0.0, -1
        for i in range(start + 1, end):
            px, py = points[i]
            dist = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
            if dist > best:
                best, idx = dist, i
        if best > tol and idx != -1:
            keep[idx] = True
            stack.extend([(start, idx), (idx, end)])
    return [p for p, k in zip(points, keep, strict=True) if k]


def simplify_ring(points: list[Point], tol: float) -> list[Point]:
    """Closed rings start and end on the same point, so split them before simplifying."""
    mid = len(points) // 2
    return douglas_peucker(points[: mid + 1], tol) + douglas_peucker(points[mid:], tol)[1:]


def ring_area(points: list[Point]) -> float:
    return abs(
        sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]))
    ) / 2


def in_window(ring: list[list[float]]) -> bool:
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return min(lons) >= MIN_LON and max(lons) <= MAX_LON and min(lats) >= MIN_LAT and max(lats) <= MAX_LAT


def main(src: str, dst: str) -> None:
    data: dict[str, Any] = json.load(open(src, encoding="utf-8"))
    x0, y_top = mercator(MIN_LON, MAX_LAT)
    x1, y_bottom = mercator(MAX_LON, MIN_LAT)
    scale = WIDTH / (x1 - x0)
    height = (y_top - y_bottom) * scale

    def to_svg(lon: float, lat: float) -> Point:
        x, y = mercator(lon, lat)
        return (x - x0) * scale, (y_top - y) * scale

    provinces = []
    for feature in data["features"]:
        name = feature["properties"]["nam"]
        geom = feature["geometry"]
        polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        rings: list[list[Point]] = []
        for polygon in polygons:
            outer = polygon[0]  # holes are irrelevant at this scale
            if not in_window(outer):
                continue
            pts = simplify_ring([to_svg(lon, lat) for lon, lat, *_ in outer], TOLERANCE)
            if len(pts) >= 4:
                rings.append(pts)
        if not rings:
            continue
        rings.sort(key=ring_area, reverse=True)
        rings = [rings[0]] + [r for r in rings[1:] if ring_area(r) >= MIN_RING_AREA]
        d = "".join(
            "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in ring[:-1]) + "Z" for ring in rings
        )
        cx, cy = (sum(c) / len(rings[0]) for c in zip(*rings[0], strict=True))
        short = "Tierra del Fuego" if name.startswith("Tierra del Fuego") else name
        provinces.append({"name": short, "d": d, "cx": round(cx, 1), "cy": round(cy, 1)})

    provinces.sort(key=lambda p: p["name"])
    out = {
        "source": "Instituto Geográfico Nacional (IGN), capa ign:provincia, simplificada",
        "viewBox": f"0 0 {WIDTH:.0f} {height:.0f}",
        "provinces": provinces,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(len(p["d"]) for p in provinces)
    print(f"{len(provinces)} provincias, {total / 1024:.1f} KB de paths → {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

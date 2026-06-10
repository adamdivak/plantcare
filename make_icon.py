#!/usr/bin/env python3
"""Generate the PlantCare app icon (full-bleed square; iOS applies its own mask)."""
import struct, zlib, math

S = 768                 # supersampled render size; downscaled by sips afterwards
S0 = 512.0              # design space
K = S / S0              # scale factor
buf = bytearray(S * S * 3)


def put(x, y, c):
    if 0 <= x < S and 0 <= y < S:
        i = (y * S + x) * 3
        buf[i], buf[i + 1], buf[i + 2] = c


def sc(v):
    return v * K


# --- Background: vertical blue gradient (matches theme-color #2196F3) ---
top = (66, 165, 245)
bot = (21, 101, 192)
for y in range(S):
    t = y / (S - 1)
    r = int(top[0] + (bot[0] - top[0]) * t)
    g = int(top[1] + (bot[1] - top[1]) * t)
    b = int(top[2] + (bot[2] - top[2]) * t)
    base = y * S * 3
    for x in range(S):
        i = base + x * 3
        buf[i] = r; buf[i + 1] = g; buf[i + 2] = b


def fill_ellipse(cx, cy, a, b, ang, color):
    cx, cy, a, b = sc(cx), sc(cy), sc(a), sc(b)
    ca, sa = math.cos(ang), math.sin(ang)
    R = int(max(a, b)) + 2
    for y in range(int(cy - R), int(cy + R) + 1):
        for x in range(int(cx - R), int(cx + R) + 1):
            dx, dy = x - cx, y - cy
            rx = dx * ca + dy * sa
            ry = -dx * sa + dy * ca
            if (rx / a) ** 2 + (ry / b) ** 2 <= 1:
                put(x, y, color)


def fill_trapezoid(y0, y1, top_l, top_r, bot_l, bot_r, color):
    y0i, y1i = int(sc(y0)), int(sc(y1))
    for y in range(y0i, y1i + 1):
        t = (y - y0i) / max(1, (y1i - y0i))
        l = sc(top_l) + (sc(bot_l) - sc(top_l)) * t
        r = sc(top_r) + (sc(bot_r) - sc(top_r)) * t
        for x in range(int(l), int(r) + 1):
            put(x, y, color)


def fill_round_rect(x0, y0, x1, y1, rad, color):
    x0, y0, x1, y1, rad = sc(x0), sc(y0), sc(x1), sc(y1), sc(rad)
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            cx = min(max(x, x0 + rad), x1 - rad)
            cy = min(max(y, y0 + rad), y1 - rad)
            if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad:
                put(x, y, color)


# --- Leaves (drawn outer -> center so the middle sits on top) ---
base_x, base_y = 256, 312
leaf_dark = (32, 110, 50)
leaf_green = (52, 160, 74)
leaf_light = (120, 205, 130)

leaves = [
    (-62, 150, 46),
    (62, 150, 46),
    (-32, 180, 50),
    (32, 180, 50),
    (0, 200, 52),
]
for deg, length, width in leaves:
    th = math.radians(deg)
    dirx, diry = math.sin(th), -math.cos(th)
    cx = base_x + dirx * length * 0.5
    cy = base_y + diry * length * 0.5
    ang = math.atan2(diry, dirx)
    fill_ellipse(cx, cy, length * 0.5 + 6, width * 0.5 + 6, ang, leaf_dark)   # outline
    fill_ellipse(cx, cy, length * 0.5, width * 0.5, ang, leaf_green)          # body
    fill_ellipse(cx, cy, length * 0.42, width * 0.16, ang, leaf_light)        # vein highlight

# --- Pot ---
fill_ellipse(256, 312, 96, 24, 0, (74, 52, 38))                  # soil
fill_round_rect(150, 300, 362, 344, 14, (224, 132, 74))          # rim
fill_trapezoid(344, 452, 168, 344, 196, 316, (200, 110, 58))     # body
fill_trapezoid(344, 360, 168, 344, 166, 346, (176, 92, 46))      # rim shadow under lip


# --- Write PNG (RGB) ---
def png_chunk(t, d):
    c = t + d
    return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)


raw = bytearray()
for y in range(S):
    raw.append(0)
    raw += buf[y * S * 3:(y + 1) * S * 3]

png = b"\x89PNG\r\n\x1a\n"
png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", S, S, 8, 2, 0, 0, 0))
png += png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
png += png_chunk(b"IEND", b"")

with open("icon-src.png", "wb") as f:
    f.write(png)
print("wrote icon-src.png", len(png), "bytes")

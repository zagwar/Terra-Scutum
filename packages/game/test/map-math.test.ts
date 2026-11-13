import { describe, expect, it } from 'vitest';
import { fitMapCamera, groundToScreen } from '../src/render/map/camera-fit';
import {
  cameraAlphaForHeading,
  edgeScrollDirection,
  glideFraction,
  screenAxes,
  tiltForZoom,
  wrappedDelta,
} from '../src/render/map/camera-motion';
import { createMapProjection } from '../src/render/map/map-projection';

describe('map projection', () => {
  const miller = createMapProjection({ type: 'miller', southLatitude: -60, northLatitude: 85 });

  it('is 360 units wide, with east at +x and north at +z', () => {
    expect(miller.width).toBe(360);
    expect(miller.x(-180)).toBe(-180);
    expect(miller.x(30)).toBe(30);
    expect(miller.z(0)).toBeCloseTo(0, 10);
    expect(miller.z(50)).toBeGreaterThan(miller.z(40));
    // Miller stretches the north: 60°N is further from the equator than 60 units.
    expect(miller.z(60)).toBeGreaterThan(60);
  });

  it('turns map positions back into longitude and latitude', () => {
    for (const latitude of [-55, -20, 0, 33.3, 48.86, 84]) {
      expect(miller.latitude(miller.z(latitude))).toBeCloseTo(latitude, 9);
    }
    const plain = createMapProjection({
      type: 'equirectangular',
      southLatitude: -90,
      northLatitude: 90,
    });
    expect(plain.z(42)).toBe(42);
    expect(plain.latitude(-17)).toBe(-17);
  });

  it('puts latitudes beyond the map on its edge', () => {
    expect(miller.z(-90)).toBe(miller.minZ);
    expect(miller.z(89)).toBe(miller.maxZ);
    expect(miller.minZ).toBeLessThan(0);
    expect(miller.maxZ).toBeGreaterThan(0);
  });

  it('wraps east–west: every copy of the world maps back to the main one', () => {
    expect(miller.wrapX(0)).toBe(0);
    expect(miller.wrapX(190)).toBe(-170);
    expect(miller.wrapX(-190)).toBe(170);
    expect(miller.wrapX(180)).toBe(-180);
    expect(miller.wrapX(2.35 + 720)).toBeCloseTo(2.35, 9);
    expect(miller.longitude(362.35)).toBeCloseTo(2.35, 9);
  });
});

describe('camera fit', () => {
  const map = { halfWidth: 180, minZ: -68.6, maxZ: 117.3 };
  const cases = [
    { name: 'a 16:9 window', aspect: 16 / 9 },
    { name: 'a tall window', aspect: 0.6 },
    { name: 'an ultra-wide window', aspect: 3.5 },
  ];

  for (const { name, aspect } of cases) {
    it(`shows the whole map in ${name}, as large as possible`, () => {
      const input = { ...map, aspect, fieldOfView: 0.63, tilt: 0.38, margin: 0.02 };
      const fit = fitMapCamera(input);
      const corners = [
        groundToScreen(-180, map.minZ, fit, input),
        groundToScreen(180, map.minZ, fit, input),
        groundToScreen(-180, map.maxZ, fit, input),
        groundToScreen(180, map.maxZ, fit, input),
      ];
      let largest = 0;
      for (const corner of corners) {
        expect(Math.abs(corner.x)).toBeLessThanOrEqual(0.98 + 1e-6);
        expect(Math.abs(corner.y)).toBeLessThanOrEqual(0.98 + 1e-6);
        largest = Math.max(largest, Math.abs(corner.x), Math.abs(corner.y));
      }
      // Tight: the map touches the margin on at least one side.
      expect(largest).toBeGreaterThan(0.979);
      // Centered top to bottom.
      expect(corners[0].y).toBeCloseTo(-corners[2].y, 5);
    });
  }

  it('looking straight down, the screen position is plain trigonometry', () => {
    const view = { aspect: 2, fieldOfView: Math.PI / 2, tilt: 0 };
    const screen = groundToScreen(50, 25, { radius: 100, targetZ: 0 }, view);
    expect(screen.x).toBeCloseTo(0.25, 9);
    expect(screen.y).toBeCloseTo(0.25, 9);
  });
});

describe('strategy camera math', () => {
  it('leans back more the closer the camera zooms in', () => {
    const far = 0.4;
    const near = 0.8;
    expect(tiltForZoom(1, 80, far, near)).toBe(far);
    expect(tiltForZoom(80, 80, far, near)).toBeCloseTo(near, 12);
    // Halfway in zoom steps (√80 ≈ 8.9×) is halfway in tilt.
    expect(tiltForZoom(Math.sqrt(80), 80, far, near)).toBeCloseTo((far + near) / 2, 12);
    expect(tiltForZoom(200, 80, far, near)).toBeCloseTo(near, 12);
    expect(tiltForZoom(5, 1, far, near)).toBe(far);
  });

  it('glides the same way at every frame rate', () => {
    // Ten frames of 1/100 s cover the same part of the way as one frame of 1/10 s.
    const tenSmall = 1 - (1 - glideFraction(0.01, 0.1)) ** 10;
    expect(tenSmall).toBeCloseTo(glideFraction(0.1, 0.1), 12);
    expect(glideFraction(0.1, 0.1)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(glideFraction(0.016, 0)).toBe(1);
    expect(glideFraction(Infinity, 0.1)).toBe(1);
  });

  it('takes the short way around the world and around the compass', () => {
    expect(wrappedDelta(170, -170, 360)).toBeCloseTo(20, 12);
    expect(wrappedDelta(-170, 170, 360)).toBeCloseTo(-20, 12);
    expect(wrappedDelta(10, 40, 360)).toBe(30);
    expect(wrappedDelta(0.1, 2 * Math.PI - 0.1, 2 * Math.PI)).toBeCloseTo(-0.2, 12);
  });

  it('turns the screen directions with the heading', () => {
    const north = screenAxes(0);
    expect(north.up.x).toBeCloseTo(0, 12);
    expect(north.up.z).toBeCloseTo(1, 12);
    expect(north.right.x).toBeCloseTo(1, 12);
    expect(north.right.z).toBeCloseTo(0, 12);
    // Facing east: up is east, right is south.
    const east = screenAxes(Math.PI / 2);
    expect(east.up.x).toBeCloseTo(1, 12);
    expect(east.right.z).toBeCloseTo(-1, 12);
    // The camera sits behind its target: south of it when facing north.
    expect(cameraAlphaForHeading(0)).toBeCloseTo(-Math.PI / 2, 12);
    expect(Math.cos(cameraAlphaForHeading(Math.PI / 2))).toBeCloseTo(-1, 12);
  });

  it('scrolls at the window edges only', () => {
    expect(edgeScrollDirection({ x: 640, y: 360 }, 1280, 720, 8)).toEqual({ right: 0, up: 0 });
    expect(edgeScrollDirection({ x: 2, y: 360 }, 1280, 720, 8)).toEqual({ right: -1, up: 0 });
    expect(edgeScrollDirection({ x: 1279, y: 0 }, 1280, 720, 8)).toEqual({ right: 1, up: 1 });
    expect(edgeScrollDirection({ x: 640, y: 715 }, 1280, 720, 8)).toEqual({ right: 0, up: -1 });
    expect(edgeScrollDirection({ x: 0, y: 0 }, 1280, 720, 0)).toEqual({ right: 0, up: 0 });
  });
});

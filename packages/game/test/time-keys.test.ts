import { describe, expect, it } from 'vitest';
import { timeKeyAction } from '../src/ui/time-keys';

const press = (code: string, extra: Partial<Parameters<typeof timeKeyAction>[0]> = {}) =>
  timeKeyAction({ code, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra });

describe('time keys (F04)', () => {
  it('Space pauses and unpauses', () => {
    expect(press('Space')).toEqual({ kind: 'togglePause' });
    // Holding Space down doesn't flicker between paused and running.
    expect(press('Space', { repeat: true })).toBeNull();
  });

  it('1–5 on the top row or the number pad choose the speed', () => {
    for (let speed = 1; speed <= 5; speed++) {
      expect(press(`Digit${speed}`)).toEqual({ kind: 'setSpeed', speed });
      expect(press(`Numpad${speed}`)).toEqual({ kind: 'setSpeed', speed });
    }
    expect(press('Digit6')).toBeNull();
    expect(press('Digit0')).toBeNull();
    expect(press('Numpad9')).toBeNull();
  });

  it("the number pad's + and − change the speed by one; the main keyboard's stay with the camera", () => {
    expect(press('NumpadAdd')).toEqual({ kind: 'faster' });
    expect(press('NumpadSubtract')).toEqual({ kind: 'slower' });
    expect(press('NumpadAdd', { repeat: true })).toEqual({ kind: 'faster' });
    expect(press('Equal')).toBeNull();
    expect(press('Minus')).toBeNull();
  });

  it('leaves browser shortcuts alone', () => {
    expect(press('Digit1', { ctrlKey: true })).toBeNull();
    expect(press('Space', { metaKey: true })).toBeNull();
    expect(press('NumpadAdd', { altKey: true })).toBeNull();
  });

  it('ignores other keys', () => {
    for (const code of ['KeyW', 'KeyQ', 'Home', 'ArrowUp', 'Enter']) expect(press(code)).toBeNull();
  });
});

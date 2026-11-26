/* eslint-env jest */
// Lot C1: the strict reading of the raw lines (report-proof.js), field by field.
import { readStatus, readModal } from '../report-proof';

describe('C1: readStatus, a field counts only when it is whole and alone', () => {
  test('position: one MPos: or WPos: in the whole line, 3 to 6 plain numbers, the values of the raw field', () => {
    expect(readStatus('<Idle|MPos:1,2,3|FS:0,0>')).toMatchObject({ state: 'Idle', frame: 'm', xyz: { x: 1, y: 2, z: 3 }, speed: 0 });
    expect(readStatus('<Hold:0|WPos:-1.500,2.000,3.000,0.000|FS:500,8000>')).toMatchObject({ state: 'Hold', frame: 'w', xyz: { x: -1.5, y: 2, z: 3 }, speed: 8000 });
    ['<Idle|MPos:1,2,3foo>', '<Idle|MPos:1,2>', '<Idle|MPos:1,2,>', '<Idle|MPos:>', '<Idle|MPos:1,2,3|MPos:1,2,3>', '<Idle|MPos:1,2,3|junk:MPos:4,5,6>',
      '<Idle|MPos:1,2,-20|junk:WPos:1,2,-40>', '<Idle|WPos:1,2,-20|junk:MPos:1,2,-40>', '<Idle|MPos:1,2,3,4,5,6,7>', '<Idle|MPos:1,2,3', 'Idle|MPos:1,2,3', '<Idle,MPos:1,2,3,WPos:1,2,3>'
    ].forEach((line) => expect([line, readStatus(line).xyz]).toEqual([line, null]));
  });

  test('speed: one FS: in the whole line, two unsigned numbers', () => {
    expect(readStatus('<Run|MPos:1,2,3|FS:500.0,12000>').speed).toBe(12000);
    ['<Idle|FS:0>', '<Idle|FS:0,>', '<Idle|FS:0,-1>', '<Idle|FS:0,0foo>', '<Idle|FS:0,0|FS:0,0>', '<Idle|FS:0,0|junk:FS:0,1000>', '<Idle|F:500>', '<Idle>']
      .forEach((line) => expect([line, readStatus(line).speed]).toEqual([line, null]));
  });

  test('offset: one whole WCO: in the line; broken when the text is there otherwise; the accessory letters', () => {
    expect(readStatus('<Idle|MPos:1,2,3|WCO:0,0,-5>')).toMatchObject({ wco: { x: 0, y: 0, z: -5 }, wcoBroken: false });
    expect(readStatus('<Idle|MPos:1,2,3>')).toMatchObject({ wco: null, wcoBroken: false });
    ['<Idle|WCO:0,0,20|junk:WCO:0,0,0>', '<Idle|WCO:0,0>', '<Idle|WCO:0,0,1x>'].forEach((line) => expect([line, readStatus(line)]).toEqual([line, expect.objectContaining({ wco: null, wcoBroken: true })]));
    expect(readStatus('<Idle|MPos:1,2,3|Ov:100,100,100|A:SF>').accessory).toBe('SF');
    expect(readStatus('<Idle|MPos:1,2,3|Ov:100,100,100>').accessory).toBe('');
  });
});

describe('C1: readModal, M5 only when it is the one spindle word', () => {
  test('one word among M3, M4, M5', () => {
    expect(readModal('[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]')).toEqual({ spindle: 'M5', mode: 'M5' });
    expect(readModal('[GC:G0 G54 G17 G21 G90 G94 M3 M9 T0 F0 S0]')).toEqual({ spindle: 'on', mode: 'M3' });
    expect(readModal('[GC:G0 G54 G17 G21 G90 G94 M4 M9 T0 F0 S1000]')).toEqual({ spindle: 'on', mode: 'M4' });
    ['[GC:G0 G54 G17 G21 G90 G94 M9 T0 F0 S0]', '[GC:G0 G54 M3 M5 M9 T0 F0 S0]', '[GC:G0 G54 M5 M5]', 'GC:G0 M5', undefined]
      .forEach((line) => expect([line, readModal(line)]).toEqual([line, { spindle: null, mode: null }]));
  });
});

import { describe, it, expect } from 'vitest'
import { displayCase, telHref } from './jobDisplay'

describe('displayCase', () => {
  it('title-cases shouting portal addresses', () => {
    expect(displayCase('159 MAZENGARB RD PARAPARAUMU NZ 5032'))
      .toBe('159 Mazengarb Rd Paraparaumu NZ 5032')
  })
  it('title-cases shouting client names', () => {
    expect(displayCase('DAVID MUDGE')).toBe('David Mudge')
  })
  it('leaves mixed-case strings untouched', () => {
    expect(displayCase('Upper Hutt City Council - Moonshine Park'))
      .toBe('Upper Hutt City Council - Moonshine Park')
    expect(displayCase("Jenny O'Brien")).toBe("Jenny O'Brien")
  })
  it('keeps NZ uppercase and handles macrons', () => {
    expect(displayCase('205 NAENAE RD NAENAE NZ')).toBe('205 Naenae Rd Naenae NZ')
    expect(displayCase('TŌTARA PARK')).toBe('Tōtara Park')
  })
  it('leaves short codes alone', () => {
    expect(displayCase('GNL')).toBe('GNL')
    expect(displayCase(null)).toBe(null)
  })
})

describe('telHref', () => {
  it('strips spaces and keeps +', () => {
    expect(telHref('+64 27 433 9296')).toBe('tel:+64274339296')
    expect(telHref('021 137 2017')).toBe('tel:0211372017')
    expect(telHref(null)).toBe(null)
  })
})

import { describe, it, expect } from 'vitest'
import {
  slugify, validatePost, effectivePlatforms, buildBlogSocialPost, summariseResults,
} from './marketing'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Storm Damage Tree Removal')).toBe('storm-damage-tree-removal')
  })
  it('strips punctuation and accents', () => {
    expect(slugify('Pōhutukawa: pruning & care!')).toBe('pohutukawa-pruning-care')
  })
  it('trims stray hyphens', () => {
    expect(slugify('  --Hello--  ')).toBe('hello')
  })
  it('falls back when there are no usable characters', () => {
    expect(slugify('!!!', 'article')).toBe('article')
  })
})

describe('validatePost', () => {
  it('requires a caption or photo and a channel', () => {
    const { errors, ok } = validatePost({ body: '', platforms: [], imageUrls: [] })
    expect(ok).toBe(false)
    expect(errors).toContain('Add a caption or at least one photo')
    expect(errors).toContain('Choose at least one channel to post to')
  })
  it('passes with a caption and a channel', () => {
    const { ok, errors } = validatePost({ body: 'Fresh mulch available', platforms: ['facebook'], imageUrls: [] })
    expect(ok).toBe(true)
    expect(errors).toHaveLength(0)
  })
  it('warns (not errors) when Instagram is chosen without a photo', () => {
    const { warnings, ok } = validatePost({ body: 'hi', platforms: ['instagram'], imageUrls: [] })
    expect(ok).toBe(true)
    expect(warnings[0]).toMatch(/Instagram needs a photo/)
  })
  it('rejects a schedule time in the past', () => {
    const { errors } = validatePost({ body: 'hi', platforms: ['facebook'], scheduledAt: '2000-01-01T00:00:00Z' })
    expect(errors).toContain('Schedule time is in the past')
  })
})

describe('effectivePlatforms', () => {
  it('drops image-only channels when there is no photo', () => {
    expect(effectivePlatforms(['facebook', 'instagram'], [])).toEqual(['facebook'])
  })
  it('keeps all channels when a photo is present', () => {
    expect(effectivePlatforms(['facebook', 'instagram'], ['x.jpg'])).toEqual(['facebook', 'instagram'])
  })
})

describe('buildBlogSocialPost', () => {
  const blog = { id: 'b1', slug: 'storm-safety', title: 'Storm Safety', excerpt: 'Stay safe.', cover_image_url: 'cover.jpg' }
  it('links to the public blog page and carries the cover image', () => {
    const p = buildBlogSocialPost(blog, { blogBaseUrl: 'https://app.example.com/blog/' })
    expect(p.link_url).toBe('https://app.example.com/blog/storm-safety')
    expect(p.image_urls).toEqual(['cover.jpg'])
    expect(p.kind).toBe('blog')
    expect(p.blog_id).toBe('b1')
    expect(p.body).toContain('Storm Safety')
    expect(p.body).toContain('Stay safe.')
  })
  it('handles a blog with no cover image', () => {
    const p = buildBlogSocialPost({ ...blog, cover_image_url: null }, { blogBaseUrl: 'https://app.example.com/blog' })
    expect(p.image_urls).toEqual([])
  })
})

describe('summariseResults', () => {
  it('counts successes and collects failures', () => {
    const s = summariseResults({ facebook: { ok: true }, instagram: { ok: false, error: 'no photo' } })
    expect(s.ok).toBe(1)
    expect(s.total).toBe(2)
    expect(s.failed).toHaveLength(1)
    expect(s.failed[0][0]).toBe('instagram')
  })
})

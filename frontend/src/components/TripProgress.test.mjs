import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM, VirtualConsole } from 'jsdom'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import React, { act } from 'react'

async function loadTripProgress() {
  const temp = await mkdtemp(
    fileURLToPath(new URL('../../node_modules/.trip-progress-test-', import.meta.url))
  )
  const output = join(temp, 'TripProgress.mjs')
  await build({
    entryPoints: [fileURLToPath(new URL('./TripProgress.jsx', import.meta.url))],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
  })
  return { temp, mod: await import(pathToFileURL(output).href) }
}

async function withRenderedProgress({ currentStep, variant = 'bar', request = null, planId = null }, fn) {
  const virtualConsole = new VirtualConsole()
  const runtimeErrors = []
  virtualConsole.on('jsdomError', (err) => runtimeErrors.push(err.message))
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', virtualConsole })
  if (request) {
    dom.window.sessionStorage.setItem('tpva-travel-request', JSON.stringify(request))
  }
  if (planId) {
    dom.window.localStorage.setItem('tpva_selected_plan_id', planId)
  }

  const replacements = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    sessionStorage: dom.window.sessionStorage,
    localStorage: dom.window.localStorage,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const originals = new Map(
    Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }

  const { temp, mod } = await loadTripProgress()
  let root
  try {
    const { createRoot } = await import('react-dom/client')
    const { MemoryRouter } = await import('react-router-dom')
    root = createRoot(dom.window.document.querySelector('#root'))
    await act(async () => {
      root.render(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(mod.TripProgress, { currentStep, variant })
        )
      )
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    await fn(dom.window.document, mod)
    assert.deepEqual(runtimeErrors, [])
  } finally {
    if (root) await act(async () => root.unmount())
    await rm(temp, { recursive: true, force: true })
    dom.window.close()
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

test('Step 3 cannot unlock when Step 2 has no trip request, even with a stale selected plan', async () => {
  await withRenderedProgress(
    { currentStep: 1, variant: 'sidebar', request: null, planId: 'stale-plan-1' },
    (doc, mod) => {
      assert.equal(mod.isProgressStepLocked(2, 1, { step2: false, step3: true }), true)
      assert.equal(mod.isProgressStepLocked(3, 1, { step2: false, step3: true }), true)

      const items = [...doc.querySelectorAll('.progress-steps > li')]
      assert.equal(items.length, 3)
      assert.ok(items[0].querySelector('a'))
      assert.equal(items[1].querySelector('a'), null)
      assert.equal(items[1].querySelector('.progress-step')?.getAttribute('aria-disabled'), 'true')
      assert.equal(items[2].querySelector('a'), null)
      assert.equal(items[2].querySelector('.progress-step')?.getAttribute('aria-disabled'), 'true')
      assert.equal(items[2].querySelector('.progress-step')?.getAttribute('title'), 'Complete trip details first')
    }
  )
})

test('Opening Step 3 directly without a trip request keeps Step 2 locked and never marks it complete', async () => {
  await withRenderedProgress(
    { currentStep: 3, variant: 'bar', request: null, planId: 'plan-1' },
    (doc, mod) => {
      assert.equal(mod.isProgressStepLocked(1, 3, { step2: false, step3: true }), false)
      assert.equal(mod.isProgressStepLocked(2, 3, { step2: false, step3: true }), true)
      assert.equal(mod.isProgressStepLocked(3, 3, { step2: false, step3: true }), false)

      const items = [...doc.querySelectorAll('.progress-steps > li')]
      assert.ok(items[0].querySelector('a'))
      assert.ok(items[0].classList.contains('complete'))

      assert.equal(items[1].querySelector('a'), null, 'Step 2 must stay locked without tpva-travel-request')
      assert.ok(items[1].classList.contains('locked'))
      assert.equal(items[1].classList.contains('complete'), false)
      assert.equal(items[1].querySelector('.progress-step')?.getAttribute('aria-disabled'), 'true')
      assert.equal(items[1].querySelector('small')?.textContent, 'Locked')

      assert.ok(items[2].querySelector('a'))
      assert.ok(items[2].classList.contains('current'))
    }
  )
})

test('Step 2 unlocks once trip request exists while Step 3 waits for plan selection', async () => {
  await withRenderedProgress(
    { currentStep: 1, variant: 'sidebar', request: { departureLocation: 'Hue' }, planId: null },
    (doc) => {
      const items = [...doc.querySelectorAll('.progress-steps > li')]
      assert.ok(items[1].querySelector('a'))
      assert.equal(items[2].querySelector('a'), null)
      assert.equal(items[2].querySelector('.progress-step')?.getAttribute('title'), 'Choose an itinerary first')
    }
  )
})

test('All 3 steps unlock when both trip request and selected plan exist', async () => {
  for (const currentStep of [1, 2, 3]) {
    await withRenderedProgress(
      { currentStep, variant: 'bar', request: { departureLocation: 'Hue' }, planId: 'plan-1' },
      (doc) => {
        const items = [...doc.querySelectorAll('.progress-steps > li')]
        assert.ok(items[0].querySelector('a'))
        assert.ok(items[1].querySelector('a'))
        assert.ok(items[2].querySelector('a'))
      }
    )
  }
})

/**
 * End-to-end smoke test of the critical flow: sign up -> create a pet ->
 * dashboard -> care action -> daily reward -> shop purchase.
 *
 *   npm run dev            (in another terminal, with supabase running)
 *   node tests/smoke.mjs   (add --headed to watch it)
 *
 * Fails loudly on the first broken step, and on any console error or failed
 * request the page produced along the way.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const email = `smoke-${Date.now()}@example.com`
const problems = []

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
})
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
page.on('requestfailed', (req) => problems.push(`request failed: ${req.url()}`))

const step = async (name, fn) => {
  process.stdout.write(`- ${name} ... `)
  try {
    await fn()
    console.log('ok')
  } catch (err) {
    console.log('FAILED')
    await page.screenshot({ path: `tests/failure-${name.replace(/\W+/g, '-')}.png` })
    throw err
  }
}

await step('sign up', async () => {
  await page.goto(`${BASE}/login`)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', 'password123')
  await page.click('button[value="signup"]')
  await page.waitForURL('**/create', { timeout: 20_000 })
})

await step('create a pet', async () => {
  await page.click('button:has-text("Dog")')
  await page.selectOption('select[name="breed"]', 'Border Collie')
  await page.fill('input[name="name"]', 'Charlie')
  await page.click('label:has-text("playful")')
  // The Pixi preview must actually mount a canvas.
  await page.waitForSelector('canvas', { timeout: 20_000 })
  await page.click('button:has-text("Bring them home")')
  await page.waitForURL(BASE + '/', { timeout: 20_000 })
})

await step('dashboard renders the pet', async () => {
  await page.waitForSelector('h1:has-text("Charlie")')
  await page.waitForSelector('canvas')
  const meters = await page.locator('[role="meter"]').count()
  if (meters !== 7) throw new Error(`expected 7 stat meters, found ${meters}`)
})

const coins = () =>
  page.evaluate(() => Number(/(\d+) coins/.exec(document.body.innerText)?.[1] ?? -1))

const doAction = async (label) => {
  const before = await coins()
  await page.click(`button:has-text("${label}")`)
  await page.waitForFunction(
    (prev) => Number(/(\d+) coins/.exec(document.body.innerText)?.[1] ?? -1) > prev,
    before,
    { timeout: 20_000 }
  )
}

await step('care action pays out', async () => {
  await doAction('Feed')
  // First feed unlocks an achievement worth 10 coins on top of the action coin.
  const balance = await coins()
  if (balance !== 11) throw new Error(`expected 11 coins after the first feed, got ${balance}`)
})

await step('cooldown disables the button', async () => {
  const feed = page.locator('button:has-text("Feed")')
  if (!(await feed.isDisabled())) throw new Error('Feed should be on cooldown')
})

await step('remaining care actions work', async () => {
  for (const label of ['Water', 'Play', 'Walk', 'Groom', 'Train', 'Sleep']) {
    await doAction(label)
  }
})

await step('daily reward claims once', async () => {
  await page.click('button:has-text("Gift")')
  await page.waitForSelector('button:has-text("Claimed")', { timeout: 20_000 })
})

await step('journal shows achievements and feed', async () => {
  await page.click('a:has-text("Journal")')
  await page.waitForURL('**/journal')
  await page.waitForSelector('li:has-text("First Meal")', { timeout: 20_000 })
  await page.waitForSelector('text=From Charlie', { timeout: 20_000 })
})

await step('shop sells an accessory', async () => {
  await page.click('a:has-text("Shop")')
  await page.waitForURL('**/shop')
  await page.click('li:has-text("Red Collar") button')
  await page.waitForSelector('li:has-text("Red Collar") button:has-text("Wear")', { timeout: 20_000 })
  await page.click('li:has-text("Red Collar") button:has-text("Wear")')
  await page.waitForSelector('li:has-text("Red Collar") button:has-text("Worn")', { timeout: 20_000 })
})

await step('settings page loads', async () => {
  await page.goto(`${BASE}/settings`)
  await page.waitForSelector('h1', { timeout: 20_000 })
  await page.screenshot({ path: 'tests/settings.png', fullPage: true })
})

await step('cron endpoint rejects a bad secret', async () => {
  const res = await page.request.post(`${BASE}/api/cron/notify-check`, {
    headers: { authorization: 'Bearer wrong' },
  })
  if (res.status() !== 401) throw new Error(`expected 401, got ${res.status()}`)
})

await step('cron endpoint runs with the right secret', async () => {
  const secret = process.env.CRON_SECRET ?? 'local-dev-cron-secret'
  const res = await page.request.post(`${BASE}/api/cron/notify-check`, {
    headers: { authorization: `Bearer ${secret}` },
  })
  const body = await res.json()
  if (res.status() !== 200) throw new Error(`expected 200, got ${res.status()}`)
  if (body.errors !== 0) throw new Error(`notify-check reported ${body.errors} errors`)
})

await step('dashboard survives a reload', async () => {
  await page.goto(`${BASE}/`)
  await page.waitForSelector('canvas', { timeout: 20_000 })
  await page.screenshot({ path: 'tests/dashboard.png', fullPage: true })
})

await browser.close()

// Ignore the noise a local dev stack always makes; fail on anything else.
const real = problems.filter((p) => !/favicon|_next\/static\/.*\.map|websocket/i.test(p))
if (real.length) {
  console.error('\nPage problems:')
  for (const p of new Set(real)) console.error('  ' + p)
  process.exit(1)
}

console.log(`\nAll steps passed as ${email}`)

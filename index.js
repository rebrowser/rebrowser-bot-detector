const usePatchesTip = 'Use <a href="https://github.com/rebrowser/rebrowser-patches" target="_blank">rebrowser-patches</a> to fix it.'
const noFixTip = 'No fix available. Follow <a href="https://github.com/rebrowser/rebrowser-patches" target="_blank">rebrowser-patches</a> to stay up-to-date.'

function dummyFnInit() {
  addDetection({
    type: 'dummyFn',
    rating: 0,
    note: 'Call <code>window.dummyFn()</code> to test if you can access main world objects.',
  })

  window.dummyFn = () => {
    addDetection({
      type: 'dummyFn',
      rating: -1,
      note: '<code>window.dummyFn()</code> was called! It means you can interact with main world objects.',
    })
    return true
  }
}

function runtimeEnableLeakInit() {
  // With Runtime.enable on, Chrome serializes every console argument for Runtime.consoleAPICalled.
  // Since Chrome 137 that no longer runs a user getter on error.stack, but it still formats the stack
  // (Error.prepareStackTrace runs) and reads error.name an extra time.
  const vars = window.runtimeEnableLeakVars = {
    stackLookupCount: 0, // user getter on error.stack: Chrome <= 136, or devtools open
    prepareStackTraceCount: 0,
    nameGetterCount: 0, // 1 per round normally, 3 with Runtime.enable
    rounds: 0,
  }
  const isChromium = navigator.userAgentData !== undefined

  const testRuntimeEnableLeak = () => {
    vars.rounds += 1

    const e = new Error()
    Object.defineProperty(e, 'stack', {
      configurable: false,
      enumerable: false,
      get() {
        vars.stackLookupCount += 1
        return ''
      },
    })
    console.debug(e)

    const originalDescriptor = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace')
    // a data property is swapped in and the saved descriptor put back, so even an accessor is left as found;
    // a non-configurable property can't be put back, so the probe is skipped then
    if (!originalDescriptor || originalDescriptor.configurable) {
      const originalPrepareStackTrace = Error.prepareStackTrace
      let probeError
      Object.defineProperty(Error, 'prepareStackTrace', {
        configurable: true,
        writable: true,
        value: (error, frames) => {
          if (error === probeError) {
            vars.prepareStackTraceCount += 1
          }
          return originalPrepareStackTrace ? originalPrepareStackTrace(error, frames) : String(error)
        },
      })
      try {
        probeError = new Error('runtimeEnableLeak')
        console.debug(probeError)
      } finally {
        // on a fresh page prepareStackTrace isn't an own property at all
        if (originalDescriptor) {
          Object.defineProperty(Error, 'prepareStackTrace', originalDescriptor)
        } else {
          delete Error.prepareStackTrace
        }
      }
    } else {
      vars.prepareStackTraceSkipped = true
    }

    class RuntimeEnableLeakError extends Error {
      get name() {
        vars.nameGetterCount += 1
        return 'RuntimeEnableLeakError'
      }
    }
    console.debug(new RuntimeEnableLeakError('runtimeEnableLeak'))

    const extraNameLookups = isChromium && vars.nameGetterCount / vars.rounds > 1.5
    if (vars.prepareStackTraceCount > 0 || extraNameLookups) {
      addDetection({
        type: 'runtimeEnableLeak',
        rating: 1,
        note: `<div>Something serializes <code>console</code> arguments: CDP <code>Runtime.enable</code> (automation), open devtools, or a logging library or extension that inspects console calls. If it's your automation, ${usePatchesTip.charAt(0).toLowerCase()}${usePatchesTip.slice(1)}</div>`,
        debug: { ...vars },
      })
      return
    }
    if (vars.stackLookupCount > 0) {
      addDetection({
        type: 'runtimeEnableLeak',
        rating: 1,
        note: `
            <div>Something read the stack of a logged error: CDP <code>Runtime.enable</code> (automation, Chrome 136 and older), open devtools (a red flag for any anti-bot system), or a logging library or extension that inspects console calls.</div>
            <div>If it's your automation, ${usePatchesTip.charAt(0).toLowerCase()}${usePatchesTip.slice(1)}</div>
       `,
        debug: { ...vars },
      })
      return
    }

    // every 100 ms for the first 10 s, then every second to keep the console quieter
    setTimeout(testRuntimeEnableLeak, vars.rounds < 100 ? 100 : 1000)
  }

  addDetection({
    type: 'runtimeEnableLeak',
    rating: -1,
    note: 'No leak detected.',
  })

  testRuntimeEnableLeak()
}

function testExposeFunctionLeakInit() {
  const testExposeFunctionLeak = async () => {
    const detection = {
      type: 'exposeFunctionLeak',
      note: 'No leak detected.',
      rating: -1,
    }

    if (typeof window.exposedFn === 'undefined') {
      detection.rating = 0
      detection.note = 'No <code>window.exposedFn</code>. Use <code>page.exposeFunction</code> to trigger this test.'
    } else if (window.exposedFn.toString()?.includes('This is the Puppeteer binding')) {
      detection.rating = 1
      detection.note = `
        <div>You're using unpatched Puppeteer and method <code>page.exposeFunction</code>.</div>
        <div>${noFixTip}</div>
        <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
      `
      detection.debug = {
        'exposedFn.toString()': window.exposedFn.toString(),
      }
    } else if (window.exposedFn.toString()?.includes('exposeBindingHandle supports a single argument')) {
      detection.rating = 1
      detection.note = `
        <div>You're using unpatched Playwright and method <code>page.exposeFunction</code>.</div>
        <div>${noFixTip}</div>
        <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
      `
      detection.debug = {
        'exposedFn.toString()': window.exposedFn.toString(),
      }
    } else {
      for (const key in window) {
        if (key.startsWith('puppeteer_')) {
          detection.rating = 1
          detection.note = `
            <div>You're using unpatched Puppeteer and method <code>page.exposeFunction</code>.</div>
            <div>${noFixTip}</div>
            <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
          `
          detection.debug = {
            windowKey: key,
          }
          break
        }
        if (key === '__playwright__binding__') {
          detection.rating = 1
          detection.note = `
            <div>You're using unpatched Playwright and method <code>page.exposeFunction</code> as it creates <code>window.__playwright__binding__</code> object.</div>
            <div>${noFixTip}</div>
            <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
          `
          detection.debug = {
            windowKey: key,
          }
          break
        }
        if (typeof window[key] === 'function' && window[key].__installed === true) {
          detection.rating = 1
          detection.note = `
            <div>You're using unpatched Playwright and method <code>page.exposeFunction</code>. It's detected because the exposed function has a property <code>__installed = true</code>.</div>
            <div>${noFixTip}</div>
            <div>Remove <code>page.exposeFunction</code> from your code to avoid this leak.</div>
          `
          detection.debug = {
            windowKey: key,
          }
          break
        }
      }
    }

    addDetection(detection)
    setTimeout(testExposeFunctionLeak, 100)
  }
  testExposeFunctionLeak()
}

function testPwInitScriptsInit() {
  const testPwInitScripts = async () => {
    if (window.__pwInitScripts !== undefined) {
      addDetection({
        type: 'pwInitScripts',
        rating: 1,
        note: `
            <div>You're using unpatched Playwright as it creates <code>window.__pwInitScripts</code> object.</div>
            <div>${noFixTip}</div>
       `,
        debug: {
          __pwInitScripts: window.__pwInitScripts,
        },
      })
      return
    }

    setTimeout(testPwInitScripts, 100)
  }

  addDetection({
    type: 'pwInitScripts',
    rating: -1,
    note: 'No <code>window.__pwInitScripts</code> detected.',
  })

  testPwInitScripts()
}

// adds a detection rated by the strongest fired signal; if none fired, a green one, or a neutral one when a
// check couldn't run (inconclusiveNote)
function addSignalsDetection(type, signals, okNote, debug, inconclusiveNote) {
  const fired = signals.filter(Boolean)
  if (!fired.length) {
    addDetection({ type, rating: inconclusiveNote ? 0 : -1, note: inconclusiveNote || okNote, debug })
    return
  }
  addDetection({
    type,
    rating: Math.max(...fired.map(s => s.rating)),
    note: fired.map(s => `<div>${s.rating === 1 ? '🔴' : '🟡'} ${s.note}</div>`).join(''),
    debug,
  })
}

function osFromUserAgent(ua) {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Android/.test(ua)) return 'Android'
  if (/CrOS/.test(ua)) return 'Chrome OS'
  if (/Macintosh|Mac OS X/.test(ua)) return 'macOS'
  if (/Linux|X11/.test(ua)) return 'Linux'
  return null
}

// navigator.platform can't tell Linux, Android and Chrome OS apart, so compare OS families
function osFamily(os) {
  return ['Android', 'Chrome OS', 'Chromium OS'].includes(os) ? 'Linux' : os
}

function osFamilyFromPlatform(platform) {
  if (/^Win/.test(platform)) return 'Windows'
  if (/^Mac/.test(platform)) return 'macOS'
  if (/^(Linux|Android)/.test(platform)) return 'Linux'
  if (/^(iPhone|iPad|iPod)/.test(platform)) return 'iOS'
  return null
}

function chromiumMajorVersion() {
  const brand = navigator.userAgentData?.brands.find(b => b.brand === 'Chromium')
  if (brand) {
    return parseInt(brand.version, 10)
  }
  const match = navigator.userAgent.match(/Chrome\/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

function isMobileUserAgent() {
  return navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent)
}

function getSystemColor(name, colorScheme) {
  const el = document.createElement('div')
  // important inline styles win over page rules like `div { color-scheme: dark !important }`
  el.style.setProperty('color-scheme', colorScheme, 'important')
  el.style.setProperty('color', name, 'important')
  document.body.appendChild(el)
  const color = getComputedStyle(el).color
  el.remove()
  return color
}

async function testHeadless() {
  const ua = navigator.userAgent
  const brands = navigator.userAgentData?.brands.map(b => b.brand) || []
  const isDesktop = !isMobileUserAgent()
  const isChromium = navigator.userAgentData !== undefined || /Chrome\//.test(ua)
  let notificationsQueryState
  try {
    notificationsQueryState = (await navigator.permissions.query({ name: 'notifications' })).state
  } catch (error) {
    notificationsQueryState = `error: ${error.message}`
  }
  let webglRenderer = null
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    webglRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null
  } catch (error) {
    webglRenderer = `error: ${error.message}`
  }
  const debug = {
    userAgent: ua,
    brands,
    windowChrome: typeof window.chrome,
    notificationPermission: window.Notification?.permission,
    notificationsQueryState,
    anyPointer: ['fine', 'coarse', 'none'].filter(p => matchMedia(`(any-pointer: ${p})`).matches),
    screen: `${screen.width}x${screen.height}`,
    plugins: navigator.plugins.length,
    pdfViewerEnabled: navigator.pdfViewerEnabled,
    webglRenderer,
  }

  addSignalsDetection('headless', [
    (ua.includes('HeadlessChrome') || brands.includes('HeadlessChrome')) && {
      rating: 1,
      note: '<code>HeadlessChrome</code> is in the user agent or <code>navigator.userAgentData.brands</code>.',
    },
    isChromium && isDesktop && typeof window.chrome === 'undefined' && {
      rating: 1,
      note: '<code>window.chrome</code> is missing. Desktop Chrome always has it; <code>chrome-headless-shell</code> (Playwright\'s default headless mode, Puppeteer <code>headless: \'shell\'</code>) doesn\'t.',
    },
    window.Notification?.permission === 'denied' && notificationsQueryState === 'prompt' && {
      rating: 1,
      note: '<code>Notification.permission</code> is <code>denied</code> while <code>navigator.permissions.query()</code> says <code>prompt</code>. Only <code>chrome-headless-shell</code> answers like that.',
    },
    isDesktop && debug.anyPointer.length === 1 && debug.anyPointer[0] === 'none' && {
      rating: 0.5,
      note: 'No pointing device: <code>(any-pointer: none)</code> matches on a desktop user agent. That\'s the headless default, but a desktop without a mouse looks the same.',
    },
    screen.width === 800 && screen.height === 600 && {
      rating: 0.5,
      note: 'Screen is 800x600, the default screen size of headless Chrome (and of some virtual machines).',
    },
    // Chrome 138+ has no automatic SwiftShader fallback for WebGL
    chromiumMajorVersion() >= 138 && /SwiftShader/i.test(webglRenderer || '') && {
      rating: 0.5,
      note: 'WebGL is rendered by SwiftShader (software). Current Chrome only does that in headless mode or with <code>--enable-unsafe-swiftshader</code>, which Playwright adds.',
    },
  ], 'No signs of headless Chrome.', debug)
}

function testPlatformMismatch() {
  const ua = navigator.userAgent
  const uaOs = osFromUserAgent(ua)
  const platformOs = osFamilyFromPlatform(navigator.platform)
  const uad = navigator.userAgentData
  const uadOs = uad?.platform || null
  const uaMajor = ua.match(/Chrome\/(\d+)/)?.[1]
  const brandMajor = uad?.brands.find(b => b.brand === 'Chromium')?.version
  // apps with a custom WebView user agent can hit the next two checks without automation
  const uaOverrideRating = isMobileUserAgent() ? 0.5 : 1
  const claimsWindows = [uaOs, platformOs, uadOs].includes('Windows')
  // Idea by heydryft: Chrome 138+ resolves CSS ActiveText to pure red from its built-in palette on Linux and
  // macOS, while on Windows the light palette takes the system hotlight colour (rgb(0, 102, 204) by default)
  const activeTextLight = getSystemColor('ActiveText', 'light')
  const debug = {
    userAgent: ua,
    'navigator.platform': navigator.platform,
    'userAgentData.platform': uadOs,
    'userAgentData.brands': uad?.brands,
    activeTextLight,
  }

  addSignalsDetection('platformMismatch', [
    uaOs && platformOs && osFamily(uaOs) !== platformOs && {
      rating: 1,
      note: `User agent says ${uaOs}, but <code>navigator.platform</code> is <code>${navigator.platform}</code>. Overriding the user agent doesn't change <code>navigator.platform</code>.`,
    },
    uaOs && uadOs && osFamily(uaOs) !== osFamily(uadOs) && {
      rating: 1,
      note: `User agent says ${uaOs}, but <code>navigator.userAgentData.platform</code> is <code>${uadOs}</code>.`,
    },
    uad && uad.brands.length === 0 && {
      rating: uaOverrideRating,
      note: '<code>navigator.userAgentData.brands</code> is empty. That happens when the user agent is overridden without <code>userAgentMetadata</code>, e.g. Puppeteer <code>page.setUserAgent(string)</code>.',
    },
    uaMajor && brandMajor && uaMajor !== brandMajor && {
      rating: uaOverrideRating,
      note: `User agent says Chrome ${uaMajor}, but <code>navigator.userAgentData</code> says Chromium ${brandMajor}.`,
    },
    claimsWindows && chromiumMajorVersion() >= 138 && activeTextLight === 'rgb(255, 0, 0)'
      && !matchMedia('(forced-colors: active)').matches && {
      rating: 0.5,
      note: 'Likely OS spoofing: the browser claims Windows, but CSS <code>ActiveText</code> is pure red, the colour of Chrome\'s built-in palette on Linux and macOS. Chrome on Windows uses the system hotlight colour (only a custom colour theme with a red hotlight looks the same). Spoofing the user agent or <code>navigator.platform</code> doesn\'t change it.',
    },
  ], 'User agent, <code>navigator.platform</code> and client hints agree.', debug)
}

async function testWorkerConsistency() {
  const collect = () => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    languages: navigator.languages,
    hardwareConcurrency: navigator.hardwareConcurrency,
    brands: navigator.userAgentData?.brands,
  })
  let workerValues
  try {
    workerValues = await new Promise((resolve, reject) => {
      const src = `const collect = ${collect.toString()}; postMessage(collect())`
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
      let worker
      try {
        worker = new Worker(url)
      } catch (error) {
        URL.revokeObjectURL(url)
        throw error
      }
      const finish = () => {
        worker.terminate()
        URL.revokeObjectURL(url)
      }
      worker.onmessage = e => {
        finish()
        resolve(e.data)
      }
      worker.onerror = e => {
        finish()
        reject(new Error(e.message || 'worker error'))
      }
      setTimeout(() => {
        finish()
        reject(new Error('timeout'))
      }, 3000)
    })
  } catch (error) {
    addDetection({
      type: 'workerConsistency',
      rating: 0,
      note: 'Cannot start a Web Worker to run this test.',
      debug: { error: error.message },
    })
    return
  }

  const mainValues = collect()
  const normalize = (key, value) => key === 'brands' ? value.map(b => `${b.brand}/${b.version}`).sort() : value
  const differs = keys => keys.filter(key => mainValues[key] != null && workerValues[key] != null
    && JSON.stringify(normalize(key, mainValues[key])) !== JSON.stringify(normalize(key, workerValues[key])))
  const strong = differs(['userAgent', 'platform', 'brands'])
  const soft = differs(['languages', 'hardwareConcurrency'])
  addSignalsDetection('workerConsistency', [
    strong.length > 0 && {
      rating: 1,
      note: `<code>navigator</code> in a Web Worker differs from the page: <code>${strong.join(', ')}</code>. Overrides injected with page scripts (stealth plugins, <code>addInitScript</code>, <code>evaluateOnNewDocument</code>) and some CDP overrides don't reach workers.`,
    },
    soft.length > 0 && {
      rating: 0.5,
      note: `<code>${soft.join(', ')}</code> in a Web Worker differs from the page. Stealth plugins and some CDP overrides (e.g. Playwright <code>locale</code>) cause this, but so can a privacy extension.`,
    },
  ], '<code>navigator</code> in a Web Worker matches the page.', { main: mainValues, worker: workerValues })
}

// pushes tampering reasons for fn; resolves to an automation stack frame if calling fn runs through one
async function inspectNativeFunction(fn, reasons) {
  const source = Function.prototype.toString.call(fn)
  if (!/^function [^(]*\(\) \{\s*\[native code\]\s*\}$/.test(source)) {
    reasons.push(`toString: ${source.slice(0, 80)}`)
  }
  if (Object.prototype.hasOwnProperty.call(fn, 'prototype')) {
    reasons.push('has own prototype')
  }

  // a cyclic __proto__ is caught for a real function, but not through a Proxy
  const proto = Object.getPrototypeOf(fn)
  try {
    Object.setPrototypeOf(fn, Object.create(fn))
    reasons.push('Proxy (cyclic __proto__ not detected)')
  } catch (error) {
    // expected: TypeError: Cyclic __proto__ value
  } finally {
    try {
      if (Object.getPrototypeOf(fn) !== proto) {
        Object.setPrototypeOf(fn, proto)
      }
    } catch (error) {
      reasons.push('prototype restore threw')
    }
  }

  // a native throws (or rejects) from itself; an injected wrapper adds its own frames
  const automationFrameIn = error => String(error?.stack).split('\n').slice(1)
    .find(line => /pptr:|UtilityScript\.|newHandler\.<computed>/.test(line))?.trim().slice(0, 160)
  let result
  try {
    result = fn.call(Object.create(null))
  } catch (error) {
    return automationFrameIn(error)
  }
  if (typeof result?.then === 'function') {
    // promise-returning natives such as permissions.query reject instead of throwing
    return Promise.race([
      Promise.resolve(result).then(() => undefined, automationFrameIn),
      new Promise(resolve => setTimeout(resolve, 1000)),
    ])
  }
  return undefined
}

async function testNativeTampering() {
  const getter = (proto, prop) => Object.getOwnPropertyDescriptor(proto, prop)?.get
  const targets = {
    'Navigator.webdriver': getter(Navigator.prototype, 'webdriver'),
    'Navigator.userAgent': getter(Navigator.prototype, 'userAgent'),
    'Navigator.platform': getter(Navigator.prototype, 'platform'),
    'Navigator.languages': getter(Navigator.prototype, 'languages'),
    'Navigator.plugins': getter(Navigator.prototype, 'plugins'),
    'Navigator.hardwareConcurrency': getter(Navigator.prototype, 'hardwareConcurrency'),
    'Navigator.deviceMemory': getter(Navigator.prototype, 'deviceMemory'),
    'Navigator.vendor': getter(Navigator.prototype, 'vendor'),
    'Navigator.maxTouchPoints': getter(Navigator.prototype, 'maxTouchPoints'),
    'Screen.width': getter(Screen.prototype, 'width'),
    'Screen.height': getter(Screen.prototype, 'height'),
    'Permissions.query': window.Permissions?.prototype.query,
    'WebGLRenderingContext.getParameter': window.WebGLRenderingContext?.prototype.getParameter,
    'WebGL2RenderingContext.getParameter': window.WebGL2RenderingContext?.prototype.getParameter,
    'HTMLCanvasElement.toDataURL': HTMLCanvasElement.prototype.toDataURL,
    'HTMLIFrameElement.contentWindow': getter(HTMLIFrameElement.prototype, 'contentWindow'),
    'Function.toString': Function.prototype.toString,
    'Date.getTimezoneOffset': Date.prototype.getTimezoneOffset,
    'Intl.DateTimeFormat.resolvedOptions': Intl.DateTimeFormat.prototype.resolvedOptions,
  }

  const tampered = {}
  const automationFrames = {}
  for (const [name, fn] of Object.entries(targets)) {
    if (typeof fn !== 'function') {
      continue
    }
    const reasons = []
    try {
      const automationFrame = await inspectNativeFunction(fn, reasons)
      if (automationFrame) {
        automationFrames[name] = automationFrame
      }
    } catch (error) {
      // a native function never makes these checks throw
      reasons.push(`inspection threw: ${error.message}`)
    }
    if (reasons.length) {
      tampered[name] = reasons
    }
  }

  for (const prop of Object.getOwnPropertyNames(navigator)) {
    tampered[`navigator.${prop} (own property)`] = ['defined on the navigator object instead of Navigator.prototype']
  }

  // stealth plugins hand back the parent window for srcdoc iframes
  const iframeSharesRealm = await new Promise(resolve => {
    const iframe = document.createElement('iframe')
    const done = result => {
      clearTimeout(timer)
      iframe.remove()
      resolve(result)
    }
    const timer = setTimeout(() => done(null), 3000)
    iframe.srcdoc = '<p></p>'
    iframe.style.display = 'none'
    iframe.onload = () => {
      try {
        done(iframe.contentWindow.Navigator === window.Navigator)
      } catch (error) {
        done(`error: ${error.message}`)
      }
    }
    document.body.appendChild(iframe)
  })

  const tamperedNames = Object.keys(tampered)
  const automationFrameNames = Object.keys(automationFrames)
  addSignalsDetection('nativeTampering', [
    tamperedNames.length > 0 && {
      rating: 0.5,
      note: `Native functions were replaced or wrapped in a <code>Proxy</code>: <code>${tamperedNames.join(', ')}</code>. Stealth plugins and fingerprint-spoofing extensions do this, and anti-bot scripts look for it.`,
    },
    automationFrameNames.length > 0 && {
      rating: 1,
      note: `Calling <code>${automationFrameNames.join(', ')}</code> runs through injected automation code (<code>pptr:</code>, Playwright <code>UtilityScript</code> or the <code>puppeteer-extra-plugin-stealth</code> proxy handler).`,
    },
    iframeSharesRealm === true && {
      rating: 1,
      note: 'A <code>srcdoc</code> iframe returned the parent window from <code>contentWindow</code>. That\'s the <code>iframe.contentWindow</code> evasion of <code>puppeteer-extra-plugin-stealth</code>.',
    },
  ], 'Native functions look untouched.', { tampered, automationFrames, iframeSharesRealm },
  iframeSharesRealm === false ? undefined : 'Native functions look untouched, but the iframe check couldn\'t finish, so the result is incomplete.')
}

function testMobileEmulation() {
  const ua = navigator.userAgent
  if (!isMobileUserAgent()) {
    addDetection({
      type: 'mobileEmulation',
      rating: -1,
      note: 'Desktop user agent, no mobile emulation detected.',
    })
    return
  }

  const uaOs = osFromUserAgent(ua)
  const debug = {
    userAgent: ua,
    maxTouchPoints: navigator.maxTouchPoints,
    'navigator.platform': navigator.platform,
    'navigator.vendor': navigator.vendor,
    userAgentData: navigator.userAgentData !== undefined,
  }
  addSignalsDetection('mobileEmulation', [
    navigator.maxTouchPoints === 1 && {
      rating: 0.5,
      note: '<code>navigator.maxTouchPoints</code> is 1, the value of CDP touch emulation (Puppeteer <code>page.emulate()</code>, Playwright devices). Most phones report 5; only single-touch screens report 1.',
    },
    navigator.maxTouchPoints === 0 && {
      rating: 0.5,
      note: 'Mobile user agent without any touch support.',
    },
    uaOs === 'iOS' && (navigator.userAgentData !== undefined || navigator.vendor === 'Google Inc.') && {
      rating: 0.5,
      note: 'iPhone/iPad user agent, but the engine is Chromium (<code>navigator.userAgentData</code> or a Google <code>navigator.vendor</code>). Every iOS browser is WebKit.',
    },
    uaOs === 'Android' && /x86|i686/.test(navigator.platform) && {
      rating: 0.5,
      note: `Android user agent with a desktop CPU in <code>navigator.platform</code> (<code>${navigator.platform}</code>). Phones report ARM.`,
    },
  ], 'No signs of mobile emulation.', debug)
}

function testNavigatorWebdriver() {
  let note
  let debug
  if (navigator.webdriver === true) {
    note = '<code>navigator.webdriver = true</code> indicates that browser is automated. Use <code>--disable-blink-features=AutomationControlled</code> switch for Chrome.'
    debug = `typeof navigator.webdriver = ${typeof navigator.webdriver}; navigator.webdriver = ${navigator.webdriver}`
  } else if (typeof navigator.webdriver === 'undefined') {
    note = 'This property shouldn\'t be undefined. You might have it deleted manually.'
    debug = `typeof navigator.webdriver = ${typeof navigator.webdriver}`
  } else if (Object.getOwnPropertyNames(navigator).length !== 0) {
    note = '<code>Object.getOwnPropertyNames(navigator)</code> should return empty array.'
    debug = `Object.getOwnPropertyNames(navigator) = ${JSON.stringify(Object.getOwnPropertyNames(navigator))}`
  } else if (Object.getOwnPropertyDescriptor(navigator, 'webdriver') !== undefined) {
    note = '<code>Object.getOwnPropertyDescriptor(navigator, \'webdriver\')</code> should return undefined.'
    debug = `Object.getOwnPropertyDescriptor(navigator, 'webdriver') = ${Object.getOwnPropertyDescriptor(navigator, 'webdriver')}`
  }

  if (note) {
    addDetection({
      type: 'navigatorWebdriver',
      rating: 1,
      debug,
      note,
    })
  } else {
    addDetection({
      type: 'navigatorWebdriver',
      rating: -1,
      note: 'No webdriver presented.',
    })
  }
}

function testViewport() {
  let note
  const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
  const height = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
  if (width === 800 && height === 600) {
    note = 'Viewport has default Puppeteer values. Use <code>defaultViewport: null</code> in options.'
  } else if (width === 1280 && height === 720) {
    note = 'Viewport has default Playwright values. Use <code>viewport: null</code> in options.'
  }

  const debug = {
    width,
    height,
  }
  if (note) {
    // real windows can have these sizes too, so it's a hint rather than proof
    addDetection({
      type: 'viewport',
      rating: 0.5,
      debug,
      note,
    })
  } else {
    addDetection({
      type: 'viewport',
      rating: -1,
      debug,
      note: 'Viewport is different from default values used in automation libraries.',
    })
  }
}

async function testUseragent() {
  if (typeof navigator.userAgentData === 'undefined') {
    addDetection({
      type: 'useragent',
      rating: 0,
      note: 'Cannot detect Chrome version as navigator.userAgentData is undefined.',
    })
    return
  }

  let rating
  let note
  const debug = {}
  const useragentVersionItems = await navigator.userAgentData.getHighEntropyValues(['fullVersionList']).then(ua => ua.fullVersionList?.filter(item => ['Chromium', 'Google Chrome'].includes(item.brand)) || [])
  debug.useragentVersionItems = useragentVersionItems
  const useragentVersionItemsBrands = useragentVersionItems.map(item => item.brand)

  if (!useragentVersionItems.length) {
    note = 'Cannot detect Chrome version. These tests are designed for Chromium based browsers only.'
    rating = .5
  } else if (useragentVersionItemsBrands.includes('Chromium') && !useragentVersionItemsBrands.includes('Google Chrome')) {
    note = `
    <div>Google Chrome is not presented in <code>navigator.userAgentData</code>. You might be using Google Chrome for Testing which is a red flag.</div>
    <div>Try to specify <code>executablePath</code> and use Google Chrome (stable channel).</div>
    `
    rating = 1
  } else {
    // get latest stable release
    let latestStableRelease
    try {
      const response = await fetch('https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1&offset=0')
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      latestStableRelease = (await response.json())[0]
    } catch (error) {
      console.error('[testUseragent] fetch failed:', error)
      addDetection({
        type: 'useragent',
        rating: 0,
        debug: {
          error: error.message,
        },
        note: 'Cannot fetch the latest stable release of Chrome.',
      })
      return
    }
    const latestStableReleaseVersion = latestStableRelease.version
    debug.latestStableRelease = {
      version: latestStableReleaseVersion,
      date: new Date(latestStableRelease.time),
    }

    // src: https://stackoverflow.com/a/16187766
    const cmpVersions = (a, b) => {
      var i, diff
      var regExStrip0 = /(\.0+)+$/
      var segmentsA = a.replace(regExStrip0, '').split('.')
      var segmentsB = b.replace(regExStrip0, '').split('.')
      var l = Math.min(segmentsA.length, segmentsB.length)

      for (i = 0; i < l; i++) {
        diff = parseInt(segmentsA[i], 10) - parseInt(segmentsB[i], 10)
        if (diff) {
          return diff
        }
      }
      return segmentsA.length - segmentsB.length
    }
    const googleChromeVersion = useragentVersionItems.find(item => item.brand === 'Google Chrome').version
    if (cmpVersions(googleChromeVersion, latestStableReleaseVersion) > 0) {
      note = 'Your Chrome version is higher than the latest stable release. You might be using not Stable channel which is abnormal.'
      rating = .5
    }
  }

  if (note) {
    addDetection({
      type: 'useragent',
      rating,
      debug,
      note,
    })
  } else {
    addDetection({
      type: 'useragent',
      rating: -1,
      debug,
      note: 'Google Chrome version is not higher than the latest stable release version which is fine.',
    })
  }
}

function testCsp() {
  const script = document.createElement('script')
  script.type = 'text/javascript'
  script.src = 'https://www.w3schools.com/js/myScript.js'
  script.onerror = () => {
    addDetection({
      type: 'bypassCsp',
      rating: -1,
      note: 'Content Security Policy (CSP) is enabled, it\'s expected behavior.',
    })
  }
  script.onload = () => {
    addDetection({
      type: 'bypassCsp',
      rating: 1,
      note: 'Content Security Policy (CSP) was ignored, you might use <code>Page.setBypassCSP</code> (Puppeteer) or <code>bypassCSP: true</code> (Playwright). It\'s invalid behavior for a normal browser.',
    })
  }
  document.head.appendChild(script)
}

function testMainWorldExecution() {
  addDetection({
    type: 'mainWorldExecution',
    rating: 0,
    note: 'Call <code>document.getElementsByClassName(\'div\')</code> to trigger this test. If you did and the test wasn\'t triggered, then you\'re running it in an isolated world, which is safe and not detectable.',
  })

  document.getElementsByClassName = (function (original) {
    return function () {
      addDetection({
        type: 'mainWorldExecution',
        rating: 1,
        note: 'You\'ve called <code>document.getElementsByClassName()</code> in the main world. Use <a href="https://github.com/rebrowser/rebrowser-patches" target="_blank">rebrowser-patches</a> to run your scripts in an isolated world.',
        debug: {
          args: Object.values(arguments),
        },
      })
      return original.apply(this, arguments)
    }
  }(document.getElementsByClassName))
}

function testSourceUrl() {
  function testSourceUrlError() {
    const error = new Error('Detection Error')
    let note
    const debug = error.stack.toString()
    if (error.stack.toString().includes('pptr:')) {
      note = 'Error stack contains <code>pptr:</code>. You\'re using unpatched Puppeteer.'
    } else if (error.stack.toString().includes('UtilityScript.')) {
      note = 'Error stack contains <code>UtilityScript.</code>. You\'re using unpatched Playwright.'
    }

    if (note) {
      addDetection({
        type: 'sourceUrlLeak',
        rating: 1,
        note: `${note} ${usePatchesTip}`,
        debug,
      })
    } else {
      addDetection({
        type: 'sourceUrlLeak',
        rating: -1,
        note: 'Error stack doesn\'t contain anything suspicious.',
        debug,
      })
    }
  }

  document.getElementById = (function (original) {
    return function () {
      testSourceUrlError()
      return original.apply(this, arguments)
    }
  })(document.getElementById)

  addDetection({
    type: 'sourceUrlLeak',
    rating: 0,
    note: 'Call <code>document.getElementById(\'detections-json\')</code> to test sourceUrl leak.',
  })
}

function addDetection(data) {
  if (data.rating === undefined) {
    data.rating = 1
  }

  const existingDetection = detections.find(d => d.type === data.type)
  if (existingDetection !== undefined) {
    if (data.once) {
      return
    }

    if (data.rating === existingDetection.rating && data.note === existingDetection.note) {
      // no changes, ignore
      return
    }
  }

  console.log('addDetection', data)

  data.msSinceLoad = parseFloat((window.performance.now() - window.startTime).toFixed(3))
  if (data.replace === false) {
    window.detections.push(data)
  } else {
    const existingIndex = window.detections.findIndex(d => d.type === data.type)
    if (existingIndex === -1) {
      window.detections.push(data)
    } else {
      window.detections[existingIndex] = data
    }
  }

  renderDetections()
}

function renderDetections() {
  const tbody = document.createElement('tbody')

  const addRow = (cols) => {
    const row = tbody.insertRow(-1)
    for (const colNum in cols) {
      const cell = row.insertCell(colNum)
      cell.innerHTML = cols[colNum]
      row.appendChild(cell)
    }
  }

  for (const detection of window.detections) {
    let ratingIcon = '🔴'
    if (detection.rating === 0.5) {
      ratingIcon = '🟡'
    } else if (detection.rating === 0) {
      ratingIcon = '⚪️'
    } else if (detection.rating < 0) {
      ratingIcon = '🟢'
    }

    addRow([
      `<span class="text-nowrap">${ratingIcon} ${detection.type}</span>`,
      `<span class="text-nowrap">${detection.msSinceLoad} ms</span>`,
      `
        ${detection.note}
        ${!detection.debug ? '' : `
          <pre>${typeof detection.debug === 'string' ? detection.debug : JSON.stringify(detection.debug, null, 2)}</pre>
        `}
      `,
    ])
  }

  document.querySelector('#detections-table tbody').replaceWith(tbody)
  document.querySelector('#detections-json').value = JSON.stringify(detections, null, 2)
}

function runAsyncTest(type, test) {
  test().catch(error => {
    addDetection({
      type,
      rating: 0,
      note: 'The test failed to run.',
      debug: { error: String(error?.message || error) },
    })
  })
}

function initTests() {
  window.detections = []
  window.startTime = window.performance.now()
  dummyFnInit()
  testSourceUrl()
  testMainWorldExecution()
  runtimeEnableLeakInit()
  testExposeFunctionLeakInit()
  testNavigatorWebdriver()
  testCsp()
  testViewport()
  runAsyncTest('useragent', testUseragent)
  testPwInitScriptsInit()
  runAsyncTest('headless', testHeadless)
  testPlatformMismatch()
  runAsyncTest('workerConsistency', testWorkerConsistency)
  runAsyncTest('nativeTampering', testNativeTampering)
  testMobileEmulation()
}

function toggleHowTo() {
  document.querySelector('#how-to-run-test').classList.toggle('d-none')
}

async function main() {
  initTests()
}

window.onload = main
